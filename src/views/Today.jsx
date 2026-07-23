import React, { useState } from "react";
import { LogIn, LogOut, Home, Coffee } from "lucide-react";
import { COLORS } from "../lib/constants";
import { computeStatus, fmtTime, todayStr } from "../lib/utils";
import { StatusPill, StatCard, IconBtn, th, td } from "../components/ui";

export default function TodayView({ employees, attendance, now, punch }) {
  const date = todayStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [flashId, setFlashId] = useState(null);
  const [errorFor, setErrorFor] = useState(null); // { empId, message }

  const handlePunch = async (empId, action, meta) => {
    const result = await punch(empId, action, meta);
    if (!result.ok) {
      setErrorFor({ empId, message: result.error });
      setTimeout(() => setErrorFor(cur => (cur?.empId === empId ? null : cur)), 4000);
      return;
    }
    setFlashId(empId);
    setTimeout(() => setFlashId(id => (id === empId ? null : id)), 900);
  };

  const rows = employees.map(emp => {
    const rec = attendance[`${emp.id}|${date}`];
    const status = computeStatus(emp, rec, false, nowMinutes, date);
    return { emp, rec, status };
  });

  const counts = rows.reduce((acc, r) => {
    if (r.status.tone === "present" || r.status.tone === "late" || r.status.tone === "half") acc.present++;
    else if (r.status.tone === "wfh") acc.wfh++;
    else if (r.status.tone === "pending") acc.pending++;
    else if (r.status.tone === "absent") acc.absent++;
    return acc;
  }, { present: 0, wfh: 0, pending: 0, absent: 0 });

  return (
    <div className="rv-anim-fadein">
      <h1 className="rv-header-in" style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px" }}>Today</h1>
      <p style={{ color: COLORS.muted, margin: "0 0 22px", fontSize: 14.5, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
          <span className="rv-live-dot" style={{ position: "absolute", inset: 0, borderRadius: 99, background: COLORS.green || "#2F9E6E" }} />
          <span style={{ position: "relative", width: 8, height: 8, borderRadius: 99, background: COLORS.green || "#2F9E6E" }} />
        </span>
        Live view of who's in, who's remote, who hasn't punched in yet — {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 26 }}>
        <StatCard label="Present" value={counts.present} tone="present" />
        <StatCard label="Working from home" value={counts.wfh} tone="wfh" />
        <StatCard label="Not checked in" value={counts.pending} tone="pending" />
        <StatCard label="Absent" value={counts.absent} tone="absent" />
      </div>

      <div className="rv-card" style={{ padding: "20px 20px 8px" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16.5, fontWeight: 700 }}>Employee status</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Department</th>
                <th style={th}>Status</th>
                <th style={th}>First punch</th>
                <th style={th}>Last punch</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ emp, rec, status }, i) => (
                <tr
                  key={emp.id}
                  className={`rv-row-in ${flashId === emp.id ? "rv-row-flash" : ""}`}
                  style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 35}ms` }}
                >
                  <td style={td}><strong>{emp.name}</strong></td>
                  <td style={{ ...td, color: COLORS.muted }}>{emp.department}</td>
                  <td style={td}><StatusPill {...status} /></td>
                  <td style={{ ...td, color: COLORS.muted }}>{fmtTime(rec?.checkIn || rec?.wfhCheckIn)}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{fmtTime(rec?.checkOut || rec?.wfhCheckOut)}</td>
                  <td style={td}>
                    <QuickActions emp={emp} rec={rec} punch={handlePunch} />
                    {errorFor?.empId === emp.id && (
                      <div style={{ color: COLORS.red, fontSize: 11.5, fontWeight: 600, marginTop: 5, maxWidth: 220 }}>
                        {errorFor.message}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No employees yet. Add some in the Employees tab.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function QuickActions({ emp, rec, punch }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {!rec?.checkIn && <IconBtn title="Check in" onClick={() => punch(emp.id, "in")}><LogIn size={14} /></IconBtn>}
      {rec?.checkIn && !rec?.checkOut && <IconBtn title="Check out" onClick={() => punch(emp.id, "out")}><LogOut size={14} /></IconBtn>}
      <IconBtn title="Mark WFH" onClick={() => punch(emp.id, "wfh_in")}><Home size={14} /></IconBtn>
      <IconBtn title="Mark leave" onClick={() => punch(emp.id, "leave")}><Coffee size={14} /></IconBtn>
    </div>
  );
}
