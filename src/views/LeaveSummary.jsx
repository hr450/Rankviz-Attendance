import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CalendarDays } from "lucide-react";
import { COLORS } from "../lib/constants";
import { computeStatus, todayStr } from "../lib/utils";
import { th, td, StatCard } from "../components/ui";

/* The 4 "request + approval" leave types. Must match the names HR sets up
   in the Leave types panel on the Leave Approvals page exactly. */
const LEAVE_TYPE_LABELS = ["Sick Leave", "Casual Leave", "Annual Leave", "Short Leave"];

// Maps a short leave code (however it was captured — dropdown, manual status,
// or free-typed HR shorthand in Notes) to the same label used in
// LEAVE_TYPE_LABELS, so attendance-based detections land in the right bucket.
const CODE_TO_LABEL = {
  CL: "Casual Leave",
  SL: "Sick Leave",
  AL: "Annual Leave",
  "Short Leave": "Short Leave",
};

// Same detection logic as MonthlyReport's leaveCodeFor(): prefer the
// canonical leaveReason field (set by the Status-Edit dropdown or by the
// Notes-parser), fall back to scanning the Notes text directly for older
// records that were never re-saved.
function leaveCodeFor(rec) {
  // A day marked Short Leave through the Status-Edit dropdown carries it in
  // manualStatus and often says something unrelated in Notes ("WFH", "no check
  // out"), so reading only leaveReason/Notes left those days out of the counts
  // entirely — the row showed "—" while the Monthly Report showed the day.
  if (rec?.manualStatus === "short_leave") return "Short Leave";
  const reason = (rec?.leaveReason || "").toLowerCase();
  const notes = (rec?.notes || "").toLowerCase();
  if (reason.includes("casual") || /\bcl\b/.test(notes)) return "CL";
  if (reason.includes("sick") || /\bsl\b/.test(notes)) return "SL";
  if (reason.includes("annual") || /\bal\b/.test(notes)) return "AL";
  if (reason.includes("short") || /short leave/.test(notes)) return "Short Leave";
  return null;
}

// Every date an approved leave request already covers, per employee — used
// so an attendance-side detection never double-counts a day that's already
// represented by a formal leave request.
function expandDateRange(startDate, endDate) {
  const dates = [];
  let d = new Date(startDate + "T00:00:00");
  const end = new Date((endDate || startDate) + "T00:00:00");
  while (d <= end) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// Leave actually used, in days — the same weighting the yearly leave sheet
// applies, so the two records can be compared without converting anything:
// a full day counts 1, a half day 0.5, a short leave 0.25.
// WFH and No Checkout are deliberately left out: working from home is work,
// and a missing checkout is a data problem, not time off.
const HALF_DAY_WEIGHT = 0.5;
const SHORT_LEAVE_WEIGHT = 0.25;

function leaveDaysFor(row) {
  const full = row.byType["Sick Leave"].length
             + row.byType["Casual Leave"].length
             + row.byType["Annual Leave"].length;
  const days = full
             + row.byType["Short Leave"].length * SHORT_LEAVE_WEIGHT
             + row.halfDays.length * HALF_DAY_WEIGHT;
  return Math.round(days * 100) / 100;
}

// The column shows a whole number, because a table of 2.75 / 11.75 / 18.75 is
// hard to scan. The exact quarter-day figure is kept on the cell's tooltip so
// nothing is lost when someone needs to tie a row back to the leave sheet.
function leaveDaysLabel(days) {
  return Math.round(days);
}

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function LeaveSummaryView({ employees, attendance, leaveRequests, now }) {
  const [expanded, setExpanded] = useState(null);

  const approved = (leaveRequests || []).filter(r => r.status === "approved");
  const today = todayStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Attendance arrives as one flat object keyed "employeeId|date", and the
  // per-employee loop below used to scan the whole of it once for every
  // employee — 60 people against 13,000 records is 800,000 passes on each
  // render, and it grows with every month of history. Grouping once, up
  // front, turns that into a single pass: each employee then reads only
  // their own rows.
  const attendanceByEmployee = useMemo(() => {
    const byEmp = {};
    for (const key in (attendance || {})) {
      const sep = key.indexOf("|");
      if (sep === -1) continue;
      const empId = key.slice(0, sep);
      (byEmp[empId] ||= []).push([key.slice(sep + 1), attendance[key]]);
    }
    return byEmp;
  }, [attendance]);

  const summaries = useMemo(() => {
    return employees.map(emp => {
      const empApproved = approved.filter(r => r.employeeId === emp.id);

      const byType = {};
      LEAVE_TYPE_LABELS.forEach(t => { byType[t] = []; });
      byType.Other = [];

      // Dates already covered by a formal approved leave request — attendance
      // scan below skips these so a day is never counted twice.
      const coveredDates = new Set();
      empApproved.forEach(r => {
        const bucket = LEAVE_TYPE_LABELS.includes(r.leaveTypeName) ? r.leaveTypeName : "Other";
        byType[bucket].push(r);
        expandDateRange(r.startDate, r.endDate).forEach(d => coveredDates.add(d));
      });

      // Half day + No checkout + WFH + CL/SL/AL/Short Leave (attendance-side)
      // are computed straight from attendance, not just from formal requests.
      const halfDays = [];
      const noCheckoutDays = [];
      const wfhDays = [];
      (attendanceByEmployee[emp.id] || []).forEach(([date, rec]) => {
        if (date > today) return;
        const status = computeStatus(emp, rec, date < today, nowMinutes, date);

        // Half Day: catch both the manual override and the auto-computed tone.
        if (rec?.manualStatus === "half" || status?.tone === "half") halfDays.push({ date });
        // Checking the tone alone was not enough: the moment HR sets a status
        // from the dropdown, computeStatus returns that status instead of
        // no_checkout, so an edited day silently dropped out of this count.
        // Read the timestamps directly as well.
        const missedOffice = !!rec?.checkIn && !rec?.checkOut;
        const missedWfh = !!rec?.wfhCheckIn && !rec?.wfhCheckOut;
        if (status?.tone === "no_checkout" || missedOffice || missedWfh) noCheckoutDays.push({ date });
        if (status?.tone === "wfh") wfhDays.push({ date });

        // CL/SL/AL/Short Leave detected from this attendance record (manual
        // dropdown selection, Notes-parser tag, or raw Notes shorthand) —
        // only add it if no approved request already covers this date.
        if (!coveredDates.has(date)) {
          const code = leaveCodeFor(rec);
          if (code) {
            const label = CODE_TO_LABEL[code];
            byType[label].push({
              startDate: date,
              endDate: date,
              reason: rec.notes || "",
              fromAttendance: true,
            });
            coveredDates.add(date);
          }
        }
      });
      halfDays.sort((a, b) => (a.date < b.date ? 1 : -1));
      noCheckoutDays.sort((a, b) => (a.date < b.date ? 1 : -1));
      wfhDays.sort((a, b) => (a.date < b.date ? 1 : -1));
      LEAVE_TYPE_LABELS.forEach(t => {
        byType[t].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
      });

      return { emp, byType, halfDays, noCheckoutDays, wfhDays };
    });
  }, [employees, approved, attendanceByEmployee, today, nowMinutes]);

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
              <th style={th}>Leave used (days)</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((row, i) => {
              const total = leaveDaysFor(row);
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
                    <td style={{ ...td, fontWeight: 700 }} title={`${total} days exactly`}>{leaveDaysLabel(total)}</td>
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
        Sick / Casual / Annual / Short Leave counts come from approved leave requests, plus any matching Status-Edit
        selection or HR Notes shorthand (CL/SL/AL/Short Leave) found on attendance records that aren't already covered
        by a formal request. Half Day, No Checkout, and WFH are calculated automatically from daily check-in/check-out
        records and manual overrides — No Checkout means an employee checked in but never checked out, and is tracked
        separately from Half Day. Click a row to see full dates and reasons.
        <br /><br />
        <strong>Leave used (days)</strong> weights each kind the way the yearly leave sheet does: a full Sick, Casual or
        Annual day counts 1, a half day 0.5, and a short leave 0.25. WFH and No Checkout are excluded — working from
        home is work, and a missing checkout is a record to fix, not time off. The other columns stay as plain counts of
        days, so a row's numbers will not add up to this figure. The number shown is rounded to whole days; hover it to
        see the exact quarter-day figure that matches the leave sheet.
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