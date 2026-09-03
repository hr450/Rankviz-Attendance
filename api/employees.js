// GET  /api/employees                     — list employees (any logged-in user)
// POST /api/employees  { next: [...], prev: [...] }  — save changes (admin only)
// Header: Authorization: Bearer <token from /api/auth/login>

import { supaAdminFetch } from "../src/lib/supabaseAdmin.js";
import { requireRole } from "../src/lib/authToken.js";

function empToRow(e) {
  return {
    id: e.id, name: e.name, department: e.department,
    employment_type: e.employmentType, shift_start: e.shiftStart, shift_end: e.shiftEnd,
    // null (not 0) means "use the app-wide GRACE_MIN default" — only a real
    // number here overrides it for this specific employee.
    grace_minutes: (e.graceMinutes !== undefined && e.graceMinutes !== null && e.graceMinutes !== "")
      ? Number(e.graceMinutes) : null,
    zk_user_id: e.zkUserId || null, active: e.active !== false,
    // Their @rankviz.com Google Workspace email — this is what "Sign in
    // with Google" matches against to identify which employee is logging
    // in, so an employee can only ever punch in/apply leave as themselves.
    email: e.email ? e.email.trim().toLowerCase() : null,
  };
}
function rowToEmp(r) {
  return {
    id: r.id, name: r.name, department: r.department,
    employmentType: r.employment_type, shiftStart: r.shift_start, shiftEnd: r.shift_end,
    graceMinutes: r.grace_minutes != null ? r.grace_minutes : "",
    zkUserId: r.zk_user_id || "", active: r.active !== false,
    email: r.email || "",
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

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