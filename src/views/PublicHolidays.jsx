import React, { useState } from "react";
import { Trash2, CalendarPlus } from "lucide-react";
import { COLORS } from "../lib/constants";
import { th, td } from "../components/ui";

// Point 2 — manually maintained public holiday list. Any date added here
// automatically shows up as a note on that day in Monthly Report (and
// wherever else `publicHolidays` gets passed) without touching the
// attendance row's real `notes` field, so it never overwrites something
// HR typed in by hand.
export default function PublicHolidaysView({ holidays, onAdd, onRemove }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleAdd = async () => {
    setError(null);
    if (!date || !name.trim()) {
      setError("Both a date and a name are required.");
      return;
    }
    setSaving(true);
    try {
      await onAdd(date, name.trim());
      setDate("");
      setName("");
    } catch (e) {
      setError(e.message || "Couldn't add that holiday.");
    }
    setSaving(false);
  };

  return (
    <div className="rv-anim-fadein">
      <h1 className="rv-header-in" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>Public Holidays</h1>
      <p style={{ color: COLORS.muted, fontSize: 14, margin: "0 0 20px" }}>
        Dates added here automatically show as a note on that day across attendance reports — no need to enter it per employee.
      </p>

      <div className="rv-card" style={{ padding: "16px 20px", marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
          <CalendarPlus size={15} color={COLORS.blue} /> Add a holiday
        </h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.muted }}>Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 5, flex: 1, minWidth: 200 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.muted }}>Name</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Eid-ul-Fitr"
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            />
          </label>
          <button onClick={handleAdd} disabled={saving} style={primaryBtn}>
            {saving ? "Adding…" : "Add holiday"}
          </button>
        </div>
        {error && <p style={{ margin: "10px 0 0", color: COLORS.red, fontSize: 13, fontWeight: 600 }}>{error}</p>}
      </div>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>Upcoming & past holidays</h3>
        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Date</th><th style={th}>Name</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((h, i) => (
              <tr key={h.id} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 25}ms` }}>
                <td style={td}>{new Date(h.date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</td>
                <td style={{ ...td, fontWeight: 600 }}>{h.name}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button
                    onClick={() => onRemove(h.id)}
                    title="Remove this holiday"
                    style={{ background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8, cursor: "pointer", color: COLORS.red, padding: "5px 7px", display: "inline-flex" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {holidays.length === 0 && (
              <tr><td colSpan={3} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No holidays added yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle = {
  border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5,
};
const primaryBtn = {
  background: COLORS.ink, color: "#fff", border: "none", borderRadius: 8,
  padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};
