// GET /api/accounts — list login accounts, admin only.
// Returns only non-sensitive fields (id, username, role, employeeId, name) —
// password is never included in the response.
// Header: Authorization: Bearer <token from /api/auth/login>

import { supaAdminFetch } from "../src/lib/supabaseAdmin.js";
import { requireRole } from "../src/lib/authToken.js";

function rowToAccount(r) {
  return { id: r.id, username: r.username, role: r.role, employeeId: r.employee_id, name: r.name };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const caller = requireRole(req, ["admin"]);
  if (!caller) return res.status(401).json({ error: "Please log in." });

  if (req.method === "GET") {
    try {
      const rows = await supaAdminFetch("app_users?select=id,username,role,employee_id,name&order=name.asc");
      return res.status(200).json((rows || []).map(rowToAccount));
    } catch (err) {
      return res.status(500).json({ error: "Couldn't load accounts." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
