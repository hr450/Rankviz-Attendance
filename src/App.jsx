import React, { useState, useEffect, useCallback } from "react";
import { COLORS, SUPABASE_CONFIGURED } from "./lib/constants";
import { todayStr } from "./lib/utils";
import {
  loadEmployees, saveEmployees, loadAttendance, saveAttendanceRecord,
  loadAccounts, recKey, webPunch, updateEmployeeShift,
  loadLeaveTypes, createLeaveType, deleteLeaveType,
  loadLeaveRequests, createLeaveRequest, decideLeaveRequest,
  loadLeaveBalances, saveLeaveBalance,
  loadPublicHolidays, createPublicHoliday, deletePublicHoliday,
} from "./lib/db";
import { notifyHR } from "./lib/email";

import Splash from "./components/Splash";
import Intro from "./components/Intro";
import Login from "./components/Login";
import Shell from "./components/Shell";

import TodayView from "./views/Today";
import LogView from "./views/Log";
import EmployeesView from "./views/Employees";
import ReportsView from "./views/Reports";
import AttendanceStatsView from "./views/AttendanceStats";
import MonthlyReportView from "./views/MonthlyReport";
import EmployeeDashboard from "./views/EmployeeDashboard";
import LeaveApprovalsView from "./views/LeaveApprovals";
import LeaveSummaryView from "./views/LeaveSummary";
import LeaveBalancesView from "./views/LeaveBalances";
import PublicHolidaysView from "./views/PublicHolidays";

export default function App() {
  const [stage, setStage] = useState("intro"); // intro -> boot -> login -> entering -> app
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [accountsByEmp, setAccountsByEmp] = useState({});
  const [now, setNow] = useState(new Date());
  const [saveState, setSaveState] = useState("idle");

  const [session, setSession] = useState(null); // {id, username, role, employeeId, name}
  const [tab, setTab] = useState("today");

  // Active/Inactive/All filter — controlled from the top bar (see Shell.jsx)
  // and applied to every tab that lists employees, same active/all/inactive
  // rule Employees.jsx already used for its own view.
  const [employeeFilter, setEmployeeFilter] = useState("active");
  const filteredEmployees = employees.filter(e => {
    if (employeeFilter === "active") return e.active !== false;
    if (employeeFilter === "inactive") return e.active === false;
    return true;
  });

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState({});
  const [publicHolidays, setPublicHolidays] = useState([]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) { setLoading(false); return; }
    if (!session) { setLoading(false); return; } // don't fetch protected data before login
    (async () => {
      setLoading(true);
      try {
        // These 7 calls don't depend on each other's results, so fetch them
        // all in parallel instead of one-after-another — this alone was
        // stretching the initial blank-screen wait to roughly the SUM of
        // every call's latency (~5-6s). In parallel it's bounded by the
        // single slowest call instead.
        const [emps, att, accts, types, requests, balances, holidays] = await Promise.all([
          loadEmployees(),
          loadAttendance(),
          loadAccounts(),
          loadLeaveTypes(),
          loadLeaveRequests(),
          loadLeaveBalances(),
          loadPublicHolidays(),
        ]);
        const byEmp = {};
        accts.forEach(a => { if (a.employeeId) byEmp[a.employeeId] = a; });
        setEmployees(emps);
        setAttendance(att);
        setAccountsByEmp(byEmp);
        setLeaveTypes(types);
        setLeaveRequests(requests);
        setLeaveBalances(balances);
        setPublicHolidays(holidays);
      } catch (e) {
        setLoadError(e.message);
      }
      setLoading(false);
    })();
  }, [session]);

  const refreshAccounts = useCallback(async () => {
    const accts = await loadAccounts();
    const byEmp = {};
    accts.forEach(a => { if (a.employeeId) byEmp[a.employeeId] = a; });
    setAccountsByEmp(byEmp);
  }, []);

  const refreshLeaveRequests = useCallback(async () => {
    setLeaveRequests(await loadLeaveRequests());
  }, []);

  const submitLeaveRequest = useCallback(async ({ employeeId, leaveTypeId, leaveTypeName, startDate, endDate, reason }) => {
    const emp = employees.find(e => e.id === employeeId);
    await createLeaveRequest({ employeeId, leaveTypeId, leaveTypeName, startDate, endDate, reason });
    await refreshLeaveRequests();
    notifyHR({
      subject: `RankViz — Leave request from ${emp?.name || "an employee"}`,
      lines: [
        `Employee: ${emp?.name}`,
        `Leave type: ${leaveTypeName}`,
        `From: ${startDate}  To: ${endDate}`,
        reason ? `Reason: ${reason}` : null,
      ].filter(Boolean),
    });
  }, [employees, refreshLeaveRequests]);

  const decideLeave = useCallback(async (request, status) => {
    await decideLeaveRequest(request.id, status, session?.name || session?.username);
    if (status === "approved") {
      // Mark each day in the range as a leave day in attendance.
      let d = new Date(request.startDate);
      const end = new Date(request.endDate);
      while (d <= end) {
        const dateStr = todayStr(d);
        const key = recKey(request.employeeId, dateStr);
        const existing = attendance[key] || {};
        const rec = { ...existing, type: "leave", leaveReason: request.leaveTypeName };
        setAttendance(prev => ({ ...prev, [key]: rec }));
        await saveAttendanceRecord(request.employeeId, dateStr, rec, "web");
        d.setDate(d.getDate() + 1);
      }
    }
    await refreshLeaveRequests();
  }, [attendance, refreshLeaveRequests, session]);

  const addLeaveType = useCallback(async (name) => {
    await createLeaveType(name);
    setLeaveTypes(await loadLeaveTypes());
  }, []);
  const removeLeaveType = useCallback(async (id) => {
    await deleteLeaveType(id);
    setLeaveTypes(await loadLeaveTypes());
  }, []);

  const updateLeaveBalance = useCallback(async (employeeId, balance) => {
    setLeaveBalances(prev => ({ ...prev, [employeeId]: balance }));
    await saveLeaveBalance(employeeId, balance);
  }, []);

  /* Manual HR/admin correction — used by MonthlyReport's per-row Edit
     modal AND its Status-Edit dropdown. Goes through /api/attendance (POST),
     same route as everything else in db.js — that route already does a
     read-merge-write against Supabase server-side (see attendance.js), so
     sending just the changed fields in `patch` (e.g. { manualStatus }) is
     safe and never clobbers untouched columns.
     Previously this hit a separate /api/attendance/edit route that didn't
     persist manual_status at all — saves looked successful (no error) but
     never actually wrote it, so the dropdown silently reverted to "Auto". */
  const saveManualEdit = useCallback(async (employeeId, date, patch) => {
    setSaveState("saving");
    const key = recKey(employeeId, date);
    try {
      await saveAttendanceRecord(employeeId, date, patch, "manual");
      setAttendance(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          ...patch,
          manuallyEdited: true,
          editedBy: session?.name || session?.username || "HR",
          editedAt: new Date().toISOString(),
        },
      }));
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      throw new Error(e.message || "Couldn't save that correction.");
    }
  }, [session]);

  /* Used by Monthly Report's "+ Change shift" option (via MonthlyReportView's
     onUpdateShift prop). Previously this called updateEmployeeShift directly
     from inside the modal, which saved to Supabase fine but never touched
     App's local `employees` state — so computeStatus() kept using the old
     shift until a full page reload. Routing it through here means the local
     state updates immediately, so Late/Present statuses in both Monthly
     Report and the Employees tab recalculate right away. */
  const updateShift = useCallback(async (employeeId, shiftStart, shiftEnd) => {
    setSaveState("saving");
    try {
      await updateEmployeeShift(employeeId, shiftStart, shiftEnd);
      setEmployees(prev => prev.map(e =>
        e.id === employeeId ? { ...e, shiftStart, shiftEnd } : e
      ));
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      throw new Error(e.message || "Couldn't update that shift.");
    }
  }, []);

  const addHoliday = useCallback(async (date, name) => {
    const row = await createPublicHoliday(date, name);
    setPublicHolidays(prev => {
      const next = prev.filter(h => h.date !== date); // on_conflict=date means old entry is replaced
      next.push(row);
      next.sort((a, b) => a.date.localeCompare(b.date));
      return next;
    });
  }, []);
  const removeHoliday = useCallback(async (id) => {
    await deletePublicHoliday(id);
    setPublicHolidays(prev => prev.filter(h => h.id !== id));
  }, []);

  const persistEmployees = useCallback(async (next) => {
    const prev = employees;
    setEmployees(next);
    setSaveState("saving");
    try { await saveEmployees(next, prev); setSaveState("saved"); }
    catch { setSaveState("error"); }
  }, [employees]);

  /* Raw punch — goes through /api/attendance/punch (see lib/db.js webPunch),
     which verifies office actions against the office IP server-side before
     writing to Supabase. Returns { ok: true } or { ok: false, error, code }
     so callers (Today's quick actions, the employee dashboard CTAs) can show
     the person why a punch was rejected instead of it silently vanishing. */
  const punch = useCallback(async (empId, action, meta) => {
    const date = todayStr();
    const key = recKey(empId, date);
    setSaveState("saving");
    try {
      const rec = await webPunch(empId, action, meta);
      setAttendance(prev => ({ ...prev, [key]: rec }));
      setSaveState("saved");
      return { ok: true };
    } catch (e) {
      setSaveState("error");
      return { ok: false, error: e.message, code: e.code };
    }
  }, []);

  /* Wrapper used by the employee dashboard — punches, then emails HR (only on success). */
  const punchWithNotify = useCallback(async (empId, action, meta) => {
    const result = await punch(empId, action, meta);
    if (!result.ok) return result;
    const emp = employees.find(e => e.id === empId);
    const ACTION_LABEL = {
      in: "checked in", out: "checked out", wfh_in: "started working from home",
      wfh_out: "ended their WFH session", leave: "marked leave", alternate: "marked an alternate day",
      second_in: "started their second (night) session", second_out: "ended their second (night) session",
    };
    notifyHR({
      subject: `RankViz — ${emp?.name || "An employee"} ${ACTION_LABEL[action] || "updated attendance"}`,
      lines: [
        `Employee: ${emp?.name}`,
        `Action: ${ACTION_LABEL[action] || action}`,
        `Time: ${new Date().toLocaleString()}`,
        meta?.reason ? `Reason: ${meta.reason}` : null,
        meta?.location ? `Location: ${meta.location}` : null,
      ].filter(Boolean),
    });
    return result;
  }, [punch, employees]);

  useEffect(() => {
    if (stage === "waitingForData" && !loading) setStage("app");
  }, [stage, loading]);

  const handleLogin = (acct) => {
    setSession(acct);
    setTab("today");
    setStage("entering");
  };
  const handleLogout = () => { setSession(null); setStage("login"); };

  if (!SUPABASE_CONFIGURED) return <ConfigNotice />;
  if (loadError) return <ErrorNotice message={loadError} />;

  if (stage === "intro") return <Intro onContinue={() => setStage("boot")} />;
  if (stage === "boot") return <Splash onDone={() => setStage("login")} />;
  if (stage === "login") return <Login onLogin={handleLogin} />;
  if (stage === "entering") {
    return (
      <Splash
        holdMs={150}
        subtitle={session.role === "admin" ? `Welcome back, ${session.name?.split(" ")[0] || "there"}` : `Hi, ${session.name?.split(" ")[0] || "there"} — have a great day`}
        onDone={() => setStage(loading ? "waitingForData" : "app")}
      />
    );
  }
  if (stage === "waitingForData") {
    // Splash's minimum hold time passed, but data is still loading — keep
    // showing the splash a moment longer rather than flashing an empty app.
    return (
      <Splash
        holdMs={0}
        subtitle={session.role === "admin" ? `Welcome back, ${session.name?.split(" ")[0] || "there"}` : `Hi, ${session.name?.split(" ")[0] || "there"} — have a great day`}
        onDone={() => {}}
      />
    );
  }

  if (session.role === "employee") {
    const emp = employees.find(e => e.id === session.employeeId);
    if (!emp) return <ErrorNotice message="Your account isn't linked to an employee record. Ask HR to check your login." />;
    return (
      <EmployeeDashboard
        employee={emp}
        attendance={attendance}
        punch={punchWithNotify}
        now={now}
        onLogout={handleLogout}
        leaveTypes={leaveTypes}
        leaveRequests={leaveRequests.filter(r => r.employeeId === emp.id)}
        onApplyLeave={submitLeaveRequest}
      />
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: COLORS.bg, minHeight: "100vh", color: COLORS.ink }}>
      <Shell
        tab={tab} setTab={setTab} saveState={saveState} account={session} onLogout={handleLogout}
        employeeFilter={employeeFilter} setEmployeeFilter={setEmployeeFilter}
      >
        {tab === "today" && <TodayView employees={filteredEmployees} attendance={attendance} now={now} punch={punch} />}
        {tab === "log" && <LogView employees={filteredEmployees} attendance={attendance} now={now} />}
        {tab === "employees" && (
          <EmployeesView
            employees={employees}
            setEmployees={persistEmployees}
            accounts={accountsByEmp}
            refreshAccounts={refreshAccounts}
            attendance={attendance}
            filter={employeeFilter}
            setFilter={setEmployeeFilter}
          />
        )}
        {tab === "reports" && <ReportsView employees={filteredEmployees} attendance={attendance} now={now} />}
        {tab === "stats" && (
          <AttendanceStatsView
            employees={filteredEmployees}
            attendance={attendance}
            now={now}
            publicHolidays={publicHolidays}
          />
        )}
        {tab === "monthly" && (
          <MonthlyReportView
            employees={filteredEmployees}
            attendance={attendance}
            now={now}
            onSaveEdit={saveManualEdit}
            onUpdateShift={updateShift}
            session={session}
            publicHolidays={publicHolidays}
          />
        )}
        {tab === "holidays" && (
          <PublicHolidaysView
            holidays={publicHolidays}
            onAdd={addHoliday}
            onRemove={removeHoliday}
          />
        )}
        {tab === "leaveApprovals" && (
          <LeaveApprovalsView
            employees={filteredEmployees}
            leaveTypes={leaveTypes}
            leaveRequests={leaveRequests}
            onDecide={decideLeave}
            onAddType={addLeaveType}
            onRemoveType={removeLeaveType}
          />
        )}
        {tab === "leaveSummary" && (
          <LeaveSummaryView
            employees={filteredEmployees}
            attendance={attendance}
            leaveRequests={leaveRequests}
            now={now}
          />
        )}
        {tab === "leaveBalances" && (
          <LeaveBalancesView
            employees={filteredEmployees}
            leaveBalances={leaveBalances}
            onUpdate={updateLeaveBalance}
          />
        )}
      </Shell>
    </div>
  );
}

function ConfigNotice() {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="rv-card" style={{ padding: 28, maxWidth: 460 }}>
        <h2 style={{ marginTop: 0 }}>Connect your database</h2>
        <p style={{ color: COLORS.muted, fontSize: 14.5, lineHeight: 1.6 }}>
          Run <code>supabase_schema.sql</code> in your Supabase project, then paste your Project URL and anon key
          into <code>src/lib/constants.js</code>.
        </p>
      </div>
    </div>
  );
}
function ErrorNotice({ message }) {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="rv-card" style={{ padding: 28, maxWidth: 460 }}>
        <h2 style={{ marginTop: 0, color: COLORS.red }}>Something went wrong</h2>
        <p style={{ color: COLORS.muted, fontSize: 14 }}>{message}</p>
      </div>
    </div>
  );
}