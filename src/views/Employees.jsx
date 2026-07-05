import React, { useState } from "react";
import { Plus, Edit2, Trash2, Check, X, KeyRound } from "lucide-react";
import { COLORS, DEPARTMENTS } from "../lib/constants";
import { uid } from "../lib/utils";
import { upsertEmployeeCredentials } from "../lib/db";
import { IconBtn, Field, inputStyle, primaryBtn, secondaryBtn, th, td } from "../components/ui";

export default function EmployeesView({ employees, setEmployees, accounts, refreshAccounts }) {
  const [editing, setEditing] = useState(null);
  const [credsFor, setCredsFor] = useState(null);
  const isOpen = editing !== null;

  const remove = (id) => setEmployees(employees.filter(e => e.id !== id));

  const save = (emp) => {
    if (emp.id) setEmployees(employees.map(e => e.id === emp.id ? emp : e));
    else setEmployees([...employees, { ...emp, id: uid("emp") }]);
    setEditing(null);
  };

  return (
    <div className="rv-anim-fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Employees</h1>
        <button onClick={() => setEditing({})} style={primaryBtn}><Plus size={16} /> Add employee</button>
      </div>

      <div className="rv-card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Name</th><th style={th}>Department</th><th style={th}>Type</th>
              <th style={th}>Shift</th><th style={th}>Login</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => {
              const acct = accounts?.[emp.id];
              return (
                <tr key={emp.id} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 30}ms` }}>
                  <td style={td}><strong>{emp.name}</strong></td>
                  <td style={{ ...td, color: COLORS.muted }}>{emp.department}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{emp.employmentType}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{emp.shiftStart}–{emp.shiftEnd}</td>
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
                      <IconBtn title="Remove" onClick={() => remove(emp.id)}><Trash2 size={14} /></IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No employees yet.</td></tr>
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
