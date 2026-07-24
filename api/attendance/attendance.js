// GET  /api/attendance                                     — load all attendance (logged-in users)
// POST /api/attendance  { employeeId, date, rec, source }   — save a record (admin only)
// Header: Authorization: Bearer <token from /api/auth/login>
//
// Note: employee self check-in/out already goes through /api/attendance/punch.js
// (IP-restricted). This route is for HR making manual corrections/edits.

import { supaAdminFetch, } from "../lib/supabaseAdmin.js";
import { requireRole } from "../lib/authToken.js";

// PostgREST caps a single request at ~1000 rows — page through with Range headers.
async function supaAdminFetchAll(path, pageSize = 1000) {
  let all = [];
  let from = 0;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  while (true) {
    const to = from + pageSize - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Range: `${from}-${to}`,
      },
    });
    if (!res.ok) throw new Error(`Supabase ${path} failed: ${res.status}`);
    const page = await res.json().catch(() => []);
    all = all.concat(page || []);
    if (!page || page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export default async function handler(req, res) {
  const caller = requireRole(req, ["admin", "employee"]);
  if (!caller) return res.status(401).json({ error: "Please log in." });

  if (req.method === "GET") {
    try {
      const rows = await supaAdminFetchAll("attendance?select=*");
      const map = {};
      (rows || []).forEach(r => {
        map[`${r.employee_id}|${r.date}`] = {
          checkIn: r.check_in, checkOut: r.check_out, type: r.type,
          wfhCheckIn: r.wfh_check_in, wfhCheckOut: r.wfh_check_out,
          secondCheckIn: r.second_check_in, secondCheckOut: r.second_check_out,
          alternateDay: !!r.alternate_day, leaveReason: r.leave_reason || "",
          notes: r.notes || "", manuallyEdited: !!r.manually_edited,
          editedBy: r.edited_by || null, editedAt: r.edited_at || null,
        };
      });
      return res.status(200).json(map);
    } catch (err) {
      return res.status(500).json({ error: "Couldn't load attendance." });
    }
  }

  if (req.method === "POST") {
    if (caller.role !== "admin") return res.status(403).json({ error: "Admin only." });
    const { employeeId, date, rec, source } = req.body || {};
    if (!employeeId || !date || !rec) return res.status(400).json({ error: "Invalid payload." });
    try {
      await supaAdminFetch("attendance?on_conflict=employee_id,date", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([{
          employee_id: employeeId, date,
          check_in: rec.checkIn || null, check_out: rec.checkOut || null,
          type: rec.type || "office", source: source || "web",
          wfh_check_in: rec.wfhCheckIn || null, wfh_check_out: rec.wfhCheckOut || null,
          second_check_in: rec.secondCheckIn || null, second_check_out: rec.secondCheckOut || null,
          alternate_day: !!rec.alternateDay, leave_reason: rec.leaveReason || null,
          manually_edited: true, edited_by: caller.userId, edited_at: new Date().toISOString(),
        }]),
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Couldn't save attendance record." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
