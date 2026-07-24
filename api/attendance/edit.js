// api/attendance/edit.js
// Lets the web dashboard (HR) manually create or correct an attendance row.
// Mirrors the supabaseFetch pattern used in api/iclock/cdata.js.
//
// Body (JSON):
//   {
//     employee_id: "emp_zk1001",   // required
//     date: "2026-07-13",           // required, YYYY-MM-DD
//     check_in: "2026-07-13T09:18:00.000Z"  | null,  // ISO string or null to clear
//     check_out: "2026-07-13T18:09:00.000Z" | null,
//     second_check_in: "2026-07-13T15:30:00.000Z" | null,  // split-shift 2nd session
//     second_check_out: "2026-07-13T18:30:00.000Z" | null,
//     notes: "Forgot to check out, corrected by HR", // optional
//     manual_status: "present" | "half" | "wfh" | "short_leave" | "holiday"
//       | "absent" | null,  // optional — HR override from Monthly Report's
//       Status-Edit dropdown; null/"" clears it and goes back to the
//       auto-calculated status
//     edited_by: "tehzeeb zahra"    // required — who made the change, for the audit trail
//   }
//
// This always marks the row manually_edited = true, which cdata.js checks
// before letting a device punch overwrite check_in/check_out (see the
// PATCH note for cdata.js).
//
// second_check_in / second_check_out are optional — omit them entirely
// (don't send the key) to leave the second session untouched. Send them
// explicitly as null to clear that session.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function getAttendanceRow(employeeId, dateStr) {
  const rows = await supabaseFetch(
    `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${dateStr}&select=employee_id,date,check_in,check_out,second_check_in,second_check_out`
  );
  return rows && rows[0];
}

function isValidDateStr(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Same set of values the Status-Edit dropdown offers (see
// lib/constants.js MANUAL_STATUS_OPTIONS on the client) — checked here too
// so a malformed or unexpected value can't get written to the column.
const VALID_MANUAL_STATUSES = [
  "present", "half", "wfh", "short_leave", "holiday", "absent",
];

// Parses manual_status. Returns { ok, value, provided } — `provided` is
// false when the key was omitted entirely (leave the column alone); null
// or "" means "clear the override" (go back to auto-calculated status).
function parseManualStatusField(body) {
  if (!("manual_status" in body)) return { ok: true, value: undefined, provided: false };
  const raw = body.manual_status;
  if (raw === null || raw === "") return { ok: true, value: null, provided: true };
  if (typeof raw !== "string" || !VALID_MANUAL_STATUSES.includes(raw)) {
    return { ok: false, value: null, provided: true };
  }
  return { ok: true, value: raw, provided: true };
}

// Parses one punch field. Returns { ok, date, provided } — `provided` is
// false when the key was omitted from the request body entirely (meaning
// "leave this field alone"), as opposed to explicitly sent as null.
function parsePunchField(body, key) {
  if (!(key in body)) return { ok: true, date: undefined, provided: false };
  const raw = body[key];
  if (raw === null || raw === "") return { ok: true, date: null, provided: true };
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { ok: false, date: null, provided: true };
  return { ok: true, date: d, provided: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server not configured (missing Supabase env vars)" });
    return;
  }

  try {
    const body = req.body || {};
    const { employee_id, date, notes, edited_by } = body;

    // --- Validation ---
    if (!employee_id) {
      res.status(400).json({ error: "employee_id is required" });
      return;
    }
    if (!isValidDateStr(date)) {
      res.status(400).json({ error: "date is required and must be YYYY-MM-DD" });
      return;
    }
    if (!edited_by) {
      res.status(400).json({ error: "edited_by is required (who is making this edit)" });
      return;
    }

    const checkIn = parsePunchField(body, "check_in");
    const checkOut = parsePunchField(body, "check_out");
    const secondCheckIn = parsePunchField(body, "second_check_in");
    const secondCheckOut = parsePunchField(body, "second_check_out");
    const manualStatus = parseManualStatusField(body);

    for (const [name, f] of [
      ["check_in", checkIn], ["check_out", checkOut],
      ["second_check_in", secondCheckIn], ["second_check_out", secondCheckOut],
    ]) {
      if (!f.ok) {
        res.status(400).json({ error: `${name} is not a valid date/time` });
        return;
      }
    }
    if (!manualStatus.ok) {
      res.status(400).json({ error: `manual_status must be one of: ${VALID_MANUAL_STATUSES.join(", ")}, or null` });
      return;
    }

    if (checkIn.date && checkOut.date && checkOut.date.getTime() <= checkIn.date.getTime()) {
      res.status(400).json({ error: "check_out must be after check_in" });
      return;
    }
    if (secondCheckIn.date && secondCheckOut.date && secondCheckOut.date.getTime() <= secondCheckIn.date.getTime()) {
      res.status(400).json({ error: "second_check_out must be after second_check_in" });
      return;
    }

    // Block editing future dates
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) {
      res.status(400).json({ error: "Cannot edit attendance for a future date" });
      return;
    }

    const payload = {
      manually_edited: true,
      edited_by,
      edited_at: new Date().toISOString(),
    };
    // Only touch fields the caller actually sent, so a request that edits
    // just the second session doesn't wipe out the first (or vice versa).
    if (checkIn.provided) payload.check_in = checkIn.date ? checkIn.date.toISOString() : null;
    if (checkOut.provided) payload.check_out = checkOut.date ? checkOut.date.toISOString() : null;
    if (secondCheckIn.provided) payload.second_check_in = secondCheckIn.date ? secondCheckIn.date.toISOString() : null;
    if (secondCheckOut.provided) payload.second_check_out = secondCheckOut.date ? secondCheckOut.date.toISOString() : null;
    if (typeof notes === "string") payload.notes = notes;
    if (manualStatus.provided) payload.manual_status = manualStatus.value;

    const existing = await getAttendanceRow(employee_id, date);

    let result;
    if (existing) {
      result = await supabaseFetch(
        `attendance?employee_id=eq.${encodeURIComponent(employee_id)}&date=eq.${date}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: JSON.stringify(payload),
        }
      );
    } else {
      result = await supabaseFetch("attendance", {
        method: "POST",
        prefer: "return=representation",
        body: JSON.stringify({
          employee_id,
          date,
          source: "manual",
          type: "office",
          ...payload,
        }),
      });
    }

    res.status(200).json({ success: true, record: Array.isArray(result) ? result[0] : result });
  } catch (err) {
    console.error("attendance edit error:", err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
}
