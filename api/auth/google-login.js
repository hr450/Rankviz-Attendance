// POST /api/auth/google-login  { credential }
// "credential" is the Google ID token (a JWT) from the Google Identity
// Services "Sign in with Google" button on the frontend.
//
// This is how employees log in now — no username/password. We verify the
// token's signature with Google (so nobody can fake it), require a
// verified @rankviz.com email, then look up the employee whose `email`
// column matches. That's the whole check: someone can only ever be signed
// in as the employee record that has their own Google Workspace email, so
// they can't check in / apply leave "as" a colleague.
//
// Requires the "google-auth-library" package: npm install google-auth-library
// Requires a GOOGLE_CLIENT_ID env var (same value as lib/constants.js's
// GOOGLE_CLIENT_ID — see that file for where to get it).

import { supaAdminFetch } from "../../src/lib/supabaseAdmin.js";
import { signToken } from "../../src/lib/authToken.js";
import { OAuth2Client } from "google-auth-library";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const COMPANY_EMAIL_DOMAIN = "rankviz.com";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!GOOGLE_CLIENT_ID) {
    console.error("google-login: GOOGLE_CLIENT_ID env var is missing on the server.");
    return res.status(500).json({ error: "Google sign-in isn't configured yet." });
  }

  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: "Missing Google credential." });

  // 1. Verify the token is a genuine, unexpired Google ID token issued for
  //    OUR app (this checks the cryptographic signature against Google's
  //    public keys — a forged/tampered token fails here).
  let payload;
  try {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: "Couldn't verify Google sign-in. Please try again." });
  }

  if (!payload || !payload.email || !payload.email_verified) {
    return res.status(401).json({ error: "Your Google account's email isn't verified." });
  }

  // 2. Must be a real, verified @rankviz.com address — not just anyone
  //    with any Google account.
  const email = payload.email.trim().toLowerCase();
  const domain = email.split("@")[1] || "";
  if (domain !== COMPANY_EMAIL_DOMAIN) {
    return res.status(403).json({ error: `Please sign in with your @${COMPANY_EMAIL_DOMAIN} email, not a personal Google account.` });
  }

  // 3. Match to an employee record. If HR hasn't set this person's email
  //    on their employee profile yet, there's nothing to log them in as.
  try {
    const rows = await supaAdminFetch(`employees?email=eq.${encodeURIComponent(email)}&select=id,name,active`);
    const employee = rows && rows[0];
    if (!employee) {
      return res.status(403).json({ error: "This Google account isn't linked to an employee profile yet. Ask HR to add your email in Employees." });
    }
    if (employee.active === false) {
      return res.status(403).json({ error: "This employee profile is marked inactive. Contact HR." });
    }

    const token = signToken({ userId: employee.id, role: "employee", employeeId: employee.id });
    return res.status(200).json({
      token,
      user: { id: employee.id, username: email, role: "employee", employeeId: employee.id, name: employee.name || "" },
    });
  } catch (err) {
    console.error("google-login error:", err.message);
    return res.status(500).json({ error: "Sign-in failed. Please try again." });
  }
}
