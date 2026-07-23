import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CalendarDays } from "lucide-react";
import { COLORS } from "../lib/constants";
import { computeStatus, todayStr } from "../lib/utils";
import { th, td, StatCard } from "../components/ui";

/* The 4 "request + approval" leave types. Must match the names HR sets up
   in the Leave types panel on the Leave Approvals page exactly. */
const LEAVE_TYPE_LABELS = ["Sick Leave", "Casual Leave", "Annual Leave", "Short Leave"];

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function LeaveSummaryView({ employees, attendance, leaveRequests, now }) {
  const [expanded, setExpanded] = useState(null);

  const approved = (leaveRequests || []).filter(r => r.status === "approved");
  const today = todayStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const summaries = useMemo(() => {
    return employees.map(emp => {
      const empApproved = approved.filter(r => r.employeeId === emp.id);

      const byType = {};
      LEAVE_TYPE_LABELS.forEach(t => { byType[t] = []; });
      byType.Other = [];
      empApproved.forEach(r => {
        const bucket = LEAVE_TYPE_LABELS.includes(r.leaveTypeName) ? r.leaveTypeName : "Other";
        byType[bucket].push(r);
      });

      // Half day + No checkout + WFH are computed straight from attendance, not from requests.
      const halfDays = [];
      const noCheckoutDays = [];
      const wfhDays = [];
      Object.entries(attendance || {}).forEach(([key, rec]) => {
        if (!key.startsWith(`${emp.id}|`)) return;
        const date = key.split("|")[1];
        if (date > today) return;
        const status = computeStatus(emp, rec, date < today, nowMinutes, date);
        if (status?.tone === "half") halfDays.push({ date });
        if (status?.tone === "no_checkout") noCheckoutDays.push({ date });
        if (status?.tone === "wfh") wfhDays.push({ date });
      });
      halfDays.sort((a, b) => (a.date < b.date ? 1 : -1));
      noCheckoutDays.sort((a, b) => (a.date < b.date ? 1 : -1));
      wfhDays.sort((a, b) => (a.date < b.date ? 1 : -1));

      return { emp, byType, halfDays, noCheckoutDays, wfhDays };
    });
  }, [employees, approved, attendance, today, nowMinutes]);

  const totals = LEAVE_TYPE_LABELS.reduce((acc, t) => {
    acc[t] = summaries.reduce((s, row) => s + row.byType[t].length, 0);
    return acc;
  }, {});
  const totalHalf = summaries.reduce((s, row) => s + row.halfDays.length, 0);
  const totalNoCheckout = summaries.reduce((s, row) => s + row.noCheckoutDays.length, 0);
  const totalWfh = summaries.reduce((s, row) => s + row.wfhDays.length, 0);

  return (
    <div className="rv-anim-fadein">
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 18px" }}>Leave Summary</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 22 }}>
        {LEAVE_TYPE_LABELS.map(t => (
          <StatCard key={t} label={t} value={totals[t]} tone="leave" />
        ))}
        <StatCard label="Half Day" value={totalHalf} tone="half" />
        <StatCard label="No Checkout" value={totalNoCheckout} tone="no_checkout" />
        <StatCard label="Work From Home" value={totalWfh} tone="wfh" />
      </div>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Employee</th>
              {LEAVE_TYPE_LABELS.map(t => <th key={t} style={th}>{t}</th>)}
              <th style={th}>Half Day</th>
              <th style={th}>No Checkout</th>
              <th style={th}>WFH</th>
              <th style={th}>Total</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((row, i) => {
              const total = LEAVE_TYPE_LABELS.reduce((s, t) => s + row.byType[t].length, 0) + row.halfDays.length + row.noCheckoutDays.length + row.wfhDays.length;
              const isOpen = expanded === row.emp.id;
              return (
                <React.Fragment key={row.emp.id}>
                  <tr
                    className="rv-row-in"
                    style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 30}ms`, cursor: "pointer" }}
                    onClick={() => setExpanded(isOpen ? null : row.emp.id)}
                  >
                    <td style={td}><strong>{row.emp.name}</strong></td>
                    {LEAVE_TYPE_LABELS.map(t => <td key={t} style={td}>{row.byType[t].length || "—"}</td>)}
                    <td style={td}>{row.halfDays.length || "—"}</td>
                    <td style={td}>{row.noCheckoutDays.length || "—"}</td>
                    <td style={td}>{row.wfhDays.length || "—"}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{total}</td>
                    <td style={td}>{isOpen ? <ChevronUp size={15} color={COLORS.muted} /> : <ChevronDown size={15} color={COLORS.muted} />}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={LEAVE_TYPE_LABELS.length + 5} style={{ padding: 0, background: COLORS.bg }}>
                        <LeaveDetail row={row} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {summaries.length === 0 && (
              <tr><td colSpan={LEAVE_TYPE_LABELS.length + 5} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No employees yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 14 }}>
        Sick / Casual / Annual / Short Leave counts come from approved leave requests. Half Day, No Checkout, and WFH are
        calculated automatically from daily check-in/check-out records — No Checkout means an employee checked in but
        never checked out, and is tracked separately from Half Day. Click a row to see full dates and reasons.
      </p>
    </div>
  );
}

function LeaveDetail({ row }) {
  const sections = [
    ...LEAVE_TYPE_LABELS.map(t => ({
      label: t,
      items: row.byType[t].map(r => ({
        date: r.startDate === r.endDate ? fmtDate(r.startDate) : `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`,
        reason: r.reason,
      })),
    })),
    { label: "Half Day", items: row.halfDays.map(h => ({ date: fmtDate(h.date) })) },
    { label: "No Checkout", items: row.noCheckoutDays.map(h => ({ date: fmtDate(h.date) })) },
    { label: "Work From Home", items: row.wfhDays.map(h => ({ date: fmtDate(h.date) })) },
  ].filter(s => s.items.length > 0);

  if (sections.length === 0) {
    return <p style={{ padding: "12px 20px", color: COLORS.muted, fontSize: 13 }}>No leave records for {row.emp.name}.</p>;
  }

  return (
    <div style={{ padding: "12px 20px 18px", display: "flex", flexWrap: "wrap", gap: 24 }}>
      {sections.map(s => (
        <div key={s.label} style={{ minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: COLORS.navy }}>
            <CalendarDays size={13} /> {s.label} ({s.items.length})
          </div>
          {s.items.map((it, idx) => (
            <div key={idx} style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 3 }}>
              {it.date}{it.reason ? ` — ${it.reason}` : ""}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
