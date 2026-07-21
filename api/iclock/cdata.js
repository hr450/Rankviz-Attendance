// api/iclock/cdata.js
// Receives pushes from the ZKTeco K50 (ADMS protocol).
// Two kinds of data land here, distinguished by the "table" query param:
//   - table=ATTLOG   -> attendance punches (tab-separated lines: PIN, timestamp, status, ...)
//   - table=OPERLOG  -> device operation log, includes new fingerprint/user enrollments
//
// The device also does a GET to this same URL first (handshake), expecting "OK".
//
// IMPORTANT: the `employees` table has NO separate zk_user_id column.
// The device's numeric PIN is encoded directly into the employees.id field,
// e.g. device PIN 1001 -> employees.id = "emp_zk1001".
// So "look up by zk id" means "look up employees.id = emp_zk<PIN>".
//
// MANUAL EDITS: HR can hand-correct a row via /api/attendance/edit, which
// sets manually_edited = true, edited_by, edited_at. Device punches are
// NOT blocked by this — a later punch still updates check_in/check_out
// as normal. What changes is that any device write resets
// manually_edited back to false (and clears edited_by/edited_at), since
// the row's current value once again reflects the device rather than
// HR's correction.
//
// SHIFT PATTERNS: there are three patterns —
//   - day shift (~9am-6pm)
//   - night shift (~8pm-5am)
//   - split shift: a day session (~9am-4pm) followed by a SECOND, shorter
//     session at night (~2-3 hours) for the same employee on the same date.
// Day-shift staff who arrive late (e.g. after 12pm) can still check out as
// late as 8-10pm, which overlaps the night shift's check-in window. So
// evening/early-morning punches are classified CONTEXT-AWARE, not by a
// fixed hour cutoff alone, and each date now has TWO independent sessions
// (check_in/check_out, and second_check_in/second_check_out) so a split
// shift's night punches don't get discarded as duplicates of the day
// session that's already closed.
//
// PUNCH CLASSIFICATION (in priority order):
//   1. Evening punch (hour >= EVENING_HOUR, 8pm+):
//        - If there's an open FIRST session (check_in set, no check_out),
//          this punch closes it as the first session's check-out — no
//          matter how late it is. Covers a normal day shift running long.
//        - Else if the FIRST session hasn't started at all today, this is
//          a genuine (first-session) night-shift check-in.
//        - Else (first session already fully closed today) — this is the
//          split-shift case: open the SECOND session's check-in, unless a
//          second session is already open or already used today.
//   2. Early-morning punch (hour === MORNING_HOUR, the 5am hour):
//        - Try closing an open SECOND check-in from YESTERDAY first (the
//          common split-shift-ending case).
//        - Then an open FIRST check-in from YESTERDAY (pure night-shift
//          employees with only one session).
//        - Then an open SECOND check-in from TODAY, then an open FIRST
//          check-in from TODAY (same-day early finish, either session).
//        - If none exist, treat it as a genuine early check-in for today
//          rather than dropping the punch.
//   3. Overnight-shift window — for other early hours (before noon, not
//      hour 5), an open check-in from yesterday (second session first,
//      then first session) can still be closed if the gap is plausible
//      (existing behavior, unchanged, extended to check both sessions).
//   4. Normal same-day logic — the FIRST punch of the day is check_in. A
//      second punch is check_out if later than check_in; if it's
//      EARLIER than the stored check_in (e.g. punches arrived out of
//      order during a historical backfill), it's treated as the real
//      check_in and the old value shifts into check_out. This rule only
//      concerns the FIRST session — daytime punches never touch the
//      second session, which only ever opens from an evening punch.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Minimum gap (ms) between two punches for the later one to count as a
// distinct event rather than a duplicate/double-scan of the same event.
const MIN_CHECKOUT_GAP_MS = 60 * 1000; // 1 minute

// --- Evening / early-morning windows (context-aware, see notes above) ---
const EVENING_HOUR = 20; // 8:00 PM local
const MORNING_HOUR = 5; // 5:00 AM local (the 5:xx hour)
// --------------------------------------------------------------------------

// --- Overnight-shift window (for early hours other than the 5 AM hour) ---
const OVERNIGHT_MAX_GAP_MS = 16 * 60 * 60 * 1000; // 16 hours
const OVERNIGHT_CUTOFF_LOCAL_HOUR = 12; // punches before local noon are candidates to close yesterday's shift

// NOTE: the device timestamp ("YYYY-MM-DD HH:MM:SS") is ALREADY Asia/Karachi
// local time. `new Date(timeStr.replace(" ", "T"))` has no timezone
// designator, so on this (UTC) server it gets parsed with those same digits
// but labeled as UTC. That mislabeling is harmless for computing gaps
// between two punches (both are off by the same constant amount, so
// differences are still correct) — but it means the Date object's UTC
// getters ALREADY give us the real local hour/date. We must NOT add a PKT
// offset on top of that, or we double-shift by +5h, which rolls the date
// forward for any punch at/after 7pm local and silently misfiles it under
// tomorrow's date once the punch-classification rules can't recover it.
function toLocalParts(d) {
  return {
    dateStr: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
  };
}
function prevDateStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
// --------------------------------------------------------------------------

// Fields written whenever a DEVICE punch updates a row. Resetting these
// alongside check_in/check_out marks the row as reflecting the device
// again, not a prior manual correction.
const DEVICE_WRITE_RESET_FIELDS = {
  manually_edited: false,
  edited_by: null,
  edited_at: null,
};

// Column-name pairs for the two sessions a single day can now have.
const SESSION_FIELDS = {
  first: { in: "check_in", out: "check_out" },
  second: { in: "second_check_in", out: "second_check_out" },
};

function getSupabaseBaseUrl() {
  let base = (SUPABASE_URL || "").trim();
  base = base.replace(/\/+$/, "");
  base = base.replace(/\/rest\/v1$/i, "");
  base = base.replace(/\/+$/, "");
  return base;
}

async function supabaseFetch(path, options = {}) {
  const base = getSupabaseBaseUrl();
  const fullUrl = `${base}/rest/v1/${path}`;
  console.log("zkteco DEBUG supabaseFetch URL:", JSON.stringify(fullUrl));
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${path} failed: ${res.status} ${text}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function zkIdToEmployeeId(zkUserId) {
  return `emp_zk${zkUserId}`;
}

async function findEmployeeByZkId(zkUserId) {
  const empId = zkIdToEmployeeId(zkUserId);
  const rows = await supabaseFetch(
    `employees?id=eq.${encodeURIComponent(empId)}&select=id,shift_start,shift_end`
  );
  return rows && rows[0] ? rows[0] : null;
}

// How much slack past shift_end before we stop trusting a "first punch of
// the day" as a genuine check-in. Generous on purpose — this only exists to
// catch the clearly-wrong cases (e.g. someone's only punch of the day is
// well into the evening), not to second-guess every late arrival.
const LATE_FIRST_PUNCH_BUFFER_MIN = 120; // 2 hours past shift_end

// Returns a human-readable flag string if `punchTime` looks too late to
// plausibly be a genuine FIRST check-in for this employee (i.e. it's more
// likely a checkout with a missed/lost check-in earlier in the day), or
// null if it looks like a normal check-in. We still SAVE the punch either
// way (a device event should never be silently dropped) — this only
// changes whether it's saved silently or flagged for HR to review/correct
// via /api/attendance/edit.
function lateFirstPunchFlag(employee, punchTime) {
  if (!employee || !employee.shift_end) return null;
  const [endH, endM] = employee.shift_end.split(":").map(Number);
  if (Number.isNaN(endH) || Number.isNaN(endM)) return null;

  const local = toLocalParts(punchTime);
  const punchMinutes = local.hour * 60 + punchTime.getUTCMinutes();
  const shiftEndMinutes = endH * 60 + endM;

  if (punchMinutes >= shiftEndMinutes + LATE_FIRST_PUNCH_BUFFER_MIN) {
    return `Auto-flag: first punch today was ${employee.shift_end ? `well after shift end (${employee.shift_end})` : "unusually late"} with no prior check-in — likely a missed check-in, not a real one. Review and correct via Monthly Report.`;
  }
  return null;
}

async function autoCreateEmployee(zkUserId, deviceName) {
  const id = zkIdToEmployeeId(zkUserId);
  await supabaseFetch("employees", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify({
      id,
      name: deviceName && deviceName.trim() ? deviceName.trim() : `New Employee (${zkUserId})`,
      department: "Unassigned",
    }),
  });
  return id;
}

async function getAttendanceRow(employeeId, dateStr) {
  const rows = await supabaseFetch(
    `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}&select=employee_id,date,check_in,check_out,second_check_in,second_check_out,manually_edited`
  );
  return rows && rows[0];
}

// Try to close an open check-in on `session` ("first" | "second") for the
// row on `dateStr`. Returns "closed", "duplicate" (punch too close to the
// check-in to be real), or "none" (no open check-in on that session).
async function closeOpenSession(employeeId, dateStr, punchTime, session) {
  const { in: inField, out: outField } = SESSION_FIELDS[session];
  const row = await getAttendanceRow(employeeId, dateStr);
  if (row && row[inField] && !row[outField]) {
    const gapMs = punchTime.getTime() - new Date(row[inField]).getTime();
    if (gapMs >= MIN_CHECKOUT_GAP_MS) {
      await supabaseFetch(
        `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}`,
        {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({
            [outField]: punchTime.toISOString(),
            ...DEVICE_WRITE_RESET_FIELDS,
          }),
        }
      );
      return "closed";
    }
    return "duplicate";
  }
  return "none";
}

// Record `punchTime` as a check-in on `session` ("first" | "second") for
// `dateStr`. If that session already has a check-in today, this is treated
// as a duplicate scan rather than overwritten.
async function recordSessionCheckIn(employeeId, dateStr, punchTime, session, employee) {
  const { in: inField } = SESSION_FIELDS[session];
  const row = await getAttendanceRow(employeeId, dateStr);

  // Only the FIRST session's opening check-in can plausibly be mistaken for
  // a missed checkout — the second session only ever opens after the first
  // is already closed, so there's already a same-day check-in on record.
  const flag = session === "first" ? lateFirstPunchFlag(employee, punchTime) : null;

  if (!row) {
    await supabaseFetch("attendance", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({
        employee_id: employeeId,
        date: dateStr,
        [inField]: punchTime.toISOString(),
        source: "device",
        type: "office",
        ...(flag ? { notes: flag } : {}),
        ...DEVICE_WRITE_RESET_FIELDS,
      }),
    });
    return flag ? `${session}_check_in_recorded_flagged` : `${session}_check_in_recorded`;
  }

  if (!row[inField]) {
    await supabaseFetch(
      `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}`,
      {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          [inField]: punchTime.toISOString(),
          ...(flag ? { notes: flag } : {}),
          ...DEVICE_WRITE_RESET_FIELDS,
        }),
      }
    );
    return flag ? `${session}_check_in_recorded_flagged` : `${session}_check_in_recorded`;
  }

  return "duplicate_ignored";
}

async function applyPunch(employeeId, punchTime, employee) {
  const { dateStr, hour } = toLocalParts(punchTime);

  // --- Rule 1: evening punch (8pm+) — context-aware -----------------------
  if (hour >= EVENING_HOUR) {
    // a) An open first session (day shift running long, or a night-shift
    //    check-in from earlier this evening) — close it.
    const firstResult = await closeOpenSession(employeeId, dateStr, punchTime, "first");
    if (firstResult === "closed") return "check_out_recorded";
    if (firstResult === "duplicate") return "duplicate_ignored";

    // b) First session hasn't started today at all — genuine (first-
    //    session) night-shift check-in. Flagged if it's suspiciously late
    //    for this employee's usual shift (see lateFirstPunchFlag) — most
    //    often this means they forgot to check in earlier and this evening
    //    scan was actually meant as their checkout.
    const row = await getAttendanceRow(employeeId, dateStr);
    if (!row || !row.check_in) {
      return await recordSessionCheckIn(employeeId, dateStr, punchTime, "first", employee);
    }

    // c) First session already fully closed today (check_in + check_out
    //    both set) — this is the split-shift case. Open the second
    //    session, unless one is already open or already used today.
    if (row.check_in && row.check_out) {
      if (!row.second_check_in) {
        return await recordSessionCheckIn(employeeId, dateStr, punchTime, "second");
      }
      // Second session already open or already closed today — don't
      // silently overwrite it; treat as a duplicate/extra scan.
      return "duplicate_ignored";
    }

    return "duplicate_ignored";
  }

  // --- Rule 2: early-morning punch (5am hour) — ALWAYS a checkout ---------
  // Business rule: a night session always ends around 5am, so a 5am punch
  // is never a check-in. Tries the second session first (the common
  // split-shift-ending case), then the first session, on yesterday and
  // then today. If nothing is open anywhere, the punch is dropped rather
  // than starting a bogus check-in.
  if (hour === MORNING_HOUR) {
    const yDateStr = prevDateStr(dateStr);

    for (const [when, ds] of [["yesterday", yDateStr], ["today", dateStr]]) {
      for (const session of ["second", "first"]) {
        const result = await closeOpenSession(employeeId, ds, punchTime, session);
        if (result === "closed") {
          return when === "yesterday" ? "overnight_check_out_recorded" : "check_out_recorded";
        }
        if (result === "duplicate") return "duplicate_ignored";
      }
    }

    // Nothing open to close anywhere -> drop the punch, do NOT create a
    // check-in at 5am.
    console.log(
      `zkteco: 5am punch for ${employeeId} on ${dateStr} had no open check-in to close — ignored`
    );
    return "unmatched_checkout_ignored";
  }

  // --- Rule 3: overnight-shift window for other early hours ---------------
  if (hour < OVERNIGHT_CUTOFF_LOCAL_HOUR) {
    const yDateStr = prevDateStr(dateStr);
    for (const session of ["second", "first"]) {
      const { in: inField, out: outField } = SESSION_FIELDS[session];
      const yRow = await getAttendanceRow(employeeId, yDateStr);
      if (yRow && yRow[inField] && !yRow[outField]) {
        const gapMs = punchTime.getTime() - new Date(yRow[inField]).getTime();
        if (gapMs >= MIN_CHECKOUT_GAP_MS && gapMs <= OVERNIGHT_MAX_GAP_MS) {
          await supabaseFetch(
            `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${yDateStr}`,
            {
              method: "PATCH",
              prefer: "return=minimal",
              body: JSON.stringify({
                [outField]: punchTime.toISOString(),
                ...DEVICE_WRITE_RESET_FIELDS,
              }),
            }
          );
          return "overnight_check_out_recorded";
        }
      }
    }
  }
  // --------------------------------------------------------------------------

  // --- Rule 4: normal same-day logic, order-corrected (first session only) -
  const row = await getAttendanceRow(employeeId, dateStr);

  if (!row) {
    const flag = lateFirstPunchFlag(employee, punchTime);
    await supabaseFetch("attendance", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({
        employee_id: employeeId,
        date: dateStr,
        check_in: punchTime.toISOString(),
        source: "device",
        type: "office",
        ...(flag ? { notes: flag } : {}),
        ...DEVICE_WRITE_RESET_FIELDS,
      }),
    });
    return flag ? "check_in_recorded_flagged" : "check_in_recorded";
  }

  if (row.check_in && !row.check_out) {
    const checkInTime = new Date(row.check_in);
    const gapMs = punchTime.getTime() - checkInTime.getTime();
    const absGapMs = Math.abs(gapMs);

    if (absGapMs < MIN_CHECKOUT_GAP_MS) {
      // Same/near-identical punch as check-in (double-scan).
      return "duplicate_ignored";
    }

    if (gapMs > 0) {
      // Later than the stored check_in -> genuinely a check-out.
      await supabaseFetch(
        `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}`,
        {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({
            check_out: punchTime.toISOString(),
            ...DEVICE_WRITE_RESET_FIELDS,
          }),
        }
      );
      return "check_out_recorded";
    }

    // Earlier than the stored check_in -> this punch actually happened
    // first (e.g. arrived out of order from a historical backfill). It's
    // the real check_in; shift the old value into check_out.
    await supabaseFetch(
      `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}`,
      {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          check_in: punchTime.toISOString(),
          check_out: row.check_in,
          ...DEVICE_WRITE_RESET_FIELDS,
        }),
      }
    );
    return "check_in_corrected_out_of_order";
  }

  if (!row.check_in) {
    const flag = lateFirstPunchFlag(employee, punchTime);
    await supabaseFetch(
      `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}`,
      {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          check_in: punchTime.toISOString(),
          ...(flag ? { notes: flag } : {}),
          ...DEVICE_WRITE_RESET_FIELDS,
        }),
      }
    );
    return flag ? "check_in_recorded_flagged" : "check_in_recorded";
  }

  // Already has both check_in and check_out -> duplicate punch, ignore.
  return "duplicate_ignored";
}

async function handleAttlog(body) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  let processed = 0;
  const errors = [];

  for (const line of lines) {
    try {
      const parts = line.split("\t");
      const pin = parts[0];
      const timeStr = parts[1]; // "YYYY-MM-DD HH:MM:SS"
      if (!pin || !timeStr) continue;

      const punchTime = new Date(timeStr.replace(" ", "T"));
      if (isNaN(punchTime.getTime())) continue;

      let employee = await findEmployeeByZkId(pin);
      if (!employee) {
        const newId = await autoCreateEmployee(pin, null);
        employee = { id: newId };
      }
      await applyPunch(employee.id, punchTime, employee);
      processed++;
    } catch (lineErr) {
      errors.push({ line, message: lineErr.message });
      console.error("zkteco ATTLOG line error:", line, lineErr);
    }
  }

  console.log(
    `zkteco ATTLOG: ${processed}/${lines.length} lines processed, ${errors.length} errors`
  );
  return { processed, total: lines.length, errors };
}

async function handleOperlog(body) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      if (!line.startsWith("USER")) continue;
      const pinMatch = line.match(/PIN=(\S+)/);
      const nameMatch = line.match(/Name=([^\t]+)/);
      if (!pinMatch) continue;
      const pin = pinMatch[1];
      const name = nameMatch ? nameMatch[1] : null;

      const existing = await findEmployeeByZkId(pin);
      if (!existing) {
        await autoCreateEmployee(pin, name);
      }
    } catch (lineErr) {
      console.error("zkteco OPERLOG line error:", line, lineErr);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("zkteco cdata: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
    res.status(500).send("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
    return;
  }

  if (req.method === "GET") {
    res.status(200).send("OK");
    return;
  }

  if (req.method === "POST") {
    try {
      const table = (req.query.table || "").toUpperCase();
      let body = req.body;
      if (Buffer.isBuffer(body)) body = body.toString("utf8");
      if (typeof body !== "string") body = String(body || "");

      if (table === "ATTLOG") {
        await handleAttlog(body);
      } else if (table === "OPERLOG") {
        await handleOperlog(body);
      } else {
        console.log(`zkteco cdata: unrecognized table param "${table}", ignoring body`);
      }
      res.status(200).send("OK");
    } catch (err) {
      console.error("zkteco cdata error:", err.message, err.stack);
      res.status(200).send("OK");
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
