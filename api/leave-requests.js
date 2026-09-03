// POST /api/leave-requests  { leaveTypeId, leaveTypeName, startDate, endDate, reason }
// Header: Authorization: Bearer <token from /api/auth/login or /api/auth/google-login>
//
// The employee a request belongs to is taken from the CALLER'S SESSION
// TOKEN, never from the request body. That's the whole point of this
// route: previously the browser sent employee_id straight to Supabase, so
// anyone could apply for leave in a colleague's name just by changing the
// id. Now the id comes from who they actually signed in as.
//
// Admins are the one exception — HR legitimately applies leave on behalf
// of staff, so they may pass an explicit employeeId.

import { supaAdminFetch } from "../src/lib/supabaseAdmin.js";
import { requireRole } from "../src/lib/authToken.js";

function newId() {
  return "lv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = requireRole(req, ["admin", "employee"]);
  if (!caller) return res.status(401).json({ error: "Please log in." });

  const { leaveTypeId, leaveTypeName, startDate, endDate, reason, employeeId } = req.body || {};

  // An employee can only ever file for themselves. HR/admin may file on
  // someone's behalf, but must say who.
  let targetEmployeeId;
  if (caller.role === "admin") {
    targetEmployeeId = employeeId;
    if (!targetEmployeeId) return res.status(400).json({ error: "Which employee is this leave for?" });
  } else {
    targetEmployeeId = caller.employeeId;
    if (!targetEmployeeId) {
      return res.status(403).json({ error: "Your login isn't linked to an employee profile. Contact HR." });
    }
  }

  if (!leaveTypeName || !startDate || !endDate) {
    return res.status(400).json({ error: "Leave type and dates are required." });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: "End date can't be before the start date." });
  }

  const row = {
    id: newId(),
    employee_id: targetEmployeeId,
    leave_type_id: leaveTypeId || null,
    leave_type_name: leaveTypeName,
    start_date: startDate,
    end_date: endDate,
    reason: reason || null,
    status: "pending",
    created_at: new Date().toISOString(),
  };

  try {
    await supaAdminFetch("leave_requests", { method: "POST", body: JSON.stringify([row]) });
    return res.status(200).json({ request: row });
  } catch (err) {
    console.error("leave-requests error:", err.message);
    return res.status(500).json({ error: "Couldn't submit the leave request. Please try again." });
  }
}
