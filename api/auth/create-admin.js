// POST /api/auth/create-admin  { name, username, password }
// Header: Authorization: Bearer <token from /api/auth/login>
//
// Requires the CALLER to already be a logged-in admin. There is no public
// sign-up path for HR/admin accounts anywhere in this app anymore — this
// is the only way a new one gets created, and it's gated.

import { supaAdminFetch } from "../../lib/supabaseAdmin.js";
import { requireRole } from "../../lib/authToken.js";
import bcrypt from "bcryptjs";

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = requireRole(req, ["admin"]);
  if (!caller) return res.status(401).json({ error: "You must be logged in as an admin to do this." });

  const { name, username, password } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Enter a full name." });
  if (!username?.trim()) return res.status(400).json({ error: "Enter a username or email." });
  if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

  try {
    const existing = await supaAdminFetch(
      `app_users?username=eq.${encodeURIComponent(username.trim().toLowerCase())}&select=id`
    );
    if (existing && existing[0]) {
      return res.status(409).json({ error: "That username/email is already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const row = {
      id: uid("usr"),
      username: username.trim().toLowerCase(),
      password_hash: passwordHash,
      role: "admin",
      name: name.trim(),
      employee_id: null,
      created_at: new Date().toISOString(),
    };
    await supaAdminFetch("app_users", { method: "POST", body: JSON.stringify([row]) });

    return res.status(200).json({
      user: { id: row.id, username: row.username, role: row.role, employeeId: null, name: row.name },
    });
  } catch (err) {
    return res.status(500).json({ error: "Couldn't create the account." });
  }
}
