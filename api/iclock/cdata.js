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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Minimum gap (ms) between check-in and a later punch for that later punch
// to count as a real check-out. Anything closer than this is treated as a
// duplicate/double-scan and ignored, leaving check_out empty until a real
// end-of-day punch comes in.
const MIN_CHECKOUT_GAP_MS = 60 * 1000; // 1 minute

// --- Overnight-shift handling -------------------------------------------
// Night-shift staff check in in the evening and check out after midnight.
// Attendance is stored one row per calendar date, so without special
// handling that morning punch looks like a brand-new check-in for the new
// date, leaving yesterday's row stuck on "No checkout" and creating a
// bogus extra row today. To fix this: if an employee has an unclosed
// check-in from the PREVIOUS local (Asia/Karachi) date, and this new punch
// arrives in the early hours (before noon) within a plausible shift length
// of that check-in, treat it as the check-out for yesterday's row instead
// of a new check-in for today.
const OVERNIGHT_MAX_GAP_MS = 16 * 60 * 60 * 1000; // 16 hours
const OVERNIGHT_CUTOFF_LOCAL_HOUR = 12; // punches before local noon are candidates
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

// Normalize the base URL: strip trailing slashes AND strip a trailing
// "/rest/v1" if someone pasted the REST endpoint instead of the bare
// project URL. This makes supabaseFetch immune to either being stored
// in the env var.
function getSupabaseBaseUrl() {
  let base = (SUPABASE_URL || "").trim();
  base = base.replace(/\/+$/, ""); // strip trailing slash(es)
  base = base.replace(/\/rest\/v1$/i, ""); // strip trailing /rest/v1 if present
  base = base.replace(/\/+$/, ""); // strip trailing slash(es) again, just in case
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

function toDateStr(d) {
  return toLocalParts(d).dateStr; // local (Asia/Karachi) calendar date, not UTC
}

// Build the employees.id used for a given device PIN.
function zkIdToEmployeeId(zkUserId) {
  return `emp_zk${zkUserId}`;
}

// Find employee by their device fingerprint PIN, via the encoded id column.
async function findEmployeeByZkId(zkUserId) {
  const empId = zkIdToEmployeeId(zkUserId);
  const rows = await supabaseFetch(
    `employees?id=eq.${encodeURIComponent(empId)}&select=id`
  );
  return rows && rows[0] ? rows[0] : null;
}

// Auto-create a bare employee record from a new fingerprint enrollment.
// HR fills in the real name/department/etc later in the web app.
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
    `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}&select=employee_id,date,check_in,check_out`
  );
  return rows && rows[0];
}

// Apply one punch to the correct attendance row using the agreed rules:
// - if yesterday's row is still open (check_in, no check_out) and this
//   punch lands in the early hours within a plausible shift length of that
//   check_in -> it's the check-out for YESTERDAY's row (overnight shift)
// - else, no row yet for today -> this punch is check_in
// - else, today's row has check_in but no check_out ->
//     - if this punch is at least MIN_CHECKOUT_GAP_MS after check_in, it's check_out
//     - otherwise it's a duplicate/double-scan of the check-in, ignore it
// - else, today's row already has both -> duplicate, ignore
async function applyPunch(employeeId, punchTime) {
  const { dateStr, hour } = toLocalParts(punchTime);

  // --- Overnight-shift check: does yesterday have an open shift this punch could be closing? ---
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
            body: JSON.stringify({ check_out: punchTime.toISOString() }),
          }
        );
        return "overnight_check_out_recorded";
      }
    }
  }
  // --------------------------------------------------------------------------

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
      }),
    });
    return "check_in_recorded";
  }

  if (row.check_in && !row.check_out) {
    const checkInTime = new Date(row.check_in);
    const gapMs = punchTime.getTime() - checkInTime.getTime();

    if (gapMs < MIN_CHECKOUT_GAP_MS) {
      // Same/near-identical punch as check-in (double-scan) -> not a real
      // check-out. Leave check_out empty until a genuine later punch comes in.
      return "duplicate_ignored";
    }

    await supabaseFetch(
      `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}`,
      {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ check_out: punchTime.toISOString() }),
      }
    );
    return "check_out_recorded";
  }

  // Already has both check_in and check_out -> duplicate punch, ignore per your rule
  return "duplicate_ignored";
}

// Parse ATTLOG body: one punch per line, tab-separated: PIN\tTimestamp\tStatus\t...
// Tracks per-line failures so one bad row can't silently swallow the rest.
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

// Parse OPERLOG body: includes lines like "USER PIN=123\tName=John\t..."
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
  // Allow the browser-based history upload tool (and any other client) to call this endpoint.
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

  // Device sends a GET first as a handshake/options check.
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
      // Devices expect a plain "OK" response, not JSON.
      res.status(200).send("OK");
    } catch (err) {
      // Log the REAL reason clearly, but still ack "OK" so the device doesn't retry-storm.
      console.error("zkteco cdata error:", err.message, err.stack);
      res.status(200).send("OK");
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
