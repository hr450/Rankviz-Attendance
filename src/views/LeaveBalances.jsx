import React, { useEffect, useState } from "react";
import { COLORS } from "../lib/constants";
import { th, td } from "../components/ui";

const DEFAULT_BALANCE = {
  annualAllocated: 12, casualAllocated: 6, sickAllocated: 6,
  annualRemaining: 12, casualRemaining: 6, sickRemaining: 6,
};

const numInput = {
  width: 64, padding: "6px 8px", borderRadius: 8, border: `1px solid ${COLORS.line}`,
  fontSize: 13, textAlign: "center", outline: "none",
};

function totalRemaining(b) {
  return (Number(b.annualRemaining) || 0) + (Number(b.casualRemaining) || 0) + (Number(b.sickRemaining) || 0);
}

function rowTone(total) {
  if (total <= 10) return { bg: "#FBE8E7" };      // red — running low
  if (total <= 15) return { bg: "#FBF3D9" };      // yellow — watch
  return { bg: "#E7F6EF" };                        // green — healthy
}

export default function LeaveBalancesView({ employees, leaveBalances, onUpdate }) {
  const [local, setLocal] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    const next = {};
    employees.forEach(emp => {
      next[emp.id] = { ...DEFAULT_BALANCE, ...(leaveBalances?.[emp.id] || {}) };
    });
    setLocal(next);
  }, [employees, leaveBalances]);

  const setField = (empId, field, value) => {
    setLocal(prev => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }));
  };

  const commit = async (empId) => {
    setSavingId(empId);
    try { await onUpdate(empId, local[empId]); }
    finally { setSavingId(null); }
  };

  return (
    <div className="rv-anim-fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Leave Balances</h1>
      </div>
      <p style={{ color: COLORS.muted, fontSize: 13, margin: "0 0 18px" }}>
        Set each employee's yearly allocation and update their remaining balance manually. Changes save when you click out of a field.
      </p>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th} rowSpan={2}>Employee</th>
              <th style={{ ...th, textAlign: "center", borderLeft: `1px solid ${COLORS.line}` }} colSpan={2}>Annual</th>
              <th style={{ ...th, textAlign: "center", borderLeft: `1px solid ${COLORS.line}` }} colSpan={2}>Casual</th>
              <th style={{ ...th, textAlign: "center", borderLeft: `1px solid ${COLORS.line}` }} colSpan={2}>Sick</th>
              <th style={{ ...th, textAlign: "center", borderLeft: `1px solid ${COLORS.line}` }}>Total Remaining</th>
            </tr>
            <tr style={{ color: COLORS.muted, fontSize: 11.5, textAlign: "center" }}>
              <th style={th}>Alloc.</th><th style={th}>Rem.</th>
              <th style={{ ...th, borderLeft: `1px solid ${COLORS.line}` }}>Alloc.</th><th style={th}>Rem.</th>
              <th style={{ ...th, borderLeft: `1px solid ${COLORS.line}` }}>Alloc.</th><th style={th}>Rem.</th>
              <th style={{ ...th, borderLeft: `1px solid ${COLORS.line}` }}></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => {
              const b = local[emp.id] || DEFAULT_BALANCE;
              const total = totalRemaining(b);
              const tone = rowTone(total);
              return (
                <tr key={emp.id} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 30}ms` }}>
                  <td style={td}>
                    <strong>{emp.name}</strong>
                    {savingId === emp.id && <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.muted }}>saving…</span>}
                  </td>

                  <td style={{ ...td, textAlign: "center", borderLeft: `1px solid ${COLORS.line}` }}>
                    <BalanceInput value={b.annualAllocated} onChange={v => setField(emp.id, "annualAllocated", v)} onBlur={() => commit(emp.id)} />
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <BalanceInput value={b.annualRemaining} onChange={v => setField(emp.id, "annualRemaining", v)} onBlur={() => commit(emp.id)} />
                  </td>

                  <td style={{ ...td, textAlign: "center", borderLeft: `1px solid ${COLORS.line}` }}>
                    <BalanceInput value={b.casualAllocated} onChange={v => setField(emp.id, "casualAllocated", v)} onBlur={() => commit(emp.id)} />
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <BalanceInput value={b.casualRemaining} onChange={v => setField(emp.id, "casualRemaining", v)} onBlur={() => commit(emp.id)} />
                  </td>

                  <td style={{ ...td, textAlign: "center", borderLeft: `1px solid ${COLORS.line}` }}>
                    <BalanceInput value={b.sickAllocated} onChange={v => setField(emp.id, "sickAllocated", v)} onBlur={() => commit(emp.id)} />
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <BalanceInput value={b.sickRemaining} onChange={v => setField(emp.id, "sickRemaining", v)} onBlur={() => commit(emp.id)} />
                  </td>

                  <td style={{ ...td, textAlign: "center", borderLeft: `1px solid ${COLORS.line}`, background: tone.bg, fontWeight: 800 }}>
                    {total}
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No employees yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12.5, color: COLORS.muted, flexWrap: "wrap" }}>
        <LegendDot color="#E7F6EF" label="Healthy (16+ remaining)" />
        <LegendDot color="#FBF3D9" label="Watch (11–15 remaining)" />
        <LegendDot color="#FBE8E7" label="Low (10 or fewer remaining)" />
      </div>
    </div>
  );
}

function BalanceInput({ value, onChange, onBlur }) {
  return (
    <input
      type="number"
      step="0.25"
      value={value ?? 0}
      onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      onBlur={onBlur}
      style={numInput}
    />
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, border: `1px solid ${COLORS.line}` }} />
      {label}
    </span>
  );
}
