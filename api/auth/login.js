// POST /api/auth/login  { username, password }
// Verifies credentials server-side. The password (hash or plain) never
// reaches the browser — only a signed session token + safe user fields do.

import { supaAdminFetch } from "../../lib/supabaseAdmin.js";
import { signToken } from "../../lib/authToken.js";
import bcrypt from "bcryptjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const rows = await supaAdminFetch(
      `app_users?username=eq.${encodeURIComponent(username.trim().toLowerCase())}&select=*`
    );
    const user = rows && rows[0];
    if (!user) return res.status(401).json({ error: "Invalid username or password." });

    // Supports accounts already migrated to bcrypt (password_hash) as well
    // as any not-yet-migrated legacy plaintext rows (password), so login
    // keeps working during the transition. See migration note in README.
    let ok = false;
    if (user.password_hash) {
      ok = await bcrypt.compare(password, user.password_hash);
    } else if (user.password) {
      ok = user.password === password;
      if (ok) {
        // Upgrade this account to a hash on successful legacy login.
        const newHash = await bcrypt.hash(password, 10);
        await supaAdminFetch(`app_users?id=eq.${encodeURIComponent(user.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ password_hash: newHash, password: null }),
        });
      }
    }

    if (!ok) return res.status(401).json({ error: "Invalid username or password." });

    const token = signToken({ userId: user.id, role: user.role, employeeId: user.employee_id || null });
    return res.status(200).json({
      token,
      user: { id: user.id, username: user.username, role: user.role, employeeId: user.employee_id || null, name: user.name || "" },
    });
  } catch (err) {
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
}
