import React, { useState, useEffect, useCallback } from "react";
import { COLORS, SUPABASE_CONFIGURED } from "./lib/constants";
import { todayStr } from "./lib/utils";
import {
  loadEmployees, saveEmployees, loadAttendance, saveAttendanceRecord,
  loadAccounts, recKey,
  loadLeaveTypes, createLeaveType, deleteLeaveType,
  loadLeaveRequests, createLeaveRequest, decideLeaveRequest,
  loadLeaveBalances, saveLeaveBalance,
} from "./lib/db";
import { notifyHR } from "./lib/email";

import Splash from "./components/Splash";
import Login from "./components/Login";
import Shell from "./components/Shell";

import TodayView from "./views/Today";
import LogView from "./views/Log";
import EmployeesView from "./views/Employees";
import ReportsView from "./views/Reports";
import MonthlyReportView from "./views/MonthlyReport";
import EmployeeDashboard from "./views/EmployeeDashboard";
import LeaveApprovalsView from "./views/LeaveApprovals";
import LeaveSummaryView from "./views/LeaveSummary";
import LeaveBalancesView from "./views/LeaveBalances";

export default function App() {
  const [stage, setStage] = useState("boot"); // boot -> login -> entering -> app
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [accountsByEmp, setAccountsByEmp] = useState({});
  const [now, setNow] = useState(new Date());
  const [saveState, setSaveState] = useState("idle");

  const [session, setSession] = useState(null); // {id, username, role, employeeId, name}
  const [tab, setTab] = useState("today");

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState({});

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) { setLoading(false); return; }
    (async () => {
      try {
        const emps = await loadEmployees();
        const att = await loadAttendance();
        const accts = await loadAccounts();
        const byEmp = {};
        accts.forEach(a => { if (a.employeeId) byEmp[a.employeeId] = a; });
        const types = await loadLeaveTypes();
        const requests = await loadLeaveRequests();
        const balances = await loadLeaveBalances();
        setEmployees(emps);
        setAttendance(att);
        setAccountsByEmp(byEmp);
        setLeaveTypes(types);
        setLeaveRequests(requests);
        setLeaveBalances(balances);
      } catch (e) {
        setLoadError(e.message);
      }
      setLoading(false);
    })();
  }, []);

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

  const persistEmployees = useCallback(async (next) => {
    const prev = employees;
    setEmployees(next);
    setSaveState("saving");
    try { await saveEmployees(next, prev); setSaveState("saved"); }
    catch { setSaveState("error"); }
  }, [employees]);

  /* Raw punch — writes to Supabase, no email. Used by both admin quick actions and employee CTAs. */
  const punch = useCallback((empId, action, meta) => {
    const date = todayStr();
    const key = recKey(empId, date);
    const existing = attendance[key] || { type: "office" };
    let rec;
    if (action === "in") rec = { ...existing, checkIn: new Date().toISOString(), type: existing.type === "leave" ? "office" : existing.type || "office" };
    else if (action === "out") rec = { ...existing, checkOut: new Date().toISOString() };
    else if (action === "wfh_in") rec = { ...existing, wfhCheckIn: new Date().toISOString(), type: "wfh", wfhReason: meta?.reason, wfhLocation: meta?.location };
    else if (action === "wfh_out") rec = { ...existing, wfhCheckOut: new Date().toISOString() };
    // Second session — split-shift employees who work a normal day shift
    // and then come back for a shorter second session at night. Only
    // meaningful once the first session's check-out is already in, but we
    // don't hard-block it here (mirrors how "in"/"out" above don't block
    // out-of-order taps either — bad taps get caught on review, not by
    // silently refusing to save).
    else if (action === "second_in") rec = { ...existing, secondCheckIn: new Date().toISOString() };
    else if (action === "second_out") rec = { ...existing, secondCheckOut: new Date().toISOString() };
    else if (action === "leave") rec = { ...existing, type: "leave", checkIn: null, checkOut: null, wfhCheckIn: null, wfhCheckOut: null, secondCheckIn: null, secondCheckOut: null };
    else if (action === "alternate") rec = { ...existing, alternateDay: true };
    else return;

    setAttendance(prev => ({ ...prev, [key]: rec }));
    setSaveState("saving");
    saveAttendanceRecord(empId, date, rec, "web")
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }, [attendance]);

  /* Wrapper used by the employee dashboard — punches, then emails HR. */
  const punchWithNotify = useCallback((empId, action, meta) => {
    punch(empId, action, meta);
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
  }, [punch, employees]);

  const handleLogin = (acct) => {
    setSession(acct);
    setTab("today");
    setStage("entering");
  };
  const handleLogout = () => { setSession(null); setStage("login"); };

  if (!SUPABASE_CONFIGURED) return <ConfigNotice />;
  if (loadError) return <ErrorNotice message={loadError} />;

  if (stage === "boot") return <Splash onDone={() => setStage("login")} />;
  if (stage === "login") return <Login onLogin={handleLogin} />;
  if (stage === "entering") {
    return (
      <Splash
        holdMs={150}
        subtitle={session.role === "admin" ? `Welcome back, ${session.name?.split(" ")[0] || "there"}` : `Hi, ${session.name?.split(" ")[0] || "there"} — have a great day`}
        onDone={() => setStage("app")}
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
      <Shell tab={tab} setTab={setTab} saveState={saveState} account={session} onLogout={handleLogout}>
        {tab === "today" && <TodayView employees={employees} attendance={attendance} now={now} punch={punch} />}
        {tab === "log" && <LogView employees={employees} attendance={attendance} now={now} />}
        {tab === "employees" && (
          <EmployeesView employees={employees} setEmployees={persistEmployees} accounts={accountsByEmp} refreshAccounts={refreshAccounts} />
        )}
        {tab === "reports" && <ReportsView employees={employees} attendance={attendance} now={now} />}
        {tab === "monthly" && <MonthlyReportView employees={employees} attendance={attendance} now={now} />}
        {tab === "leaveApprovals" && (
          <LeaveApprovalsView
            employees={employees}
            leaveTypes={leaveTypes}
            leaveRequests={leaveRequests}
            onDecide={decideLeave}
            onAddType={addLeaveType}
            onRemoveType={removeLeaveType}
          />
        )}
        {tab === "leaveSummary" && (
          <LeaveSummaryView
            employees={employees}
            attendance={attendance}
            leaveRequests={leaveRequests}
            now={now}
          />
        )}
        {tab === "leaveBalances" && (
          <LeaveBalancesView
            employees={employees}
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
