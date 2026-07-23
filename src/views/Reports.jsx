import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Repeat, Search, Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { COLORS, GRACE_MIN, HALFDAY_HOURS } from "../lib/constants";
import { computeStatus, fmtHrs, monthKey, daysInMonth, todayStr } from "../lib/utils";
import { th, td, StatCard } from "../components/ui";

export default function ReportsView({ employees, attendance, now }) {
  const [ym, setYm] = useState(monthKey(todayStr(now)));
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");

  const shiftMonth = (delta) => {
    const [y, m] = ym.split("-").map(Number);
    setYm(monthKey(todayStr(new Date(y, m - 1 + delta, 1))));
  };

  const totalDays = daysInMonth(ym);
  const todayFull = todayStr(now);

  const summary = employees.map(emp => {
    let present = 0, late = 0, half = 0, noCheckout = 0, wfh = 0, leave = 0, absent = 0, totalHours = 0, workedDays = 0, alternateDays = 0;
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
      if (dateStr > todayFull) continue;
      const isPast = dateStr < todayFull;
      const rec = attendance[`${emp.id}|${dateStr}`];
      const status = computeStatus(emp, rec, isPast, now.getHours() * 60 + now.getMinutes(), dateStr);
      if (status.tone === "present") present++;
      else if (status.tone === "late") { present++; late++; }
      else if (status.tone === "half") { half++; }
      else if (status.tone === "no_checkout") { noCheckout++; }
      else if (status.tone === "wfh") { wfh++; }
      else if (status.tone === "leave") { leave++; }
      else if (status.tone === "absent") { absent++; }
      if (rec?.alternateDay) alternateDays++;
      const inT = rec?.checkIn || rec?.wfhCheckIn, outT = rec?.checkOut || rec?.wfhCheckOut;
      if (inT && outT) { totalHours += (new Date(outT) - new Date(inT)) / 3600000; workedDays++; }
    }
    const markedDays = present + half + noCheckout + wfh + absent;
    const attendancePct = markedDays ? Math.round(((present + half + wfh) / markedDays) * 100) : null;
    return { emp, present, late, half, noCheckout, wfh, leave, absent, alternateDays, avgHours: workedDays ? totalHours / workedDays : 0, attendancePct };
  });

  const teamTotals = summary.reduce((acc, s) => {
    acc.present += s.present; acc.absent += s.absent; acc.leave += s.leave;
    acc.marked += s.present + s.half + s.wfh + s.absent;
    acc.attended += s.present + s.half + s.wfh;
    return acc;
  }, { present: 0, absent: 0, leave: 0, marked: 0, attended: 0 });
  const teamAvgAttendance = teamTotals.marked > 0 ? Math.round((teamTotals.attended / teamTotals.marked) * 100) : 0;

  const visibleSummary = useMemo(() => {
    let list = summary.filter(s => s.emp.name.toLowerCase().includes(search.trim().toLowerCase()));
    if (sortBy === "attendance") list = [...list].sort((a, b) => (b.attendancePct ?? -1) - (a.attendancePct ?? -1));
    else if (sortBy === "absent") list = [...list].sort((a, b) => b.absent - a.absent);
    else list = [...list].sort((a, b) => a.emp.name.localeCompare(b.emp.name));
    return list;
  }, [summary, search, sortBy]);

  const chartData = summary.map(s => ({
    name: s.emp.name.split(" ")[0],
    Present: s.present, Late: s.late, "Half Day": s.half, "No Checkout": s.noCheckout, WFH: s.wfh, Leave: s.leave, Absent: s.absent,
  }));
  const hasChartData = chartData.some(d => d.Present + d.Late + d["Half Day"] + d["No Checkout"] + d.WFH + d.Leave + d.Absent > 0);

  const exportCsv = () => {
    const header = ["Name", "Present", "Late", "Half day", "No checkout", "WFH", "Leave", "Absent", "Attendance %", "Avg hrs/day", "Alternate days"];
    const rows = summary.map(s => [
      s.emp.name, s.present, s.late, s.half, s.noCheckout, s.wfh, s.leave, s.absent,
      s.attendancePct ?? "", fmtHrs(s.avgHours), s.alternateDays,
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-report-${ym}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rv-anim-fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h1 className="rv-header-in" style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Monthly Reports</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 10, padding: "6px 10px", border: `1px solid ${COLORS.line}` }}>
            <button onClick={() => shiftMonth(-1)} style={navBtn}><ChevronLeft size={16} /></button>
            <span style={{ fontWeight: 700, fontSize: 14, minWidth: 130, textAlign: "center" }}>
              {new Date(ym + "-01").toLocaleDateString([], { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => shiftMonth(1)} style={navBtn}><ChevronRight size={16} /></button>
          </div>
          <button onClick={exportCsv} style={exportBtn}><Download size={14} /> Export CSV</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 22 }}>
        <StatCard label="Employees" value={employees.length} tone="pending" />
        <StatCard label="Avg attendance" value={`${teamAvgAttendance}%`} tone="present" />
        <StatCard label="On leave" value={teamTotals.leave} tone="leave" />
        <StatCard label="Absent days" value={teamTotals.absent} tone="absent" />
      </div>

      <div className="rv-card rv-anim-popin" style={{ padding: 24, marginBottom: 20, background: "linear-gradient(180deg, #ffffff, #FAFBFF)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Attendance breakdown</h3>
          {!hasChartData && (
            <span style={{ fontSize: 12, color: COLORS.muted }}>
              No punches recorded yet for {new Date(ym + "-01").toLocaleDateString([], { month: "long" })}
            </span>
          )}
        </div>
        <Attendance3DChart data={chartData} hasChartData={hasChartData} />
      </div>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
            <Search size={14} color={COLORS.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee"
              style={{ ...searchInput }}
            />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={sortSelect}>
            <option value="name">Sort by name</option>
            <option value="attendance">Sort by attendance</option>
            <option value="absent">Sort by absent days</option>
          </select>
        </div>

        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Name</th><th style={th}>Present</th><th style={th}>Late</th>
              <th style={th}>Half day</th><th style={th}>No checkout</th><th style={th}>WFH</th><th style={th}>Leave</th><th style={th}>Absent</th>
              <th style={th}>Attendance</th>
              <th style={th}>Avg hrs/day</th>
              <th style={th}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Repeat size={12} /> Alternate day
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleSummary.map((s, i) => (
              <tr key={s.emp.id} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 30}ms` }}>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={avatar}>{initials(s.emp.name)}</span>
                    <strong>{s.emp.name}</strong>
                  </div>
                </td>
                <td style={td}>{s.present}</td>
                <td style={td}>{s.late}</td>
                <td style={td}>{s.half}</td>
                <td style={td}>{s.noCheckout}</td>
                <td style={td}>{s.wfh}</td>
                <td style={td}>{s.leave}</td>
                <td style={td}>{s.absent}</td>
                <td style={td}>
                  {s.attendancePct == null ? (
                    <span style={{ color: COLORS.muted }}>—</span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 56, height: 6, borderRadius: 3, background: COLORS.bg, overflow: "hidden" }}>
                        <div style={{
                          width: `${s.attendancePct}%`, height: "100%",
                          background: s.attendancePct >= 75 ? COLORS.green : s.attendancePct >= 50 ? COLORS.amber : COLORS.red,
                        }} />
                      </div>
                      <span style={{ color: COLORS.muted, fontSize: 12.5 }}>{s.attendancePct}%</span>
                    </div>
                  )}
                </td>
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
            {visibleSummary.length === 0 && (
              <tr><td colSpan={11} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>
                {employees.length === 0 ? "No employees yet." : "No employees match your search."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 14 }}>
        Late = check-in more than {GRACE_MIN} min after shift start. Half day = fewer than {HALFDAY_HOURS} hours worked.
        No checkout = checked in but never checked out for a past day (not counted as Half Day).
        Alternate day = a day an employee worked to make up for a leave.
      </p>
    </div>
  );
}

/* ---------------- Clean stacked bar chart with subtle depth ---------------- */

const SERIES = [
  { key: "Present", color: "#2F9E6E" },
  { key: "Late", color: "#D99A2B" },
  { key: "Half Day", color: "#E8B94A" },
  { key: "No Checkout", color: "#D97A3F" },
  { key: "WFH", color: "#2F6FED" },
  { key: "Leave", color: "#3E5A9E" },
  { key: "Absent", color: "#D9534F" },
];

function shade(hex, percent) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(2.55 * percent)));
  return `rgb(${r},${g},${b})`;
}

function gradId(key) {
  return `attnGrad-${key.replace(/\s+/g, "")}`;
}

function Attendance3DChart({ data, hasChartData }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data} barCategoryGap={22} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {SERIES.map(s => (
              <linearGradient key={s.key} id={gradId(s.key)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={shade(s.color, 25)} />
                <stop offset="100%" stopColor={s.color} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12 }}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            domain={hasChartData ? [0, "auto"] : [0, 5]}
          />
          <Tooltip content={<ReportTooltip />} cursor={{ fill: COLORS.bg }} />
          <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
          {SERIES.map((s, idx) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="a"
              fill={`url(#${gradId(s.key)})`}
              radius={idx === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function ReportTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 16px rgba(15,27,51,0.08)" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{label}</div>
      {payload.filter(p => p.value > 0).map(p => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12.5, color: COLORS.muted, marginBottom: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.dataKey}
          </span>
          <span style={{ fontWeight: 700, color: COLORS.text || "#1c2733" }}>{p.value}</span>
        </div>
      ))}
      {payload.every(p => p.value === 0) && <div style={{ fontSize: 12.5, color: COLORS.muted }}>No data</div>}
    </div>
  );
}

const navBtn = {
  background: "none", border: "none", cursor: "pointer", color: COLORS.muted,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 4,
};

const exportBtn = {
  display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${COLORS.line}`,
  borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: COLORS.muted, cursor: "pointer",
};

const searchInput = {
  width: "100%", padding: "8px 12px 8px 32px", borderRadius: 10, border: `1px solid ${COLORS.line}`,
  fontSize: 13, outline: "none", boxSizing: "border-box",
};

const sortSelect = {
  padding: "8px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontSize: 13, background: "#fff", color: COLORS.muted,
};

const avatar = {
  width: 24, height: 24, borderRadius: "50%", background: "#E6F1FB", color: "#185FA5",
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, flexShrink: 0,
};
