import React, { useState } from "react";
import { Check, X, Plus, Trash2, Clock, CalendarCheck } from "lucide-react";
import { COLORS } from "../lib/constants";
import { inputStyle, primaryBtn, secondaryBtn, th, td, IconBtn } from "../components/ui";

const STATUS_STYLE = {
  pending: { bg: "#FBF0DC", fg: "#D99A2B", label: "Pending" },
  approved: { bg: "#E7F6EF", fg: "#2F9E6E", label: "Approved" },
  rejected: { bg: "#FBE8E7", fg: "#D9534F", label: "Rejected" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, background: s.bg, color: s.fg,
      fontWeight: 700, fontSize: 12.5, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function LeaveApprovalsView({ employees, leaveTypes, leaveRequests, onDecide, onAddType, onRemoveType }) {
  const [busyId, setBusyId] = useState(null);

  const empName = (id) => employees.find(e => e.id === id)?.name || "Unknown employee";

  const pending = leaveRequests.filter(r => r.status === "pending");
  const decided = leaveRequests.filter(r => r.status !== "pending");

  const decide = async (req, status) => {
    setBusyId(req.id);
    try { await onDecide(req, status); } finally { setBusyId(null); }
  };

  return (
    <div className="rv-anim-fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Leave Approvals</h1>
      </div>

      <LeaveTypesPanel leaveTypes={leaveTypes} onAddType={onAddType} onRemoveType={onRemoveType} />

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto", marginBottom: 22 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
          <Clock size={15} color={COLORS.amber} /> Pending requests {pending.length > 0 && `(${pending.length})`}
        </h3>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Employee</th><th style={th}>Type</th><th style={th}>From</th>
              <th style={th}>To</th><th style={th}>Reason</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {pending.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <td style={td}><strong>{empName(r.employeeId)}</strong></td>
                <td style={{ ...td, color: COLORS.muted }}>{r.leaveTypeName}</td>
                <td style={{ ...td, color: COLORS.muted }}>{fmtDate(r.startDate)}</td>
                <td style={{ ...td, color: COLORS.muted }}>{fmtDate(r.endDate)}</td>
                <td style={{ ...td, color: COLORS.muted, maxWidth: 220 }}>{r.reason || "—"}</td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <IconBtn title="Approve" disabled={busyId === r.id} onClick={() => decide(r, "approved")}><Check size={14} /></IconBtn>
                    <IconBtn title="Reject" disabled={busyId === r.id} onClick={() => decide(r, "rejected")}><X size={14} /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No pending requests.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
          <CalendarCheck size={15} color={COLORS.blue} /> Request history
        </h3>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Employee</th><th style={th}>Type</th><th style={th}>From</th>
              <th style={th}>To</th><th style={th}>Status</th><th style={th}>Decided by</th>
            </tr>
          </thead>
          <tbody>
            {decided.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <td style={td}><strong>{empName(r.employeeId)}</strong></td>
                <td style={{ ...td, color: COLORS.muted }}>{r.leaveTypeName}</td>
                <td style={{ ...td, color: COLORS.muted }}>{fmtDate(r.startDate)}</td>
                <td style={{ ...td, color: COLORS.muted }}>{fmtDate(r.endDate)}</td>
                <td style={td}><StatusBadge status={r.status} /></td>
                <td style={{ ...td, color: COLORS.muted }}>{r.decidedBy || "—"}</td>
              </tr>
            ))}
            {decided.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No decided requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaveTypesPanel({ leaveTypes, onAddType, onRemoveType }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await onAddType(name.trim()); setName(""); } finally { setBusy(false); }
  };

  return (
    <div className="rv-card" style={{ padding: "16px 20px", marginBottom: 22 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15.5, fontWeight: 700 }}>Leave types</h3>
      <p style={{ color: COLORS.muted, fontSize: 13, margin: "0 0 14px" }}>
        Set the leave types employees can choose from when applying (e.g. Sick Leave, Casual Leave, Annual Leave).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {leaveTypes.map(t => (
          <span key={t.id} style={{
            display: "inline-flex", alignItems: "center", gap: 8, background: COLORS.bg,
            border: `1px solid ${COLORS.line}`, fontWeight: 700, fontSize: 12.5,
            padding: "6px 6px 6px 12px", borderRadius: 999,
          }}>
            {t.name}
            <button onClick={() => onRemoveType(t.id)} title="Remove"
              style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex", padding: 2 }}>
              <Trash2 size={13} />
            </button>
          </span>
        ))}
        {leaveTypes.length === 0 && <span style={{ color: COLORS.muted, fontSize: 13 }}>No leave types set yet — add one below.</span>}
      </div>
      <div style={{ display: "flex", gap: 8, maxWidth: 380 }}>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle}
          placeholder="e.g. Sick Leave" onKeyDown={e => e.key === "Enter" && add()} />
        <button onClick={add} disabled={busy || !name.trim()} style={{ ...primaryBtn, opacity: busy || !name.trim() ? 0.6 : 1 }}>
          <Plus size={16} /> Add
        </button>
      </div>
    </div>
  );
}
