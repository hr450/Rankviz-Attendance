import React, { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Check, X, KeyRound, UserX, UserCheck } from "lucide-react";
import { COLORS, DEPARTMENTS } from "../lib/constants";
import { uid } from "../lib/utils";
import { upsertEmployeeCredentials } from "../lib/db";
import { IconBtn, Field, inputStyle, primaryBtn, secondaryBtn, th, td } from "../components/ui";

// An employee counts as "active" (in the auto sense) if they've had ANY of
// these within the last AUTO_INACTIVE_DAYS: an office check-in, a WFH
// check-in, an approved leave day, or an alternate day. All four reset the
// clock — only genuine silence (no record of any kind) counts against them.
// Weekends/holidays never count against them either way, since there's no
// punch expected on those days regardless.
const AUTO_INACTIVE_DAYS = 30;

function lastActivityDate(empId, attendance) {
  let last = null;
  const prefix = `${empId}|`;
  for (const key in attendance) {
    if (!key.startsWith(prefix)) continue;
    const rec = attendance[key];
    const hasActivity = !!(rec?.checkIn || rec?.wfhCheckIn || rec?.type === "leave" || rec?.alternateDay);
    if (!hasActivity) continue;
    const date = key.slice(prefix.length);
    if (!last || date > last) last = date;
  }
  return last; // "YYYY-MM-DD" or null if this employee has no activity on record at all
}

function daysSince(dateStr, now) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - d) / 86400000);
}

export default function EmployeesView({ employees, setEmployees, accounts, refreshAccounts, attendance }) {
  const [editing, setEditing] = useState(null);
  const [credsFor, setCredsFor] = useState(null);
  const [filter, setFilter] = useState("active"); // active | inactive | all
  const isOpen = editing !== null;

  // Auto Active/Inactive sync — runs whenever attendance data changes.
  // Employees with no activity of any kind (office punch, WFH punch,
  // approved leave, or alternate day) for more than AUTO_INACTIVE_DAYS get
  // auto-flipped to Inactive; employees who resume activity get
  // auto-flipped back to Active. Employees with NO attendance history at
  // all (e.g. just added, or added before any punches came in) are left
  // untouched — there's no way to tell "brand new hire" apart from "empty
  // record" from attendance alone, so this only acts once there's at least
  // one activity date to measure silence against.
  useEffect(() => {
    if (!attendance || employees.length === 0) return;
    const now = new Date();
    let changed = false;
    const next = employees.map(emp => {
      const last = lastActivityDate(emp.id, attendance);
      if (!last) return emp; // no history yet — leave status as-is
      const silentDays = daysSince(last, now);
      const shouldBeActive = silentDays <= AUTO_INACTIVE_DAYS;
      const currentlyActive = emp.active !== false;
      if (shouldBeActive === currentlyActive) return emp;
      changed = true;
      return { ...emp, active: shouldBeActive };
    });
    if (changed) setEmployees(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance]);

  // Soft delete: flips `active` to false but keeps the row in the array,
  // so the save diff in App.jsx/db.js sees it as an update (merge), not a
  // removal — nothing gets hard-deleted from Supabase, and the employee's
  // attendance history stays intact.
  const deactivate = (id) => setEmployees(employees.map(e => e.id === id ? { ...e, active: false } : e));
  const reactivate = (id) => setEmployees(employees.map(e => e.id === id ? { ...e, active: true } : e));

  // Genuinely removes the row (e.g. a duplicate/test entry added by
  // mistake) — kept separate from the everyday "employee left" flow, and
  // gated behind a confirmation since it's the one destructive path left.
  const permanentlyDelete = (id, name) => {
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone — for someone who's left, use Deactivate instead.`)) return;
    setEmployees(employees.filter(e => e.id !== id));
  };

  const save = (emp) => {
    if (emp.id) setEmployees(employees.map(e => e.id === emp.id ? emp : e));
    else setEmployees([...employees, { ...emp, id: uid("emp"), active: true }]);
    setEditing(null);
  };

  const visibleEmployees = employees.filter(e => {
    if (filter === "active") return e.active !== false;
    if (filter === "inactive") return e.active === false;
    return true;
  });

  return (
    <div className="rv-anim-fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Employees</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <button onClick={() => setEditing({})} style={primaryBtn}><Plus size={16} /> Add employee</button>
        </div>
      </div>
      <p style={{ color: COLORS.muted, fontSize: 12.5, margin: "0 0 18px" }}>
        Active/Inactive updates automatically: {AUTO_INACTIVE_DAYS}+ days with no check-in, WFH check-in, leave, or
        alternate day moves someone to Inactive; any of those resuming moves them back to Active.
      </p>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Name</th><th style={th}>Department</th><th style={th}>Type</th>
              <th style={th}>Shift</th><th style={th}>Status</th><th style={th}>Login</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((emp, i) => {
              const acct = accounts?.[emp.id];
              const active = emp.active !== false;
              return (
                <tr key={emp.id} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 30}ms`, opacity: active ? 1 : 0.6 }}>
                  <td style={td}><strong>{emp.name}</strong></td>
                  <td style={{ ...td, color: COLORS.muted }}>{emp.department}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{emp.employmentType}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{emp.shiftStart}–{emp.shiftEnd}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                      background: active ? "#E3F5E8" : "#F1F1F3", color: active ? COLORS.green : COLORS.muted,
                    }}>
                      {active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={td}>
                    {acct ? (
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.green }}>{acct.username}</span>
                    ) : (
                      <span style={{ fontSize: 12.5, color: COLORS.muted }}>Not set</span>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconBtn title={acct ? "Reset login" : "Create login"} onClick={() => setCredsFor(emp)}><KeyRound size={14} /></IconBtn>
                      <IconBtn title="Edit" onClick={() => setEditing(emp)}><Edit2 size={14} /></IconBtn>
                      {active ? (
                        <IconBtn title="Deactivate (employee left)" onClick={() => deactivate(emp.id)}><UserX size={14} /></IconBtn>
                      ) : (
                        <IconBtn title="Reactivate" onClick={() => reactivate(emp.id)}><UserCheck size={14} /></IconBtn>
                      )}
                      <IconBtn title="Permanently delete" onClick={() => permanentlyDelete(emp.id, emp.name)}><Trash2 size={14} /></IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleEmployees.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>
                {filter === "inactive" ? "No inactive employees." : filter === "active" ? "No active employees." : "No employees yet."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isOpen && <EmployeeModal initial={editing} onClose={() => setEditing(null)} onSave={save} />}
      {credsFor && (
        <CredentialsModal
          employee={credsFor}
          existing={accounts?.[credsFor.id]}
          onClose={() => setCredsFor(null)}
          onSaved={async () => { await refreshAccounts(); setCredsFor(null); }}
        />
      )}
    </div>
  );
}

function EmployeeModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    id: initial.id, name: initial.name || "", department: initial.department || DEPARTMENTS[0],
    employmentType: initial.employmentType || "Full-time",
    shiftStart: initial.shiftStart || "09:30", shiftEnd: initial.shiftEnd || "18:30",
    zkUserId: initial.zkUserId || "",
  });

  return (
    <Modal title={initial.id ? "Edit employee" : "Add employee"} onClose={onClose}>
      <Field label="Full name">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="e.g. Ananya Rao" />
      </Field>
      <Field label="Department">
        <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} style={inputStyle}>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="Employment type">
        <select value={form.employmentType} onChange={e => setForm({ ...form, employmentType: e.target.value })} style={inputStyle}>
          {["Full-time", "Part-time", "Contract", "Intern"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Shift start" style={{ flex: 1 }}>
          <input type="time" value={form.shiftStart} onChange={e => setForm({ ...form, shiftStart: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Shift end" style={{ flex: 1 }}>
          <input type="time" value={form.shiftEnd} onChange={e => setForm({ ...form, shiftEnd: e.target.value })} style={inputStyle} />
        </Field>
      </div>
      <Field label="ZK Device ID (optional)">
        <input value={form.zkUserId} onChange={e => setForm({ ...form, zkUserId: e.target.value })} style={inputStyle} placeholder="e.g. 7" />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={secondaryBtn}>Cancel</button>
        <button onClick={() => form.name.trim() && onSave(form)} style={{ ...primaryBtn, flex: 1, justifyContent: "center" }} disabled={!form.name.trim()}>
          <Check size={16} /> Save
        </button>
      </div>
    </Modal>
  );
}

function CredentialsModal({ employee, existing, onClose, onSaved }) {
  const [username, setUsername] = useState(existing?.username || employee.name.split(" ")[0].toLowerCase() + "." + (employee.name.split(" ")[1] || "emp").toLowerCase());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!username.trim()) { setError("Username can't be empty."); return; }
    if (password.length < 4) { setError("Password should be at least 4 characters."); return; }
    setBusy(true);
    try {
      await upsertEmployeeCredentials({ employeeId: employee.id, name: employee.name, username, password });
      await onSaved();
    } catch (e) {
      setError(e.message || "Couldn't save credentials.");
    }
    setBusy(false);
  };

  return (
    <Modal title={`${existing ? "Reset" : "Create"} login for ${employee.name}`} onClose={onClose}>
      <Field label="Username">
        <input value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Password" hint="They'll use this with their username to sign in on the Employee tab.">
        <input type="text" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="Set a password" />
      </Field>
      {error && <div style={{ color: COLORS.red, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} style={secondaryBtn}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{ ...primaryBtn, flex: 1, justifyContent: "center", opacity: busy ? 0.7 : 1 }}>
          <Check size={16} /> {busy ? "Saving…" : "Save login"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,51,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }} className="rv-anim-fadein">
      <div className="rv-card rv-anim-slideupin" style={{ padding: 24, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
