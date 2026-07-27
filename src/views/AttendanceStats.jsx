import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { COLORS } from "../lib/constants";
import { computeStatus, monthKey, daysInMonth, todayStr } from "../lib/utils";
import { StatCard, selectStyle, th, td } from "../components/ui";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMPTY_TOTALS = { present: 0, late: 0, half: 0, wfh: 0, shortLeave: 0, leave: 0, absent: 0, holiday: 0, noCheckout: 0 };

function addTotals(a, b) {
  const out = { ...a };
  for (const k in EMPTY_TOTALS) out[k] = (a[k] || 0) + (b[k] || 0);
  return out;
}

// Org-wide (or per-employee) attendance view — separate from Reports (which
// is always a single month, per employee) and Monthly Report (a single
// employee across a month). This tallies EVERY employee across an entire
// month or an entire year, so HR can see totals like "how many absent days
// did the whole org have in June" or "how did WFH usage change month to
// month this year" at a glance.
export default function AttendanceStatsView({ employees, attendance, now, publicHolidays = [] }) {
  const [viewMode, setViewMode] = useState("monthly"); // monthly | annual
  const [ym, setYm] = useState(monthKey(todayStr(now)));
  const [year, setYear] = useState(now.getFullYear());

  const todayFull = todayStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const shiftMonth = (delta) => {
    const [y, m] = ym.split("-").map(Number);
    setYm(monthKey(todayStr(new Date(y, m - 1 + delta, 1))));
  };

  // Tallies every employee x every day of `monthYm` into per-employee rows
  // plus an org-wide total. Skips days after today (nothing to tally yet).
  const tallyMonth = (monthYm) => {
    const totalDays = daysInMonth(monthYm);
    const perEmployee = employees.map(emp => {
      const t = { ...EMPTY_TOTALS };
      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${monthYm}-${String(day).padStart(2, "0")}`;
        if (dateStr > todayFull) continue;
        const isPast = dateStr < todayFull;
        const rec = attendance[`${emp.id}|${dateStr}`];
        const status = computeStatus(emp, rec, isPast, nowMinutes, dateStr);
        if (status.tone === "present") t.present++;
        else if (status.tone === "late") { t.present++; t.late++; }
        else if (status.tone === "half") t.half++;
        else if (status.tone === "wfh") t.wfh++;
        else if (status.tone === "short_leave") t.shortLeave++;
        else if (status.tone === "leave") t.leave++;
        else if (status.tone === "absent") t.absent++;
        else if (status.tone === "holiday") t.holiday++;
        else if (status.tone === "no_checkout") t.noCheckout++;
      }
      return { emp, ...t };
    });
    const totals = perEmployee.reduce((acc, r) => addTotals(acc, r), { ...EMPTY_TOTALS });
    return { perEmployee, totals };
  };

  const monthly = useMemo(
    () => tallyMonth(ym),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, attendance, ym, todayFull, nowMinutes]
  );

  const annual = useMemo(() => {
    const months = [];
    const currentYm = monthKey(todayFull);
    for (let m = 1; m <= 12; m++) {
      const monthYm = `${year}-${String(m).padStart(2, "0")}`;
      if (monthYm > currentYm) break; // don't compute months that haven't happened yet
      const { totals } = tallyMonth(monthYm);
      months.push({ ym: monthYm, label: MONTH_NAMES[m - 1], ...totals });
    }
    const yearTotals = months.reduce((acc, mo) => addTotals(acc, mo), { ...EMPTY_TOTALS });
    return { months, yearTotals };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, attendance, year, todayFull, nowMinutes]);

  if (employees.length === 0) {
    return <p style={{ color: COLORS.muted }}>No employees to show stats for — check the Employees filter in the top bar, or add employees in the Employees tab.</p>;
  }

  return (
    <div className="rv-anim-fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Attendance Stats</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 3, gap: 2 }}>
            <button onClick={() => setViewMode("monthly")} style={toggleBtn(viewMode === "monthly")}>Monthly</button>
            <button onClick={() => setViewMode("annual")} style={toggleBtn(viewMode === "annual")}>Annual</button>
          </div>
          {viewMode === "monthly" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 10, padding: "6px 10px", border: `1px solid ${COLORS.line}` }}>
              <button onClick={() => shiftMonth(-1)} style={navBtn}><ChevronLeft size={16} /></button>
              <span style={{ fontWeight: 700, fontSize: 14, minWidth: 130, textAlign: "center" }}>
                {new Date(ym + "-01").toLocaleDateString([], { month: "long", year: "numeric" })}
              </span>
              <button onClick={() => shiftMonth(1)} style={navBtn}><ChevronRight size={16} /></button>
            </div>
          ) : (
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...selectStyle, width: "auto" }}>
              {yearOptions(now).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      {viewMode === "monthly"
        ? <MonthlyStats data={monthly} />
        : <AnnualStats data={annual} year={year} />}
    </div>
  );
}

function totalMarkedDays(totals) {
  return Object.keys(EMPTY_TOTALS).reduce((sum, k) => sum + (totals[k] || 0), 0);
}
function pct(value, total) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function StatCardsRow({ totals, employeeCount }) {
  const total = totalMarkedDays(totals);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14, marginBottom: 22 }}>
      <StatCard label="Employees" value={employeeCount} tone="pending" />
      <StatCard label="Present" value={pct(totals.present, total)} tone="present" />
      <StatCard label="Late" value={pct(totals.late, total)} tone="half" />
      <StatCard label="Half day" value={pct(totals.half, total)} tone="half" />
      <StatCard label="WFH" value={pct(totals.wfh, total)} tone="wfh" />
      <StatCard label="Short leave" value={pct(totals.shortLeave, total)} tone="short_leave" />
      <StatCard label="Leave" value={pct(totals.leave, total)} tone="leave" />
      <StatCard label="Absent" value={pct(totals.absent, total)} tone="absent" />
      <StatCard label="Holiday" value={pct(totals.holiday, total)} tone="holiday" />
      <StatCard label="No checkout" value={pct(totals.noCheckout, total)} tone="no_checkout" />
    </div>
  );
}

function MonthlyStats({ data }) {
  const { perEmployee, totals } = data;
  return (
    <>
      <StatCardsRow totals={totals} employeeCount={perEmployee.length} />
      <TotalsBarChart totals={totals} />
    </>
  );
}

/* Simple horizontal bar chart of this month's org-wide totals — replaces
   the old per-employee table so no individual names/data show here. */
const STAT_CHART_LABELS = {
  present: "Present", late: "Late", half: "Half day", wfh: "WFH",
  shortLeave: "Short leave", leave: "Leave", absent: "Absent",
  holiday: "Holiday", noCheckout: "No checkout",
};
const STAT_CHART_COLORS = {
  present: "#2F9E6E", late: "#D99A2B", half: "#5B9CFF", wfh: "#8B6FE0",
  shortLeave: "#2BB6C4", leave: "#6C63FF", absent: "#D9534F",
  holiday: "#94A3C4", noCheckout: "#E8823A",
};

function TotalsBarChart({ totals }) {
  const keys = Object.keys(STAT_CHART_LABELS);
  const max = Math.max(1, ...keys.map(k => totals[k] || 0));
  const total = totalMarkedDays(totals);
  return (
    <div className="rv-card" style={{ padding: "20px 24px" }}>
      <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 700 }}>Attendance breakdown</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {keys.map((k, i) => {
          const value = totals[k] || 0;
          const barWidthPct = Math.round((value / max) * 100); // bar length, relative to the largest stat — purely visual
          return (
            <div key={k} className="rv-row-in" style={{ animationDelay: `${i * 40}ms` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12.5 }}>
                <span style={{ fontWeight: 700, color: COLORS.ink }}>{STAT_CHART_LABELS[k]}</span>
                <span style={{ fontWeight: 700, color: COLORS.muted }}>{pct(value, total)}</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "#F0F2F8", overflow: "hidden" }}>
                <div style={{
                  width: `${barWidthPct}%`, height: "100%", borderRadius: 999,
                  background: STAT_CHART_COLORS[k], transition: "width .5s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnnualStats({ data, year }) {
  const { months, yearTotals } = data;
  return (
    <>
      <StatCardsRow totals={yearTotals} employeeCount={0 /* org total, not a per-employee count in annual view */} />
      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>{year} — month by month (all employees)</h3>
        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Month</th><th style={th}>Present</th><th style={th}>Late</th>
              <th style={th}>Half day</th><th style={th}>WFH</th><th style={th}>Short leave</th>
              <th style={th}>Leave</th><th style={th}>Absent</th><th style={th}>Holiday</th><th style={th}>No checkout</th>
            </tr>
          </thead>
          <tbody>
            {months.map((mo, i) => (
              <tr key={mo.ym} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 25}ms` }}>
                <td style={td}><strong>{mo.label}</strong></td>
                <td style={td}>{mo.present}</td>
                <td style={td}>{mo.late}</td>
                <td style={td}>{mo.half}</td>
                <td style={td}>{mo.wfh}</td>
                <td style={td}>{mo.shortLeave}</td>
                <td style={td}>{mo.leave}</td>
                <td style={td}>{mo.absent}</td>
                <td style={td}>{mo.holiday}</td>
                <td style={td}>{mo.noCheckout}</td>
              </tr>
            ))}
            {months.length === 0 && (
              <tr><td colSpan={10} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No months in {year} have happened yet.</td></tr>
            )}
            {months.length > 0 && (
              <tr style={{ borderTop: `2px solid ${COLORS.line}`, fontWeight: 800 }}>
                <td style={td}>Total</td>
                <td style={td}>{yearTotals.present}</td>
                <td style={td}>{yearTotals.late}</td>
                <td style={td}>{yearTotals.half}</td>
                <td style={td}>{yearTotals.wfh}</td>
                <td style={td}>{yearTotals.shortLeave}</td>
                <td style={td}>{yearTotals.leave}</td>
                <td style={td}>{yearTotals.absent}</td>
                <td style={td}>{yearTotals.holiday}</td>
                <td style={td}>{yearTotals.noCheckout}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function yearOptions(now) {
  const y = now.getFullYear();
  return [y - 2, y - 1, y, y + 1];
}

function toggleBtn(active) {
  return {
    border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
    background: active ? COLORS.ink : "transparent", color: active ? "#fff" : COLORS.muted,
  };
}

const navBtn = {
  background: "none", border: "none", cursor: "pointer", color: COLORS.muted,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 4,
};