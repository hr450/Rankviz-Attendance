import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";
import { uid, todayStr } from "./utils";

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

// PostgREST caps a single request at ~1000 rows by default. Tables that can
// grow past that (attendance, leave_log, etc.) need to be paged through with
// Range headers, or rows beyond the cap silently never reach the app.
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
    if (!page || page.length < pageSize) break; // last page reached
    from += pageSize;
  }
  return all;
}

/* ---------------- Employees ---------------- */
function empToRow(e) {
  return {
    id: e.id, name: e.name, department: e.department,
    employment_type: e.employmentType, shift_start: e.shiftStart, shift_end: e.shiftEnd,
    zk_user_id: e.zkUserId || null,
  };
}
function rowToEmp(r) {
  return {
    id: r.id, name: r.name, department: r.department,
    employmentType: r.employment_type, shiftStart: r.shift_start, shiftEnd: r.shift_end,
    zkUserId: r.zk_user_id || "",
  };
}
export async function loadEmployees() {
  const rows = await supaFetch("employees?select=*&order=name.asc");
  return (rows || []).map(rowToEmp);
}
export async function saveEmployees(next, prev) {
  const nextIds = new Set(next.map(e => e.id));
  const removed = prev.filter(e => !nextIds.has(e.id));
  for (const r of removed) {
    await supaFetch(`employees?id=eq.${encodeURIComponent(r.id)}`, { method: "DELETE" });
  }
  if (next.length) {
    await supaFetch("employees?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(next.map(empToRow)),
    });
  }
}

/* ---------------- Attendance ---------------- */
export async function loadAttendance() {
  const rows = await supaFetchAll("attendance?select=*");
  const map = {};
  (rows || []).forEach(r => {
    map[`${r.employee_id}|${r.date}`] = {
      checkIn: r.check_in, checkOut: r.check_out, type: r.type,
      wfhCheckIn: r.wfh_check_in, wfhCheckOut: r.wfh_check_out,
      // Second session — split-shift employees who work a day shift and
      // then come back for a few extra hours at night.
      secondCheckIn: r.second_check_in, secondCheckOut: r.second_check_out,
      alternateDay: !!r.alternate_day, leaveReason: r.leave_reason || "",
      notes: r.notes || "", manuallyEdited: !!r.manually_edited,
      editedBy: r.edited_by || null, editedAt: r.edited_at || null,
    };
  });
  return map;
}
export async function saveAttendanceRecord(employeeId, date, rec, source) {
  await supaFetch("attendance?on_conflict=employee_id,date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      employee_id: employeeId, date,
      check_in: rec.checkIn || null, check_out: rec.checkOut || null,
      type: rec.type || "office", source: source || "web",
      wfh_check_in: rec.wfhCheckIn || null, wfh_check_out: rec.wfhCheckOut || null,
      second_check_in: rec.secondCheckIn || null, second_check_out: rec.secondCheckOut || null,
      alternate_day: !!rec.alternateDay, leave_reason: rec.leaveReason || null,
    }]),
  });
}

/* ---------------- Web punch (IP-restricted office check-in/out) ----------------
   Office actions (in / out / second_in / second_out) are verified server-side
   against the office network's IP in api/attendance/punch.js — the browser's
   own IP is never trusted for this. WFH / leave / alternate skip that check
   entirely since they're not tied to being physically in the office.
   Throws on rejection (e.g. { code: "OFFICE_IP_REQUIRED" }) so callers can
   show the employee a clear reason instead of silently failing. */
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
  return data.record; // camelCase attendance fields, ready to merge into state
}

/* ---------------- User accounts (admin / employee login) ---------------- */
function rowToAccount(r) {
  return { id: r.id, username: r.username, role: r.role, employeeId: r.employee_id || null, name: r.name || "" };
}
export async function loadAccounts() {
  const rows = await supaFetch("app_users?select=id,username,role,employee_id,name");
  return (rows || []).map(rowToAccount);
}
export async function findAccountByUsername(username) {
  const rows = await supaFetch(`app_users?username=eq.${encodeURIComponent(username.trim().toLowerCase())}&select=*`);
  return (rows && rows[0]) || null;
}
export async function createAdminAccount({ name, username, password }) {
  const existing = await findAccountByUsername(username);
  if (existing) throw new Error("That username/email is already registered.");
  const row = {
    id: uid("usr"), username: username.trim().toLowerCase(), password, role: "admin",
    name, employee_id: null, created_at: new Date().toISOString(),
  };
  await supaFetch("app_users", { method: "POST", body: JSON.stringify([row]) });
  return rowToAccount(row);
}
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
  return rowToAccount(row);
}
export async function verifyLogin(username, password) {
  const row = await findAccountByUsername(username);
  if (!row || row.password !== password) return null;
  return rowToAccount(row);
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
  // ym: "YYYY-MM" — loads only that month's rows to keep payloads small.
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
// Point 2: when a date on this list falls in a report/log, the holiday
// name is shown alongside that day's Notes — automatically, without
// touching the attendance row's actual `notes` field, so it never
// silently overwrites something HR typed in by hand.
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

// No seed/demo employees — the Employees list starts empty. Add real staff
// via the Employees tab, or (once wired up) they'll come in automatically
// from the ZKTeco device sync.
export const SEED_EMPLOYEES = [];

export function recKey(empId, date) {
  return `${empId}|${date}`;
}
export { todayStr };
