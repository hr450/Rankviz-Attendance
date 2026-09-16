import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, UserPlus } from "lucide-react";
import { COLORS, DEPARTMENTS } from "../lib/constants";
import { uid } from "../lib/utils";
import { nameKey, parseWorkbook } from "../lib/attendanceImport";
import { saveAttendanceRecord } from "../lib/db";
import Dropdown from "../components/Dropdown";
import { th, td } from "../components/ui";

/* Brings the standalone uploader inside the app.
   The parsing itself is untouched — it lives in lib/attendanceImport.js. What
   changes here is everything around it: no separate login (HR is already
   signed in), no base-URL box, and employees come from the app's own state
   instead of a second /api/employees call.

   Importing rewrites real attendance, so it asks before it writes and shows
   exactly what it is about to do first. */

const YEAR_NOW = new Date().getFullYear();

function guessYearFromName(fileName) {
  const m = String(fileName || "").match(/(20\d{2})/);
  return m ? Number(m[1]) : YEAR_NOW;
}

export default function AttendanceImportView({ employees, setEmployees }) {
  const [file, setFile] = useState(null);
  const [fileYear, setFileYear] = useState(YEAR_NOW);
  const [parsed, setParsed] = useState(null);   // { rows, payloads, unmatched, format }
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, failed }
  const [result, setResult] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const inputRef = useRef(null);

  // The three lookups mapRows() needs to turn a name or device id on the
  // sheet into an employee. A name that lands on two people is marked
  // ambiguous rather than guessed at.
  const lookups = useMemo(() => {
    const zkMap = {}, nameMap = {}, nameKeyMap = {};
    for (const e of employees) {
      if (e.zkUserId) zkMap[String(e.zkUserId)] = e.id;
      if (e.name) {
        nameMap[e.name.toLowerCase()] = e.id;
        const k = nameKey(e.name);
        if (k) nameKeyMap[k] = (k in nameKeyMap && nameKeyMap[k] !== e.id) ? "__AMBIGUOUS__" : e.id;
      }
    }
    return { zkMap, nameMap, nameKeyMap };
  }, [employees]);

  const reset = () => {
    setFile(null); setParsed(null); setError(null);
    setConfirming(false); setProgress(null); setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // yearOverride is set when HR picks a year from the dropdown; without it
  // the year is guessed from the file name, as before.
  const handleFile = async (f, yearOverride) => {
    if (!f) return;
    setError(null); setParsed(null); setResult(null); setProgress(null);
    setFile(f);
    const year = yearOverride ?? guessYearFromName(f.name);
    setFileYear(year);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const out = parseWorkbook(wb, { ...lookups, fileYear: year });
      if (!out.ok) { setError(out.error); return; }
      setParsed(out);
    } catch (e) {
      setError(e.message || "Couldn't read that file.");
    }
  };

  // A name on the sheet that isn't in the app yet can be added straight
  // from here, as well as from the Employees tab. It gets the same defaults
  // as a blank "Add employee" form; email, device ID and shift can be filled
  // in on the Employees tab later. A name already in the app (ignoring
  // spacing, dots and case) is never added a second time.
  const addEmployees = async (names) => {
    if (!setEmployees || !names.length) return;
    const existing = new Set(employees.map(e => nameKey(e.name)));
    const fresh = [];
    for (const n of names) {
      const k = nameKey(n);
      if (!k || existing.has(k)) continue;
      existing.add(k);
      fresh.push({
        id: uid("emp"), name: n, department: DEPARTMENTS[0], employmentType: "Full-time",
        shiftStart: "09:30", shiftEnd: "18:30", graceMinutes: "", zkUserId: "", email: "", active: true,
      });
    }
    if (!fresh.length) return;
    setAdding(true); setAddError(null);
    const ok = await setEmployees([...employees, ...fresh]);
    setAdding(false);
    if (ok === false) setAddError("Couldn't save the new employee. Reload the page and try again.");
  };

  const addAll = () => {
    if (!unmatched.length) return;
    const msg = `Add ${unmatched.length} new employee${unmatched.length === 1 ? "" : "s"}?\n\n` +
      `Only do this if they're all new people. Anyone already in the app under a different spelling would get a second profile.`;
    if (window.confirm(msg)) addEmployees(unmatched);
  };

  // When the employee list changes (someone was just added, here or on the
  // Employees tab), check the loaded file again so their days move into
  // "Ready to write" without choosing the file a second time.
  useEffect(() => {
    if (file && parsed && !progress && !result) handleFile(file, fileYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups]);

  const send = async () => {
    if (!parsed?.payloads?.length) return;
    setConfirming(false);
    const total = parsed.payloads.length;
    setProgress({ done: 0, total, failed: 0 });
    let done = 0, failed = 0;

    // Four at a time: fast enough to be worth it, gentle enough that a
    // month's worth of rows doesn't arrive as one burst.
    const queue = [...parsed.payloads];
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await saveAttendanceRecord(item.employeeId, item.date, item.rec, "excel-import");
        } catch {
          failed++;
        }
        done++;
        setProgress({ done, total, failed });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setProgress(null);
    setResult({ total, failed, saved: total - failed });
  };

  const unmatched = parsed?.unmatched || [];

  return (
    <div className="rv-anim-fadein">
      <h1 className="rv-header-in" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>Attendance Import</h1>
      <p style={{ color: COLORS.muted, fontSize: 14, margin: "0 0 20px", maxWidth: "72ch" }}>
        Reads a monthly attendance workbook and writes each day into the app. A blank weekday stays blank —
        absent is only imported where the sheet's Status column says so.
      </p>

      <div className="rv-card" style={{ padding: "18px 20px", marginBottom: 18 }}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={e => handleFile(e.target.files?.[0])}
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => inputRef.current?.click()} style={primaryBtn}>
            <Upload size={15} /> Choose a workbook
          </button>
          {file && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}>
              <FileSpreadsheet size={15} color={COLORS.green} /> {file.name}
              <button onClick={reset} title="Clear" style={iconBtn}><X size={13} /></button>
            </span>
          )}
          {file && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.muted }}>
              Year
              <Dropdown
                value={fileYear}
                onChange={(y) => { if (file) handleFile(file, Number(y)); else setFileYear(Number(y)); }}
                options={[YEAR_NOW - 2, YEAR_NOW - 1, YEAR_NOW, YEAR_NOW + 1].map(y => ({ value: y, label: String(y) }))}
                minWidth={104}
              />
            </span>
          )}
        </div>
        {error && (
          <p style={{ margin: "12px 0 0", color: COLORS.red, fontSize: 13, fontWeight: 600 }}>{error}</p>
        )}
      </div>

      {parsed && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 18 }}>
            <Figure label="Layout detected" value={FORMAT_LABELS[parsed.format] || parsed.format} />
            <Figure label="Day records read" value={parsed.rows.length} />
            <Figure label="Ready to write" value={parsed.payloads.length} tone="green" />
            <Figure label="Unmatched names" value={unmatched.length} tone={unmatched.length ? "red" : "muted"} />
          </div>

          {parsed.unknownStatuses?.length > 0 && (
            <div className="rv-card" style={{ padding: "14px 20px", marginBottom: 18, borderLeft: `3px solid ${COLORS.red}` }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                {parsed.unknownStatuses.length} status value{parsed.unknownStatuses.length === 1 ? "" : "s"} weren't
                recognised: {parsed.unknownStatuses.slice(0, 12).map(u => `"${u}"`).join(", ")}. Those days import as
                an ordinary present day.
              </p>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="rv-card" style={{ padding: "16px 20px", marginBottom: 18, borderLeft: `3px solid ${COLORS.amber}` }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                <AlertTriangle size={15} color={COLORS.amber} /> {unmatched.length} name{unmatched.length === 1 ? "" : "s"} didn't match an employee
              </h3>
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: COLORS.muted }}>
                These rows will be skipped. If it's a new person, click <strong>Add</strong> to create them as an
                employee. If they're already in the app under a different spelling, fix the spelling in the sheet
                or on the Employees tab instead, so they don't end up with two profiles.
              </p>
              {setEmployees && (
                <div style={{ marginBottom: 10 }}>
                  <button onClick={addAll} disabled={adding} style={{ ...secondaryBtn, padding: "6px 12px", fontSize: 12.5, opacity: adding ? 0.6 : 1 }}>
                    <UserPlus size={14} /> {adding ? "Adding…" : `Add all ${unmatched.length} as new employees`}
                  </button>
                </div>
              )}
              {addError && (
                <p style={{ margin: "0 0 10px", color: COLORS.red, fontSize: 12.5, fontWeight: 600 }}>{addError}</p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {unmatched.map(n => (
                  <span key={n} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "#FBF0DC", color: "#8A6200", fontWeight: 700, fontSize: 12,
                    padding: "4px 5px 4px 10px", borderRadius: 999,
                  }}>
                    {n}
                    {setEmployees && (
                      <button
                        onClick={() => addEmployees([n])}
                        disabled={adding}
                        title={`Add ${n} as a new employee`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 3, border: "none", cursor: "pointer",
                          background: "#fff", color: "#8A6200", fontWeight: 700, fontSize: 11,
                          padding: "2px 8px", borderRadius: 999,
                        }}
                      >
                        <UserPlus size={11} /> Add
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rv-card" style={{ padding: "16px 20px", marginBottom: 18, overflowX: "auto" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>
              First 25 rows — check these before writing
            </h3>
            <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
                  <th style={th}>Employee</th><th style={th}>Date</th><th style={th}>Check-in</th>
                  <th style={th}>Check-out</th><th style={th}>Status</th><th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {parsed.payloads.slice(0, 25).map((p, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                    <td style={td}><strong>{p.name || employees.find(e => e.id === p.employeeId)?.name || "—"}</strong></td>
                    <td style={{ ...td, color: COLORS.muted }}>{p.date}</td>
                    <td style={{ ...td, color: COLORS.muted }}>{shortTime(p.rec?.checkIn)}</td>
                    <td style={{ ...td, color: COLORS.muted }}>{shortTime(p.rec?.checkOut)}</td>
                    <td style={{ ...td, color: COLORS.muted }}>{p.rec?.manualStatus || p.rec?.type || "—"}</td>
                    <td style={{ ...td, color: COLORS.muted, maxWidth: 260 }}>{p.rec?.notes || "—"}</td>
                  </tr>
                ))}
                {parsed.payloads.length === 0 && (
                  <tr><td colSpan={6} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>
                    Nothing to write from this file.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {!progress && !result && parsed.payloads.length > 0 && (
            <div className="rv-card" style={{ padding: "16px 20px" }}>
              {!confirming ? (
                <button onClick={() => setConfirming(true)} style={primaryBtn}>
                  Write {parsed.payloads.length} records
                </button>
              ) : (
                <div>
                  <p style={{ margin: "0 0 12px", fontSize: 13.5, fontWeight: 600 }}>
                    This overwrites the days listed above for {new Set(parsed.payloads.map(p => p.employeeId)).size} employees.
                    Days already corrected by hand in Monthly Report will be replaced by what the sheet says.
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={send} style={primaryBtn}>Yes, write them</button>
                    <button onClick={() => setConfirming(false)} style={secondaryBtn}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {progress && (
            <div className="rv-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
                Writing {progress.done} of {progress.total}…
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "#F0F2F8", overflow: "hidden" }}>
                <div style={{
                  width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  height: "100%", background: COLORS.green, transition: "width .2s ease",
                }} />
              </div>
            </div>
          )}

          {result && (
            <div className="rv-card" style={{ padding: "16px 20px" }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                <CheckCircle2 size={16} color={COLORS.green} /> {result.saved} of {result.total} records written
              </h3>
              {result.failed > 0 && (
                <p style={{ margin: "0 0 10px", fontSize: 13, color: COLORS.red, fontWeight: 600 }}>
                  {result.failed} failed. Load the file again to retry those.
                </p>
              )}
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: COLORS.muted }}>
                Reload the page to see them in Monthly Report and Leave Summary.
              </p>
              <button onClick={reset} style={secondaryBtn}>Import another file</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const FORMAT_LABELS = {
  punch: "Punch log — one row per scan",
  daySheets: "One tab per date",
  employeeSheets: "One tab per employee",
  columns: "One row per employee per day",
};

function shortTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Figure({ label, value, tone = "muted" }) {
  const color = tone === "green" ? COLORS.green : tone === "red" ? COLORS.red : COLORS.ink;
  return (
    <div className="rv-card" style={{ padding: "14px 16px", borderRadius: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color }}>{value}</div>
    </div>
  );
}

const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 7,
  background: COLORS.ink, color: "#fff", border: "none", borderRadius: 9,
  padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};
const secondaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 7,
  background: "#fff", color: COLORS.ink, border: `1px solid ${COLORS.line}`, borderRadius: 9,
  padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};
const iconBtn = {
  background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 7,
  cursor: "pointer", color: COLORS.muted, padding: "3px 5px", display: "inline-flex",
};