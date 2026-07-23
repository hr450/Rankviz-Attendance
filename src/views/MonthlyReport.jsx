import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Coffee, Repeat, Home, Pencil, X, CalendarHeart } from "lucide-react";
import { COLORS } from "../lib/constants";
import { computeStatus, fmtTime, fmtHrs, monthKey, daysInMonth, todayStr } from "../lib/utils";
import { StatusPill, StatCard, selectStyle, th, td } from "../components/ui";
import { updateEmployeeShift } from "../lib/db";

// cdata.js flags a lone punch that lands well after shift_end (with no
// earlier punch that day) by prefixing its auto-note with "Auto-flag:" —
// it still has to store the raw punch time SOMEWHERE (check_in is the
// only field a first punch of the day can land in), but it's really a
// checkout with a missed/lost check-in, not a genuine check-in. Detect
// that here so the table shows "No check-in" instead of presenting the
// evening time as if someone arrived then.
function isFlaggedNotARealCheckIn(rec) {
  return !!(rec?.notes && rec.notes.startsWith("Auto-flag:") && rec?.checkIn && !rec?.checkOut);
}

export default function MonthlyReportView({ employees, attendance, now, onSaveEdit, session, publicHolidays = [] }) {
  const [empId, setEmpId] = useState(employees[0]?.id || "");
  const [ym, setYm] = useState(monthKey(todayStr(now)));
  const [editingDate, setEditingDate] = useState(null); // date string of the row currently open in the edit modal

  const holidayByDate = useMemo(() => {
    const map = {};
    publicHolidays.forEach(h => { map[h.date] = h.name; });
    return map;
  }, [publicHolidays]);

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
      const status = computeStatus(emp, rec, isPast, nowMinutes, dateStr);
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
      <h1 className="rv-header-in" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 18px" }}>Monthly Report</h1>

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
              <th style={th}>Check-out</th><th style={th}>WFH in</th><th style={th}>WFH out</th><th style={th}>Hours</th><th style={th}>Notes</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const inT = r.rec?.checkIn, outT = r.rec?.checkOut;
              const hours = (inT && outT) ? (new Date(outT) - new Date(inT)) / 3600000
                : (r.rec?.wfhCheckIn && r.rec?.wfhCheckOut) ? (new Date(r.rec.wfhCheckOut) - new Date(r.rec.wfhCheckIn)) / 3600000
                : null;
              const missedCheckout = (r.rec?.checkIn && !r.rec?.checkOut) || (r.rec?.wfhCheckIn && !r.rec?.wfhCheckOut);
              const flaggedNotReal = isFlaggedNotARealCheckIn(r.rec);
              return (
                <tr key={r.date} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 25}ms` }}>
                  <td style={td}>{new Date(r.date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td style={td}><StatusPill {...r.status} /></td>
                  <td style={{ ...td, color: flaggedNotReal ? COLORS.red : COLORS.muted, fontWeight: flaggedNotReal ? 700 : 400 }}>
                    {flaggedNotReal ? "No check-in" : fmtTime(r.rec?.checkIn)}
                  </td>
                  <td style={{ ...td, color: (missedCheckout && !flaggedNotReal) ? COLORS.red : COLORS.muted, fontWeight: (missedCheckout && !flaggedNotReal) ? 700 : 400 }}>
                    {flaggedNotReal
                      ? `${fmtTime(r.rec.checkIn)} (likely checkout — no check-in recorded)`
                      : r.rec?.checkIn ? (r.rec?.checkOut ? fmtTime(r.rec.checkOut) : "No checkout") : "—"}
                  </td>
                  <td style={{ ...td, color: COLORS.muted }}>{fmtTime(r.rec?.wfhCheckIn)}</td>
                  <td style={{ ...td, color: missedCheckout ? COLORS.red : COLORS.muted, fontWeight: missedCheckout ? 700 : 400 }}>
                    {r.rec?.wfhCheckIn ? (r.rec?.wfhCheckOut ? fmtTime(r.rec.wfhCheckOut) : "No checkout") : "—"}
                  </td>
                  <td style={{ ...td, color: COLORS.muted }}>{hours != null ? fmtHrs(hours) : "—"}</td>
                  <td style={td}>
                    {holidayByDate[r.date] && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#B2650A", fontWeight: 700, fontSize: 12 }}>
                        <CalendarHeart size={11} /> {holidayByDate[r.date]}
                      </span>
                    )}
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
                    {r.rec?.notes && (
                      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{r.rec.notes}</div>
                    )}
                    {r.rec?.manuallyEdited && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
                        background: "#FFF3D6", color: "#8A6200", fontWeight: 700, fontSize: 11,
                        padding: "2px 7px", borderRadius: 999,
                      }} title={r.rec.editedBy ? `Edited by ${r.rec.editedBy}` : "Manually edited"}>
                        Edited
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button
                      onClick={() => setEditingDate(r.date)}
                      title="Correct this day's attendance"
                      style={{
                        background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8,
                        cursor: "pointer", color: COLORS.muted, padding: "5px 7px",
                        display: "inline-flex", alignItems: "center",
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No records this month yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editingDate && (
        <EditAttendanceModal
          date={editingDate}
          emp={emp}
          rec={attendance[`${emp.id}|${editingDate}`]}
          onClose={() => setEditingDate(null)}
          onSave={async (patch) => {
            await onSaveEdit(emp.id, editingDate, patch);
            setEditingDate(null);
          }}
        />
      )}
    </div>
  );
}

// Pre-fills from an ISO timestamp into the local "YYYY-MM-DDTHH:mm" format
// <input type="datetime-local"> expects. Empty string renders as blank.
function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Inverse — datetime-local string back to an ISO timestamp for the API.
// Blank input means "clear this field".
function fromDatetimeLocal(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function EditAttendanceModal({ date, emp, rec, onClose, onSave }) {
  const empName = emp.name;
  const [checkIn, setCheckIn] = useState(toDatetimeLocal(rec?.checkIn));
  const [checkOut, setCheckOut] = useState(toDatetimeLocal(rec?.checkOut));
  const [showSecond, setShowSecond] = useState(!!(rec?.secondCheckIn || rec?.secondCheckOut));
  const [secondCheckIn, setSecondCheckIn] = useState(toDatetimeLocal(rec?.secondCheckIn));
  const [secondCheckOut, setSecondCheckOut] = useState(toDatetimeLocal(rec?.secondCheckOut));
  const [notes, setNotes] = useState(rec?.notes || "");
  const [showShift, setShowShift] = useState(false);
  const [shiftStart, setShiftStart] = useState(emp.shiftStart || "09:30");
  const [shiftEnd, setShiftEnd] = useState(emp.shiftEnd || "18:30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const handleSubmit = async () => {
    setError(null);
    const inVal = fromDatetimeLocal(checkIn);
    const outVal = fromDatetimeLocal(checkOut);
    if (inVal && outVal && new Date(outVal).getTime() <= new Date(inVal).getTime()) {
      setError("Check-out must be after check-in.");
      return;
    }
    setSaving(true);
    try {
      if (showShift && (shiftStart !== emp.shiftStart || shiftEnd !== emp.shiftEnd)) {
        await updateEmployeeShift(emp.id, shiftStart, shiftEnd);
      }
      const patch = { check_in: inVal, check_out: outVal, notes };
      if (showSecond) {
        patch.second_check_in = fromDatetimeLocal(secondCheckIn);
        patch.second_check_out = fromDatetimeLocal(secondCheckOut);
      }
      await onSave(patch);
    } catch (e) {
      setError(e.message || "Couldn't save that correction.");
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(20,20,30,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rv-card"
        style={{ width: "100%", maxWidth: 440, padding: "22px 24px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Correct attendance</h3>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: COLORS.muted }}>{empName} — {dateLabel}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <Field label="Check-in">
            <input type="datetime-local" value={checkIn} onChange={e => setCheckIn(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Check-out">
            <input type="datetime-local" value={checkOut} onChange={e => setCheckOut(e.target.value)} style={inputStyle} />
          </Field>

          {!showSecond ? (
            <button onClick={() => setShowSecond(true)} style={linkBtn}>+ Add second (night) session</button>
          ) : (
            <>
              <Field label="Second check-in">
                <input type="datetime-local" value={secondCheckIn} onChange={e => setSecondCheckIn(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Second check-out">
                <input type="datetime-local" value={secondCheckOut} onChange={e => setSecondCheckOut(e.target.value)} style={inputStyle} />
              </Field>
            </>
          )}

          {!showShift ? (
            <button onClick={() => setShowShift(true)} style={linkBtn}>+ Change shift</button>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10 }}>
                <Field label="Shift start">
                  <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Shift end">
                  <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} style={inputStyle} />
                </Field>
              </div>
              <p style={{ margin: "-6px 0 0", fontSize: 11.5, color: COLORS.muted }}>
                This updates {empName}'s standing shift going forward — not just this one day.
              </p>
            </>
          )}

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Forgot to check out, corrected by HR"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>

          {error && <p style={{ margin: 0, color: COLORS.red, fontSize: 13, fontWeight: 600 }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={secondaryBtn}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} style={primaryBtn}>
              {saving ? "Saving…" : "Save correction"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.muted }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 10px",
  fontSize: 13.5, width: "100%", boxSizing: "border-box",
};
const linkBtn = {
  background: "none", border: "none", cursor: "pointer", color: COLORS.blue,
  fontSize: 13, fontWeight: 700, padding: 0, textAlign: "left",
};
const secondaryBtn = {
  background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 8,
  padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", color: COLORS.ink,
};
const primaryBtn = {
  background: COLORS.ink, color: "#fff", border: "none", borderRadius: 8,
  padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};

const navBtn = {
  background: "none", border: "none", cursor: "pointer", color: COLORS.muted,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 4,
};
