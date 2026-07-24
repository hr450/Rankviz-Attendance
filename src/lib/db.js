import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";
import { uid, todayStr } from "./utils";

/* ============================================================
   NOTE ON THIS FILE
   ------------------------------------------------------------
   Auth, employees, and attendance now go through our own server
   routes (/api/...) instead of calling Supabase directly from the
   browser. Those routes use the service_role key, which never
   ships to the client, and check the caller's session token before
   returning or changing anything.

   Everything below this note (leave types/requests/balances/log,
   public holidays) still talks to Supabase directly with the anon
   key, same as before. THIS IS THE NEXT THING TO MIGRATE before
   the RLS lockdown SQL is run, or those features will break/stay
   open. Same pattern as employees.js / attendance.js above.
   ============================================================ */

export async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

export async function supaFetchAll(path, pageSize = 1000) {
  let all = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Range: `${from}-${to}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase ${path} failed: ${res.status} ${text}`);
    }
    const page = await res.json().catch(() => []);
    all = all.concat(page || []);
    if (!page || page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/* ---------------- Session token helpers ---------------- */
// The token from /api/auth/login is kept in memory + localStorage so it
// survives a page refresh. It is a signed session token, NOT a password —
// safe to store client-side, same as any other login session.
const TOKEN_KEY = "rv_session_token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch {}
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------------- Employees ---------------- */
export async function loadEmployees() {
  return apiFetch("/api/employees", { method: "GET" });
}
export async function saveEmployees(next, prev) {
  await apiFetch("/api/employees", { method: "POST", body: JSON.stringify({ next, prev }) });
}

// Used by Monthly Report's "Change shift" option in the correction modal.
export async function updateEmployeeShift(employeeId, shiftStart, shiftEnd) {
  // Still direct — TODO: move to a server route alongside employees.js
  // before the RLS lockdown SQL runs.
  await supaFetch(`employees?id=eq.${encodeURIComponent(employeeId)}`, {
    method: "PATCH",
    body: JSON.stringify({ shift_start: shiftStart, shift_end: shiftEnd }),
  });
}

/* ---------------- Attendance ---------------- */
export async function loadAttendance() {
  return apiFetch("/api/attendance", { method: "GET" });
}
export async function saveAttendanceRecord(employeeId, date, rec, source) {
  await apiFetch("/api/attendance", { method: "POST", body: JSON.stringify({ employeeId, date, rec, source }) });
}

/* ---------------- Web punch (IP-restricted office check-in/out) ---------------- */
export async function webPunch(employeeId, action, meta) {
  const res = await fetch("/api/attendance/punch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, action, meta }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Punch failed (${res.status})`);
    err.code = data.code;
    throw err;
  }
  return data.record;
}

/* ---------------- User accounts (admin / employee login) ---------------- */
export async function verifyLogin(username, password) {
  try {
    const data = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    setToken(data.token);
    return data.user;
  } catch {
    return null; // wrong credentials, or request failed — treat both as "login failed"
  }
}

export async function createAdminAccount({ name, username, password }) {
  // Requires the CALLER to already be logged in as admin — enforced server-side.
  // There's no public sign-up path anymore; this is only reachable from an
  // "Add HR Admin" screen inside the dashboard, shown to logged-in admins.
  const data = await apiFetch("/api/auth/create-admin", { method: "POST", body: JSON.stringify({ name, username, password }) });
  return data.user;
}

export function logout() {
  setToken(null);
}

// TODO: upsertEmployeeCredentials still writes directly with the anon key —
// migrate this to a server route (with bcrypt hashing) before RLS lockdown.
export async function upsertEmployeeCredentials({ employeeId, name, username, password }) {
  const rows = await supaFetch(`app_users?employee_id=eq.${encodeURIComponent(employeeId)}&select=id`);
  const existingId = rows && rows[0] && rows[0].id;
  const row = {
    id: existingId || uid("usr"), username: username.trim().toLowerCase(),
    password, role: "employee", name, employee_id: employeeId,
    created_at: new Date().toISOString(),
  };
  await supaFetch("app_users?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
  return { id: row.id, username: row.username, role: row.role, employeeId: row.employee_id, name: row.name };
}

/* ---------------- Leave types (HR-managed) ---------------- */
export async function loadLeaveTypes() {
  const rows = await supaFetch("leave_types?select=*&order=name.asc");
  return (rows || []).map(r => ({ id: r.id, name: r.name }));
}
export async function createLeaveType(name) {
  const row = { id: uid("lt"), name: name.trim() };
  await supaFetch("leave_types", { method: "POST", body: JSON.stringify([row]) });
  return row;
}
export async function deleteLeaveType(id) {
  await supaFetch(`leave_types?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ---------------- Leave requests (employee -> HR) ---------------- */
function rowToLeaveRequest(r) {
  return {
    id: r.id, employeeId: r.employee_id, leaveTypeId: r.leave_type_id,
    leaveTypeName: r.leave_type_name, startDate: r.start_date, endDate: r.end_date,
    reason: r.reason || "", status: r.status, decidedBy: r.decided_by || null,
    decidedAt: r.decided_at || null, createdAt: r.created_at,
  };
}
export async function loadLeaveRequests() {
  const rows = await supaFetch("leave_requests?select=*&order=created_at.desc");
  return (rows || []).map(rowToLeaveRequest);
}
export async function createLeaveRequest({ employeeId, leaveTypeId, leaveTypeName, startDate, endDate, reason }) {
  const row = {
    id: uid("lv"), employee_id: employeeId, leave_type_id: leaveTypeId || null,
    leave_type_name: leaveTypeName, start_date: startDate, end_date: endDate,
    reason: reason || null, status: "pending",
  };
  await supaFetch("leave_requests", { method: "POST", body: JSON.stringify([row]) });
  return rowToLeaveRequest(row);
}
export async function decideLeaveRequest(id, status, decidedBy) {
  await supaFetch(`leave_requests?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, decided_by: decidedBy || null, decided_at: new Date().toISOString() }),
  });
}

/* ---------------- Leave balances (HR-managed, per employee) ---------------- */
function rowToBalance(r) {
  return {
    employeeId: r.employee_id,
    annualAllocated: r.annual_allocated,
    casualAllocated: r.casual_allocated,
    sickAllocated: r.sick_allocated,
    annualRemaining: r.annual_remaining,
    casualRemaining: r.casual_remaining,
    sickRemaining: r.sick_remaining,
  };
}
export async function loadLeaveBalances() {
  const rows = await supaFetch("leave_balances?select=*");
  const map = {};
  (rows || []).forEach(r => { map[r.employee_id] = rowToBalance(r); });
  return map;
}
export async function saveLeaveBalance(employeeId, balance) {
  const row = {
    employee_id: employeeId,
    annual_allocated: balance.annualAllocated,
    casual_allocated: balance.casualAllocated,
    sick_allocated: balance.sickAllocated,
    annual_remaining: balance.annualRemaining,
    casual_remaining: balance.casualRemaining,
    sick_remaining: balance.sickRemaining,
    updated_at: new Date().toISOString(),
  };
  await supaFetch("leave_balances?on_conflict=employee_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
}

/* ---------------- Leave log (manual monthly leave policy grid) ---------------- */
export async function loadLeaveLog(ym) {
  const rows = await supaFetchAll(
    `leave_log?select=employee_id,date,leave_type&date=gte.${ym}-01&date=lte.${ym}-31`
  );
  const map = {};
  (rows || []).forEach(r => { map[`${r.employee_id}|${r.date}`] = r.leave_type; });
  return map;
}
export async function saveLeaveLogEntry(employeeId, date, leaveType) {
  if (!leaveType) {
    await supaFetch(
      `leave_log?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${date}`,
      { method: "DELETE" }
    );
    return;
  }
  await supaFetch("leave_log?on_conflict=employee_id,date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ employee_id: employeeId, date, leave_type: leaveType }]),
  });
}

/* ---------------- Public holidays (manually maintained by HR/admin) ---------------- */
export async function loadPublicHolidays() {
  const rows = await supaFetch("public_holidays?select=*&order=date.asc");
  return (rows || []).map(r => ({ id: r.id, date: r.date, name: r.name }));
}
export async function createPublicHoliday(date, name) {
  const row = { id: uid("hol"), date, name: name.trim() };
  await supaFetch("public_holidays?on_conflict=date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
  return row;
}
export async function deletePublicHoliday(id) {
  await supaFetch(`public_holidays?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}

export const SEED_EMPLOYEES = [];

export function recKey(empId, date) {
  return `${empId}|${date}`;
}
export { todayStr };
