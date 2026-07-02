import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { COLORS, GRACE_MIN, HALFDAY_HOURS } from "../lib/constants";
import { computeStatus, fmtHrs, monthKey, daysInMonth, todayStr } from "../lib/utils";
import { th, td } from "../components/ui";

export default function ReportsView({ employees, attendance, now }) {
  const [ym, setYm] = useState(monthKey(todayStr(now)));

  const shiftMonth = (delta) => {
    const [y, m] = ym.split("-").map(Number);
    setYm(monthKey(todayStr(new Date(y, m - 1 + delta, 1))));
  };

  const totalDays = daysInMonth(ym);
  const todayFull = todayStr(now);

  const summary = employees.map(emp => {
    let present = 0, late = 0, half = 0, wfh = 0, leave = 0, absent = 0, totalHours = 0, workedDays = 0, alternateDays = 0;
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
      if (dateStr > todayFull) continue;
      const isPast = dateStr < todayFull;
      const rec = attendance[`${emp.id}|${dateStr}`];
      const status = computeStatus(emp, rec, isPast, now.getHours() * 60 + now.getMinutes());
      if (status.tone === "present") present++;
      else if (status.tone === "late") { present++; late++; }
      else if (status.tone === "half") { half++; }
      else if (status.tone === "wfh") { wfh++; }
      else if (status.tone === "leave") { leave++; }
      else if (status.tone === "absent") { absent++; }
      if (rec?.alternateDay) alternateDays++;
      const inT = rec?.checkIn || rec?.wfhCheckIn, outT = rec?.checkOut || rec?.wfhCheckOut;
      if (inT && outT) { totalHours += (new Date(outT) - new Date(inT)) / 3600000; workedDays++; }
    }
    return { emp, present, late, half, wfh, leave, absent, alternateDays, avgHours: workedDays ? totalHours / workedDays : 0 };
  });

  const chartData = summary.map(s => ({
    name: s.emp.name.split(" ")[0],
    Present: s.present, Late: s.late, "Half Day": s.half, WFH: s.wfh, Leave: s.leave, Absent: s.absent,
  }));

  return (
    <div className="rv-anim-fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Monthly Reports</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 10, padding: "6px 10px", border: `1px solid ${COLORS.line}` }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, fontSize: 14, minWidth: 130, textAlign: "center" }}>
            {new Date(ym + "-01").toLocaleDateString([], { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => shiftMonth(1)} style={navBtn}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="rv-card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15.5, fontWeight: 700 }}>Attendance breakdown</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12.5 }} />
              <Bar dataKey="Present" stackId="a" fill={COLORS.green} />
              <Bar dataKey="Late" stackId="a" fill={COLORS.amber} />
              <Bar dataKey="Half Day" stackId="a" fill="#E8B94A" />
              <Bar dataKey="WFH" stackId="a" fill={COLORS.blue} />
              <Bar dataKey="Leave" stackId="a" fill="#3E5A9E" />
              <Bar dataKey="Absent" stackId="a" fill={COLORS.red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Name</th><th style={th}>Present</th><th style={th}>Late</th>
              <th style={th}>Half day</th><th style={th}>WFH</th><th style={th}>Leave</th><th style={th}>Absent</th>
              <th style={th}>Avg hrs/day</th>
              <th style={th}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Repeat size={12} /> Alternate day
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.map(s => (
              <tr key={s.emp.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <td style={td}><strong>{s.emp.name}</strong></td>
                <td style={td}>{s.present}</td>
                <td style={td}>{s.late}</td>
                <td style={td}>{s.half}</td>
                <td style={td}>{s.wfh}</td>
                <td style={td}>{s.leave}</td>
                <td style={td}>{s.absent}</td>
                <td style={td}>{fmtHrs(s.avgHours)}</td>
                <td style={td}>
                  {s.alternateDays > 0 ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5, background: "#EEE9FC",
                      color: COLORS.violet, fontWeight: 700, fontSize: 12.5, padding: "4px 10px", borderRadius: 999,
                    }}><Repeat size={11} /> {s.alternateDays}</span>
                  ) : <span style={{ color: COLORS.muted }}>—</span>}
                </td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr><td colSpan={9} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No employees yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 14 }}>
        Late = check-in more than {GRACE_MIN} min after shift start. Half day = fewer than {HALFDAY_HOURS} hours worked.
        Alternate day = a day an employee worked to make up for a leave.
      </p>
    </div>
  );
}

const navBtn = {
  background: "none", border: "none", cursor: "pointer", color: COLORS.muted,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 4,
};
