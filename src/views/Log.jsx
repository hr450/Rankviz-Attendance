import React, { useMemo, useState } from "react";
import { COLORS } from "../lib/constants";
import { computeStatus, fmtTime, fmtHrs, todayStr } from "../lib/utils";
import { StatusPill, selectStyle, th, td } from "../components/ui";

export default function LogView({ employees, attendance, now }) {
  const [empFilter, setEmpFilter] = useState("all");
  const [start, setStart] = useState(() => { const d = new Date(now); d.setDate(d.getDate() - 6); return todayStr(d); });
  const [end, setEnd] = useState(todayStr(now));

  const dateList = useMemo(() => {
    const list = [];
    let d = new Date(start);
    const endD = new Date(end);
    while (d <= endD) { list.push(todayStr(d)); d.setDate(d.getDate() + 1); }
    return list.reverse();
  }, [start, end]);

  const empList = empFilter === "all" ? employees : employees.filter(e => e.id === empFilter);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const rows = [];
  dateList.forEach(date => {
    const isPast = date < todayStr(now);
    empList.forEach(emp => {
      const rec = attendance[`${emp.id}|${date}`];
      const status = computeStatus(emp, rec, isPast, nowMinutes, date);
      let hours = null;
      if (rec?.checkIn && rec?.checkOut) hours = (new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000;
      rows.push({ date, emp, rec, status, hours });
    });
  });

  return (
    <div className="rv-anim-fadein">
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 18px" }}>Attendance Log</h1>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={selectStyle}>
          <option value="all">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={start} onChange={e => setStart(e.target.value)} style={selectStyle} />
        <span style={{ alignSelf: "center", color: COLORS.muted }}>to</span>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={selectStyle} />
      </div>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Date</th><th style={th}>Name</th><th style={th}>Status</th>
              <th style={th}>Check-in</th><th style={th}>Check-out</th><th style={th}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <td style={td}>{new Date(r.date + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                <td style={td}><strong>{r.emp.name}</strong></td>
                <td style={td}><StatusPill {...r.status} /></td>
                <td style={{ ...td, color: COLORS.muted }}>{fmtTime(r.rec?.checkIn || r.rec?.wfhCheckIn)}</td>
                <td style={{ ...td, color: COLORS.muted }}>{fmtTime(r.rec?.checkOut || r.rec?.wfhCheckOut)}</td>
                <td style={{ ...td, color: COLORS.muted }}>{r.hours != null ? fmtHrs(r.hours) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No records for this range.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
