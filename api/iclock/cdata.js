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

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${path} failed: ${res.status} ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
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

// Apply one punch to today's/that day's attendance row using the agreed rules:
// - no row yet -> this punch is check_in
// - row has check_in but no check_out -> this punch is check_out
// - row already has both -> duplicate, ignore
async function applyPunch(employeeId, punchTime) {
  const dateStr = toDateStr(punchTime);
  const existing = await supabaseFetch(
    `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}&select=employee_id,date,check_in,check_out`
  );
  const row = existing && existing[0];

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
