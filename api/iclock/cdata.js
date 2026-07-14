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
// PUNCH CLASSIFICATION (in priority order):
//   1. Hard time-of-day rules — these win no matter what:
//        - hour >= EVENING_CHECKIN_HOUR (8 PM)  -> always a check-in
//        - hour === MORNING_CHECKOUT_HOUR (5 AM) -> always a check-out
//   2. Overnight-shift window — an early-morning punch (before noon, but
//      not exactly 5 AM, which rule 1 already covers) can close an
//      unclosed check-in from the previous day if the gap is plausible.
//   3. Normal same-day logic — the FIRST punch of the day is check_in.
//      A second punch is check_out if it's later than check_in, but if it
//      turns out to be EARLIER than the stored check_in (e.g. punches
//      arrived out of order during a historical backfill), it's treated
//      as the real check_in and the old value is shifted into check_out.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Minimum gap (ms) between two punches for the later one to count as a
// distinct event rather than a duplicate/double-scan of the same event.
const MIN_CHECKOUT_GAP_MS = 60 * 1000; // 1 minute

// --- Hard time-of-day rules ----------------------------------------------
const EVENING_CHECKIN_HOUR = 20; // 8:00 PM local — punches at/after this hour are ALWAYS a check-in
const MORNING_CHECKOUT_HOUR = 5; // 5:00 AM local (the 5:xx hour) — ALWAYS a check-out
// --------------------------------------------------------------------------

// --- Overnight-shift window (for early hours other than the hard 5 AM rule) ---
const OVERNIGHT_MAX_GAP_MS = 16 * 60 * 60 * 1000; // 16 hours
const OVERNIGHT_CUTOFF_LOCAL_HOUR = 12; // punches before local noon are candidates to close yesterday's shift
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Karachi = UTC+5, no DST

function toLocalParts(d) {
  const local = new Date(d.getTime() + PKT_OFFSET_MS);
  return {
    dateStr: local.toISOString().slice(0, 10),
    hour: local.getUTCHours(),
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
    `employees?id=eq.${encodeURIComponent(empId)}&select=id`
  );
  return rows && rows[0] ? rows[0] : null;
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
    `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}&select=employee_id,date,check_in,check_out,manually_edited`
  );
  return rows && rows[0];
}

// Record `punchTime` as a check-in for `dateStr`. If today already has a
// check-in, this is treated as a duplicate scan rather than overwritten.
async function recordCheckIn(employeeId, dateStr, punchTime) {
  const row = await getAttendanceRow(employeeId, dateStr);

  if (!row) {
    await supabaseFetch("attendance", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({
        employee_id: employeeId,
        date: dateStr,
        check_in: punchTime.toISOString(),
        source: "device",
        type: "office",
        ...DEVICE_WRITE_RESET_FIELDS,
      }),
    });
    return "check_in_recorded";
  }

  if (!row.check_in) {
    await supabaseFetch(
      `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}`,
      {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ check_in: punchTime.toISOString(), ...DEVICE_WRITE_RESET_FIELDS }),
      }
    );
    return "check_in_recorded";
  }

  return "duplicate_ignored";
}

// Record `punchTime` as a check-out. Prefers closing an unclosed check-in
// from YESTERDAY (overnight shift ending in the early morning); falls back
// to closing an unclosed check-in from TODAY; if neither exists, the punch
// is logged and dropped rather than inventing a row for it.
async function recordCheckOut(employeeId, dateStr, punchTime) {
  const yDateStr = prevDateStr(dateStr);
  const yRow = await getAttendanceRow(employeeId, yDateStr);
  if (yRow && yRow.check_in && !yRow.check_out) {
    const gapMs = punchTime.getTime() - new Date(yRow.check_in).getTime();
    if (gapMs >= MIN_CHECKOUT_GAP_MS) {
      await supabaseFetch(
        `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${yDateStr}`,
        {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({ check_out: punchTime.toISOString(), ...DEVICE_WRITE_RESET_FIELDS }),
        }
      );
      return "overnight_check_out_recorded";
    }
  }

  const row = await getAttendanceRow(employeeId, dateStr);
  if (row && row.check_in && !row.check_out) {
    const gapMs = punchTime.getTime() - new Date(row.check_in).getTime();
    if (gapMs >= MIN_CHECKOUT_GAP_MS) {
      await supabaseFetch(
        `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}`,
        {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({ check_out: punchTime.toISOString(), ...DEVICE_WRITE_RESET_FIELDS }),
        }
      );
      return "check_out_recorded";
    }
    return "duplicate_ignored";
  }

  console.log(
    `zkteco: 5am check-out punch for ${employeeId} on ${dateStr} had no open check-in to close — ignored`
  );
  return "unmatched_checkout_ignored";
}

async function applyPunch(employeeId, punchTime) {
  const { dateStr, hour } = toLocalParts(punchTime);

  // --- Rule 1: hard time-of-day overrides, checked first, always win ---
  if (hour >= EVENING_CHECKIN_HOUR) {
    return await recordCheckIn(employeeId, dateStr, punchTime);
  }
  if (hour === MORNING_CHECKOUT_HOUR) {
    return await recordCheckOut(employeeId, dateStr, punchTime);
  }
  // ------------------------------------------------------------------------

  // --- Rule 2: overnight-shift window for other early hours ---------------
  if (hour < OVERNIGHT_CUTOFF_LOCAL_HOUR) {
    const yDateStr = prevDateStr(dateStr);
    const yRow = await getAttendanceRow(employeeId, yDateStr);
    if (yRow && yRow.check_in && !yRow.check_out) {
      const gapMs = punchTime.getTime() - new Date(yRow.check_in).getTime();
      if (gapMs >= MIN_CHECKOUT_GAP_MS && gapMs <= OVERNIGHT_MAX_GAP_MS) {
        await supabaseFetch(
          `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${yDateStr}`,
          {
            method: "PATCH",
            prefer: "return=minimal",
            body: JSON.stringify({
              check_out: punchTime.toISOString(),
              ...DEVICE_WRITE_RESET_FIELDS,
            }),
          }
        );
        return "overnight_check_out_recorded";
      }
    }
  }
  // --------------------------------------------------------------------------

  // --- Rule 3: normal same-day logic, order-corrected ---------------------
  const row = await getAttendanceRow(employeeId, dateStr);

  if (!row) {
    await supabaseFetch("attendance", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({
        employee_id: employeeId,
        date: dateStr,
        check_in: punchTime.toISOString(),
        source: "device",
        type: "office",
        ...DEVICE_WRITE_RESET_FIELDS,
      }),
    });
    return "check_in_recorded";
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
      await applyPunch(employee.id, punchTime);
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
