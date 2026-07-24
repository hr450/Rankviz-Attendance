// GET  /api/employees                     — list employees (any logged-in user)
// POST /api/employees  { next: [...], prev: [...] }  — save changes (admin only)
// Header: Authorization: Bearer <token from /api/auth/login>

import { supaAdminFetch } from "../lib/supabaseAdmin.js";
import { requireRole } from "../lib/authToken.js";

function empToRow(e) {
  return {
    id: e.id, name: e.name, department: e.department,
    employment_type: e.employmentType, shift_start: e.shiftStart, shift_end: e.shiftEnd,
    zk_user_id: e.zkUserId || null, active: e.active !== false,
  };
}
function rowToEmp(r) {
  return {
    id: r.id, name: r.name, department: r.department,
    employmentType: r.employment_type, shiftStart: r.shift_start, shiftEnd: r.shift_end,
    zkUserId: r.zk_user_id || "", active: r.active !== false,
  };
}

export default async function handler(req, res) {
  const caller = requireRole(req, ["admin", "employee"]);
  if (!caller) return res.status(401).json({ error: "Please log in." });

  if (req.method === "GET") {
    try {
      const rows = await supaAdminFetch("employees?select=*&order=name.asc");
      return res.status(200).json((rows || []).map(rowToEmp));
    } catch (err) {
      return res.status(500).json({ error: "Couldn't load employees." });
    }
  }

  if (req.method === "POST") {
    if (caller.role !== "admin") return res.status(403).json({ error: "Admin only." });
    const { next, prev } = req.body || {};
    if (!Array.isArray(next) || !Array.isArray(prev)) {
      return res.status(400).json({ error: "Invalid payload." });
    }
    try {
      const nextIds = new Set(next.map(e => e.id));
      const removed = prev.filter(e => !nextIds.has(e.id));
      for (const r of removed) {
        await supaAdminFetch(`employees?id=eq.${encodeURIComponent(r.id)}`, { method: "DELETE" });
      }
      if (next.length) {
        await supaAdminFetch("employees?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(next.map(empToRow)),
        });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Couldn't save employees." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
