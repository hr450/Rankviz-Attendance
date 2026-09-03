// POST /api/auth/google-login   { credential }
//
// Employee sign-in via Google. The browser sends the Google ID token
// (credential) and this route verifies it with Google directly — the
// frontend is never trusted. Only @rankviz.com accounts are accepted,
// and the email must match an existing employee record.

import { OAuth2Client } from "google-auth-library";
import { supaAdminFetch } from "../../src/lib/supabaseAdmin.js";
import { signToken } from "../../src/lib/authToken.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const COMPANY_EMAIL_DOMAIN = "rankviz.com";

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({
      error: "Google sign-in is not configured. GOOGLE_CLIENT_ID is missing.",
    });
  }

  // The Google button may send the token under different keys depending on
  // how the frontend was wired, so accept the common ones.
  const body = req.body || {};
  const credential = body.credential || body.idToken || body.token;

  if (!credential) {
    return res.status(400).json({ error: "Google sign-in token is missing." });
  }

  try {
    // 1) Verify the token with Google (signature + audience + expiry).
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: "Google sign-in could not be verified. Please try again." });
    }

    if (!payload || !payload.email) {
      return res.status(401).json({ error: "Google sign-in could not be verified. Please try again." });
    }

    if (payload.email_verified === false) {
      return res.status(401).json({ error: "This Google account's email is not verified." });
    }

    const email = String(payload.email).trim().toLowerCase();

    // 2) Company domain check. hd (hosted domain) is set for Workspace
    // accounts; the email suffix is checked too as a safety net.
    const domainOk =
      email.endsWith("@" + COMPANY_EMAIL_DOMAIN) &&
      (!payload.hd || payload.hd.toLowerCase() === COMPANY_EMAIL_DOMAIN);

    if (!domainOk) {
      return res.status(403).json({
        error: `Please sign in with your @${COMPANY_EMAIL_DOMAIN} account.`,
      });
    }

    // 3) Match the email to an employee record.
    const employees = await supaAdminFetch(
      `employees?email=eq.${encodeURIComponent(email)}&select=*`
    );
    const employee = employees && employees[0];

    if (!employee) {
      return res.status(403).json({
        error: "No employee record found for this email. Please contact HR.",
      });
    }

    if (employee.status && String(employee.status).toLowerCase() === "inactive") {
      return res.status(403).json({ error: "This employee account is inactive." });
    }

    // 4) If this employee also has an app_users row, reuse its id/role so
    // the rest of the app behaves exactly as it did with password login.
    let linkedUser = null;
    try {
      const users = await supaAdminFetch(
        `app_users?employee_id=eq.${encodeURIComponent(employee.id)}&select=*`
      );
      linkedUser = (users && users[0]) || null;
    } catch {
      linkedUser = null;
    }

    const userId = linkedUser ? linkedUser.id : employee.id;
    const role = linkedUser && linkedUser.role ? linkedUser.role : "employee";

    const token = signToken({
      userId,
      role,
      employeeId: employee.id,
    });

    return res.status(200).json({
      token,
      user: {
        id: userId,
        username: linkedUser ? linkedUser.username : email,
        role,
        employeeId: employee.id,
        name: employee.name || (linkedUser && linkedUser.name) || "",
        email,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Sign-in failed. Please try again." });
  }
}