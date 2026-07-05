import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Coffee, Repeat, Home } from "lucide-react";
import { COLORS } from "../lib/constants";
import { computeStatus, fmtTime, fmtHrs, monthKey, daysInMonth, todayStr } from "../lib/utils";
import { StatusPill, StatCard, selectStyle, th, td } from "../components/ui";

export default function MonthlyReportView({ employees, attendance, now }) {
  const [empId, setEmpId] = useState(employees[0]?.id || "");
  const [ym, setYm] = useState(monthKey(todayStr(now)));

  const emp = employees.find(e => e.id === empId) || employees[0];
  const shiftMonth = (delta) => {
    const [y, m] = ym.split("-").map(Number);
    setYm(monthKey(todayStr(new Date(y, m - 1 + delta, 1))));
  };

  const totalDays = daysInMonth(ym);
  const todayFull = todayStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const rows = useMemo(() => {
    if (!emp) return [];
    const list = [];
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
      if (dateStr > todayFull) continue;
      const isPast = dateStr < todayFull;
      const rec = attendance[`${emp.id}|${dateStr}`];
      const status = computeStatus(emp, rec, isPast, nowMinutes);
      list.push({ date: dateStr, rec, status });
    }
    return list.reverse();
  }, [emp, ym, attendance, totalDays, todayFull, nowMinutes]);

  const leaves = rows.filter(r => r.status.tone === "leave");
  const alternates = rows.filter(r => r.rec?.alternateDay);
  const noCheckouts = rows.filter(r => (r.rec?.checkIn && !r.rec?.checkOut) || (r.rec?.wfhCheckIn && !r.rec?.wfhCheckOut));

  if (!emp) return <p style={{ color: COLORS.muted }}>No employees yet — add some in the Employees tab first.</p>;

  return (
    <div className="rv-anim-fadein">
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 18px" }}>Monthly Report</h1>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <select value={empId} onChange={e => setEmpId(e.target.value)} style={{ ...selectStyle, minWidth: 220, fontWeight: 700 }}>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 10, padding: "6px 10px", border: `1px solid ${COLORS.line}` }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, fontSize: 14, minWidth: 130, textAlign: "center" }}>
            {new Date(ym + "-01").toLocaleDateString([], { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => shiftMonth(1)} style={navBtn}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 22 }}>
        <StatCard label="Leaves taken" value={leaves.length} tone="leave" />
        <StatCard label="Alternate days worked" value={alternates.length} tone="present" />
        <StatCard label="Missing checkouts" value={noCheckouts.length} tone="half" />
        <StatCard label="Days recorded" value={rows.filter(r => r.rec).length} tone="pending" />
      </div>

      {leaves.length > 0 && (
        <div className="rv-card" style={{ padding: "16px 20px", marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
            <Coffee size={15} color={COLORS.violet} /> Leave dates
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {leaves.map(l => (
              <span key={l.date} style={{
                background: "#E9EEFC", color: "#3E5A9E", fontWeight: 700, fontSize: 12.5,
                padding: "5px 11px", borderRadius: 999,
              }}>
                {new Date(l.date + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>Full attendance — {emp.name}</h3>
        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Date</th><th style={th}>Status</th><th style={th}>Check-in</th>
              <th style={th}>Check-out</th><th style={th}>WFH in</th><th style={th}>WFH out</th><th style={th}>Hours</th><th style={th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const inT = r.rec?.checkIn, outT = r.rec?.checkOut;
              const hours = (inT && outT) ? (new Date(outT) - new Date(inT)) / 3600000
                : (r.rec?.wfhCheckIn && r.rec?.wfhCheckOut) ? (new Date(r.rec.wfhCheckOut) - new Date(r.rec.wfhCheckIn)) / 3600000
                : null;
              const missedCheckout = (r.rec?.checkIn && !r.rec?.checkOut) || (r.rec?.wfhCheckIn && !r.rec?.wfhCheckOut);
              return (
                <tr key={r.date} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 25}ms` }}>
                  <td style={td}>{new Date(r.date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td style={td}><StatusPill {...r.status} /></td>
                  <td style={{ ...td, color: COLORS.muted }}>{fmtTime(r.rec?.checkIn)}</td>
                  <td style={{ ...td, color: missedCheckout ? COLORS.red : COLORS.muted, fontWeight: missedCheckout ? 700 : 400 }}>
                    {r.rec?.checkIn ? (r.rec?.checkOut ? fmtTime(r.rec.checkOut) : "No checkout") : "—"}
                  </td>
                  <td style={{ ...td, color: COLORS.muted }}>{fmtTime(r.rec?.wfhCheckIn)}</td>
                  <td style={{ ...td, color: missedCheckout ? COLORS.red : COLORS.muted, fontWeight: missedCheckout ? 700 : 400 }}>
                    {r.rec?.wfhCheckIn ? (r.rec?.wfhCheckOut ? fmtTime(r.rec.wfhCheckOut) : "No checkout") : "—"}
                  </td>
                  <td style={{ ...td, color: COLORS.muted }}>{hours != null ? fmtHrs(hours) : "—"}</td>
                  <td style={td}>
                    {r.rec?.alternateDay && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: COLORS.violet, fontWeight: 700, fontSize: 12 }}>
                        <Repeat size={11} /> Alt. day
                      </span>
                    )}
                    {r.rec?.type === "wfh" && !r.rec?.alternateDay && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: COLORS.blue, fontWeight: 700, fontSize: 12 }}>
                        <Home size={11} /> WFH
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No records this month yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const navBtn = {
  background: "none", border: "none", cursor: "pointer", color: COLORS.muted,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 4,
};
