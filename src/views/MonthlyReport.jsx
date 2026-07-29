import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ChevronLeft, ChevronRight, Coffee, Repeat, Home, Pencil, X, CalendarHeart, Download } from "lucide-react";
import { COLORS, MANUAL_STATUS_OPTIONS } from "../lib/constants";
import { computeStatus, isFlaggedNotARealCheckIn, fmtTime, fmtHrs, monthKey, daysInMonth, todayStr } from "../lib/utils";
import { StatusPill, StatCard, selectStyle, th, td } from "../components/ui";

// Nicer look for the Status-Edit dropdown and the employee/month pickers —
// layered on top of the shared `selectStyle` from components/ui so we don't
// need to touch that file. Custom chevron + colored border on focus/value.
function statusSelectStyle(value) {
  const active = !!value;
  return {
    ...selectStyle,
    minWidth: 130,
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23808A9D' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    paddingRight: 28,
    borderRadius: 9,
    border: `1.5px solid ${active ? COLORS.blue : COLORS.line}`,
    background: active ? "#EEF4FF" : "#fff",
    color: active ? "#2B4C9E" : COLORS.ink,
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    transition: "border-color 120ms ease, background 120ms ease",
  };
}

// Classifies a day into CL / SL / AL / Short Leave for the summary counts.
// Prefers rec.leaveReason (set either by an approved leave request — see
// App.jsx's decideLeave — or by the Notes shorthand above), and falls back
// to scanning the raw notes text directly so older records that predate
// this feature still get counted correctly without needing to be re-saved.
function leaveCodeFor(rec) {
  if (!rec) return null;
  const reason = (rec.leaveReason || "").toLowerCase();
  if (reason.includes("casual")) return "CL";
  if (reason.includes("sick")) return "SL";
  if (reason.includes("annual")) return "AL";
  if (reason.includes("short")) return "ShortLeave";

  const notes = (rec.notes || "").toLowerCase();
  const has = (code) => new RegExp(`(^|[^a-z])${code}([^a-z]|$)`, "i").test(notes);
  if (has("cl") || notes.includes("casual leave")) return "CL";
  if (has("sl") || notes.includes("sick leave")) return "SL";
  if (has("al") || notes.includes("annual leave")) return "AL";
  if (notes.includes("short leave")) return "ShortLeave";
  return null;
}

// A day can have up to three separate in/out sessions — office, WFH, and a
// second/night session — and all of them contribute worked hours. Previously
// only ONE of these (office OR wfh) was counted, so a day with both an office
// shift and a WFH night session under-reported hours (e.g. showed 6h18m
// instead of 9h18m when there was also a 3h WFH session that same day).
function sessionHours(inT, outT) {
  if (!inT || !outT) return 0;
  const inD = new Date(inT), outD = new Date(outT);
  let ms = outD - inD;
  // Overnight sessions (e.g. a WFH night shift starting before midnight and
  // ending after it) can end up with a checkout that reads "earlier" than
  // check-in once you compare raw timestamps, if the day only rolled over on
  // the clock and not in how the record's date was stored — that produced a
  // negative diff and silently showed 0h. Auto-correct: a negative diff
  // within one calendar day (up to -24h) is treated as crossing midnight and
  // gets +24h, instead of requiring a manual hours override every time.
  if (ms <= 0 && ms > -24 * 3600000) ms += 24 * 3600000;
  return ms > 0 ? ms / 3600000 : 0;
}
function totalWorkedHours(rec) {
  if (!rec) return 0;
  return (
    sessionHours(rec.checkIn, rec.checkOut) +
    sessionHours(rec.wfhCheckIn, rec.wfhCheckOut) +
    sessionHours(rec.secondCheckIn, rec.secondCheckOut)
  );
}
// Whether a day has ANY recorded session at all, worked hours or not — used
// to decide if the Hours column should show "—" vs a (possibly 0h) value.
function hasAnySession(rec) {
  return !!(rec?.checkIn || rec?.wfhCheckIn || rec?.secondCheckIn);
}

// Flattens everything the table's Notes cell shows (holiday name, alt-day/WFH
// tags, leave code, the actual notes text, and the "Edited" flag) into one
// plain string — used by the Excel export since a spreadsheet cell can't hold
// the little colored badges the table renders.
function noteSummaryFor(r, holidayByDate) {
  const parts = [];
  if (holidayByDate[r.date]) parts.push(`Holiday: ${holidayByDate[r.date]}`);
  if (r.rec?.alternateDay) parts.push("Alt. day");
  if (r.rec?.type === "wfh" && !r.rec?.alternateDay) parts.push("WFH");
  const code = leaveCodeFor(r.rec);
  if (code) parts.push(code === "ShortLeave" ? "Short Leave" : code);
  if (r.rec?.notes) parts.push(r.rec.notes);
  if (r.rec?.manuallyEdited) parts.push(r.rec.editedBy ? `Edited by ${r.rec.editedBy}` : "Edited");
  return parts.join(" | ");
}

export default function MonthlyReportView({ employees, attendance, now, onSaveEdit, onUpdateShift, session, publicHolidays = [] }) {
  const [empId, setEmpId] = useState(employees[0]?.id || "");
  const [ym, setYm] = useState(monthKey(todayStr(now)));
  const [editingDate, setEditingDate] = useState(null); // date string of the row currently open in the edit modal
  const [statusSavingDate, setStatusSavingDate] = useState(null); // date whose Status-Edit dropdown is mid-save
  const [statusError, setStatusError] = useState(null); // { date, message }

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
  // A row belongs to whichever side is actually missing a punch — never
  // both lists at once. The auto-flagged case (see isFlaggedNotARealCheckIn)
  // is a missing check-in wearing a checkIn-field disguise, so it's routed
  // to noCheckins rather than noCheckouts even though rec.checkIn is set.
  const noCheckouts = rows.filter(r =>
    !isFlaggedNotARealCheckIn(r.rec) &&
    ((r.rec?.checkIn && !r.rec?.checkOut) || (r.rec?.wfhCheckIn && !r.rec?.wfhCheckOut))
  );
  const noCheckins = rows.filter(r =>
    isFlaggedNotARealCheckIn(r.rec) ||
    (!r.rec?.checkIn && !!r.rec?.checkOut) || (!r.rec?.wfhCheckIn && !!r.rec?.wfhCheckOut)
  );

  const stats = useMemo(() => {
    let present = 0, late = 0, half = 0, noCheckout = 0, noCheckin = 0, wfh = 0, leave = 0, absent = 0, totalHours = 0, workedDays = 0;
    let shortLeave = 0, cl = 0, sl = 0, al = 0;
    rows.forEach(r => {
      if (r.status.tone === "present") present++;
      else if (r.status.tone === "late") { present++; late++; }
      else if (r.status.tone === "half") half++;
      else if (r.status.tone === "no_checkout") noCheckout++;
      else if (r.status.tone === "no_checkin") noCheckin++;
      else if (r.status.tone === "wfh") wfh++;
      else if (r.status.tone === "leave") leave++;
      else if (r.status.tone === "absent") absent++;
      const code = leaveCodeFor(r.rec);
      if (code === "CL") cl++;
      else if (code === "SL") sl++;
      else if (code === "AL") al++;
      else if (code === "ShortLeave") shortLeave++;
      const rawDayHours = r.rec?.manualTotalHours != null ? r.rec.manualTotalHours : totalWorkedHours(r.rec);
      // Guard against any legacy/corrupted manualTotalHours value (e.g. a
      // non-numeric string saved before the Status-Edit validation existed)
      // — coerce to a real number first so a single bad record can never
      // poison the running total or the average calculation.
      const dayHours = Number.isFinite(Number(rawDayHours)) ? Number(rawDayHours) : 0;
      if (dayHours > 0) { totalHours += dayHours; workedDays++; }
    });
    const markedDays = present + half + noCheckout + noCheckin + wfh + absent;
    const attendancePct = markedDays ? Math.round(((present + half + wfh) / markedDays) * 100) : null;
    const avgHours = workedDays && Number.isFinite(totalHours / workedDays) ? totalHours / workedDays : 0;
    return { present, late, half, noCheckout, noCheckin, wfh, leave, absent, shortLeave, cl, sl, al, avgHours, attendancePct };
  }, [rows]);

  // Status-Edit dropdown — lets HR override the auto-calculated status for
  // a single day. Sends manual_status through the same /api/attendance/edit
  // path as the correction modal; "" (Auto) clears the override so
  // computeStatus() goes back to calculating it from check-in/check-out.
  const handleStatusChange = async (date, value) => {
    setStatusError(null);
    setStatusSavingDate(date);
    try {
      await onSaveEdit(emp.id, date, { manualStatus: value || null });
    } catch (e) {
      setStatusError({ date, message: e.message || "Couldn't save that status." });
    }
    setStatusSavingDate(null);
  };

  // Exports exactly what the table below shows for this employee/month — one
  // row per day, with the same check-in/out, hours, status, and notes the HR
  // user is already looking at. `rows` is stored newest-first (see the
  // useMemo above), so this un-reverses it for a normal chronological sheet.
  const handleExportExcel = () => {
    const exportRows = [...rows].reverse().map((r) => {
      const officeHours = sessionHours(r.rec?.checkIn, r.rec?.checkOut);
      const wfhHours = r.rec?.manualWfhHours != null ? r.rec.manualWfhHours : sessionHours(r.rec?.wfhCheckIn, r.rec?.wfhCheckOut);
      const dayHours = r.rec?.manualTotalHours != null ? r.rec.manualTotalHours : totalWorkedHours(r.rec);
      const hours = (hasAnySession(r.rec) || r.rec?.manualTotalHours != null) ? dayHours : null;
      const wfhHoursShown = (r.rec?.wfhCheckIn && r.rec?.wfhCheckOut) || r.rec?.manualWfhHours != null;
      const flaggedNotReal = isFlaggedNotARealCheckIn(r.rec);
      const officeCheckinMissing = !flaggedNotReal && !r.rec?.checkIn && !!r.rec?.checkOut;
      const wfhCheckinMissing = !r.rec?.wfhCheckIn && !!r.rec?.wfhCheckOut;

      return {
        Date: new Date(r.date + "T00:00:00").toLocaleDateString([], { weekday: "short", year: "numeric", month: "short", day: "numeric" }),
        Status: r.status?.label || "",
        "Check-in": flaggedNotReal ? "No check-in" : officeCheckinMissing ? "No check-in" : (r.rec?.checkIn ? fmtTime(r.rec.checkIn) : ""),
        "Check-out": flaggedNotReal
          ? `${fmtTime(r.rec.checkIn)} (likely checkout — no check-in recorded)`
          : officeCheckinMissing ? fmtTime(r.rec.checkOut)
          : r.rec?.checkIn ? (r.rec?.checkOut ? fmtTime(r.rec.checkOut) : "No checkout") : "",
        "Office Hours": (r.rec?.checkIn && r.rec?.checkOut) ? Number(officeHours.toFixed(2)) : "",
        "WFH in": wfhCheckinMissing ? "No check-in" : (r.rec?.wfhCheckIn ? fmtTime(r.rec.wfhCheckIn) : ""),
        "WFH out": r.rec?.wfhCheckIn ? (r.rec?.wfhCheckOut ? fmtTime(r.rec.wfhCheckOut) : "No checkout") : (wfhCheckinMissing ? fmtTime(r.rec.wfhCheckOut) : ""),
        "WFH Hours": wfhHoursShown ? Number(wfhHours.toFixed(2)) : "",
        "Total Hours": hours != null ? Number(hours.toFixed(2)) : "",
        Notes: noteSummaryFor(r, holidayByDate),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws["!cols"] = [
      { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 36 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 45 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    const monthLabel = new Date(ym + "-01").toLocaleDateString([], { month: "long", year: "numeric" });
    XLSX.writeFile(wb, `${emp.name} - ${monthLabel}.xlsx`);
  };

  if (!emp) return <p style={{ color: COLORS.muted }}>No employees yet — add some in the Employees tab first.</p>;

  return (
    <div className="rv-anim-fadein">
      <h1 className="rv-header-in" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 18px" }}>Monthly Report</h1>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <select value={empId} onChange={e => setEmpId(e.target.value)} style={{ ...statusSelectStyle(empId), minWidth: 220, fontWeight: 700 }}>
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
        <StatCard label="Present" value={stats.present} tone="present" />
        <StatCard label="Late" value={stats.late} tone="half" />
        <StatCard label="Half day" value={stats.half} tone="half" />
        <StatCard label="Short Leave" value={stats.shortLeave} tone="half" />
        <StatCard label="WFH" value={stats.wfh} tone="present" />
        <StatCard label="Leave" value={stats.leave} tone="leave" />
        <StatCard label="CL" value={stats.cl} tone="leave" />
        <StatCard label="SL" value={stats.sl} tone="leave" />
        <StatCard label="AL" value={stats.al} tone="leave" />
        <StatCard label="Absent" value={stats.absent} tone="absent" />
        <StatCard label="Attendance" value={stats.attendancePct != null ? `${stats.attendancePct}%` : "—"} tone="present" />
        <StatCard label="Avg hrs/day" value={stats.avgHours ? stats.avgHours.toFixed(1) + "h" : "—"} tone="pending" />
        <StatCard label="Alternate days worked" value={alternates.length} tone="present" />
        <StatCard label="Missing checkouts" value={noCheckouts.length} tone="half" />
        <StatCard label="Missing check-ins" value={noCheckins.length} tone="half" />
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Full attendance — {emp.name}</h3>
          <button
            onClick={handleExportExcel}
            title="Download this employee's month as an Excel file"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 8,
              padding: "7px 13px", fontSize: 13, fontWeight: 700, color: COLORS.ink, cursor: "pointer",
            }}
          >
            <Download size={14} /> Download Excel
          </button>
        </div>
        <table className="rv-table-hover" style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Date</th><th style={th}>Status</th><th style={th}>Check-in</th>
              <th style={th}>Check-out</th><th style={th}>Office Hours</th>
              <th style={th}>WFH in</th><th style={th}>WFH out</th><th style={th}>WFH Hours</th>
              <th style={th}>Total Hours</th><th style={th}>Notes</th><th style={th}>Status-Edit</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const officeHours = sessionHours(r.rec?.checkIn, r.rec?.checkOut);
              const wfhHours = r.rec?.manualWfhHours != null ? r.rec.manualWfhHours : sessionHours(r.rec?.wfhCheckIn, r.rec?.wfhCheckOut);
              const dayHours = r.rec?.manualTotalHours != null ? r.rec.manualTotalHours : totalWorkedHours(r.rec);
              const hours = (hasAnySession(r.rec) || r.rec?.manualTotalHours != null) ? dayHours : null;
              const wfhHoursShown = (r.rec?.wfhCheckIn && r.rec?.wfhCheckOut) || r.rec?.manualWfhHours != null;
              const rowLeaveCode = leaveCodeFor(r.rec);
              const missedCheckout = (r.rec?.checkIn && !r.rec?.checkOut) || (r.rec?.wfhCheckIn && !r.rec?.wfhCheckOut);
              const flaggedNotReal = isFlaggedNotARealCheckIn(r.rec);
              const officeCheckinMissing = !flaggedNotReal && !r.rec?.checkIn && !!r.rec?.checkOut;
              const wfhCheckinMissing = !r.rec?.wfhCheckIn && !!r.rec?.wfhCheckOut;
              return (
                <tr key={r.date} className="rv-row-in" style={{ borderTop: `1px solid ${COLORS.line}`, animationDelay: `${i * 25}ms` }}>
                  <td style={td}>{new Date(r.date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td style={td}><StatusPill {...r.status} /></td>
                  <td style={{ ...td, color: (flaggedNotReal || officeCheckinMissing) ? COLORS.red : COLORS.muted, fontWeight: (flaggedNotReal || officeCheckinMissing) ? 700 : 400 }}>
                    {flaggedNotReal ? "No check-in" : officeCheckinMissing ? "No check-in" : fmtTime(r.rec?.checkIn)}
                  </td>
                  <td style={{ ...td, color: (missedCheckout && !flaggedNotReal) ? COLORS.red : COLORS.muted, fontWeight: (missedCheckout && !flaggedNotReal) ? 700 : 400 }}>
                    {flaggedNotReal
                      ? `${fmtTime(r.rec.checkIn)} (likely checkout — no check-in recorded)`
                      : r.rec?.checkIn ? (r.rec?.checkOut ? fmtTime(r.rec.checkOut) : "No checkout") : "—"}
                  </td>
                  <td style={{ ...td, color: COLORS.muted }}>
                    {(r.rec?.checkIn && r.rec?.checkOut) ? fmtHrs(officeHours) : "—"}
                  </td>
                  <td style={{ ...td, color: wfhCheckinMissing ? COLORS.red : COLORS.muted, fontWeight: wfhCheckinMissing ? 700 : 400 }}>
                    {wfhCheckinMissing ? "No check-in" : fmtTime(r.rec?.wfhCheckIn)}
                  </td>
                  <td style={{ ...td, color: missedCheckout ? COLORS.red : COLORS.muted, fontWeight: missedCheckout ? 700 : 400 }}>
                    {r.rec?.wfhCheckIn ? (r.rec?.wfhCheckOut ? fmtTime(r.rec.wfhCheckOut) : "No checkout") : "—"}
                  </td>
                  <td style={{ ...td, color: COLORS.muted }}>
                    {wfhHoursShown ? fmtHrs(wfhHours) : "—"}
                  </td>
                  <td style={{ ...td, color: COLORS.muted, fontWeight: 700 }}>{hours != null ? fmtHrs(hours) : "—"}</td>
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
                    {rowLeaveCode && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        color: rowLeaveCode === "ShortLeave" ? "#B2650A" : "#3E5A9E", fontWeight: 700, fontSize: 12,
                      }}>
                        {rowLeaveCode === "ShortLeave" ? "Short Leave" : rowLeaveCode}
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
                  <td style={td}>
                    <select
                      value={r.rec?.manualStatus || ""}
                      onChange={e => handleStatusChange(r.date, e.target.value)}
                      disabled={statusSavingDate === r.date}
                      style={{ ...statusSelectStyle(r.rec?.manualStatus), opacity: statusSavingDate === r.date ? 0.6 : 1 }}
                    >
                      {MANUAL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {statusError?.date === r.date && (
                      <div style={{ color: COLORS.red, fontSize: 11, fontWeight: 600, marginTop: 4, maxWidth: 140 }}>
                        {statusError.message}
                      </div>
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
              <tr><td colSpan={12} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No records this month yet.</td></tr>
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
          onUpdateShift={onUpdateShift}
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

// Recognizes leave-code shorthand and check-in/out phrasing typed into Notes,
// so HR doesn't have to also fill separate fields by hand. Case-insensitive.
// Leave codes: CL, SL, AL, "Short Leave" -> manualStatus + a canonical
// leaveReason/code, so these can be individually counted in the stats cards
// (Casual/Sick/Annual/Short leave), the same way approved leave requests
// already store a leaveReason (see App.jsx's decideLeave).
// Times: "check in 9:30am" / "check out 6:05 pm" -> checkIn/checkOut patch.
const NOTES_LEAVE_MAP = {
  cl: { status: "leave", reason: "Casual Leave", code: "CL" },
  "casual leave": { status: "leave", reason: "Casual Leave", code: "CL" },
  sl: { status: "leave", reason: "Sick Leave", code: "SL" },
  "sick leave": { status: "leave", reason: "Sick Leave", code: "SL" },
  al: { status: "leave", reason: "Annual Leave", code: "AL" },
  "annual leave": { status: "leave", reason: "Annual Leave", code: "AL" },
  "short leave": { status: "half", reason: "Short Leave", code: "ShortLeave" },
};
function parseNotesForAutoFields(notes, dateStr) {
  const out = {};
  if (!notes) return out;
  const lower = notes.toLowerCase();

  for (const code of Object.keys(NOTES_LEAVE_MAP)) {
    const re = new RegExp(`(^|[^a-z])${code}([^a-z]|$)`, "i");
    if (re.test(lower)) {
      const hit = NOTES_LEAVE_MAP[code];
      out.manualStatus = hit.status;
      out.leaveReason = hit.reason;
      break;
    }
  }

  const timeRe = /check[\s-]?(in|out)\s*(?:at|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
  let m;
  while ((m = timeRe.exec(notes))) {
    const [, dir, hRaw, minRaw, ampm] = m;
    let h = parseInt(hRaw, 10);
    const min = minRaw ? parseInt(minRaw, 10) : 0;
    if (ampm) {
      const isPM = ampm.toLowerCase() === "pm";
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
    }
    const d = new Date(`${dateStr}T00:00:00`);
    d.setHours(h, min, 0, 0);
    if (dir.toLowerCase() === "in") out.checkIn = d.toISOString();
    else out.checkOut = d.toISOString();
  }
  return out;
}

function EditAttendanceModal({ date, emp, rec, onClose, onSave, onUpdateShift }) {
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
  const [showHours, setShowHours] = useState(rec?.manualWfhHours != null || rec?.manualTotalHours != null);
  const [wfhHoursOverride, setWfhHoursOverride] = useState(rec?.manualWfhHours != null ? String(rec.manualWfhHours) : "");
  const [totalHoursOverride, setTotalHoursOverride] = useState(rec?.manualTotalHours != null ? String(rec.manualTotalHours) : "");
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
    if (showHours && wfhHoursOverride && isNaN(parseFloat(wfhHoursOverride))) {
      setError("WFH hours override must be a number (e.g. 3.5).");
      return;
    }
    if (showHours && totalHoursOverride && isNaN(parseFloat(totalHoursOverride))) {
      setError("Total hours override must be a number (e.g. 8.5).");
      return;
    }
    setSaving(true);
    try {
      if (showShift && (shiftStart !== emp.shiftStart || shiftEnd !== emp.shiftEnd)) {
        await onUpdateShift(emp.id, shiftStart, shiftEnd);
      }
      const patch = { checkIn: inVal, checkOut: outVal, notes };
      if (showSecond) {
        patch.secondCheckIn = fromDatetimeLocal(secondCheckIn);
        patch.secondCheckOut = fromDatetimeLocal(secondCheckOut);
      }
      if (showHours) {
        patch.manualWfhHours = wfhHoursOverride ? parseFloat(wfhHoursOverride) : null;
        patch.manualTotalHours = totalHoursOverride ? parseFloat(totalHoursOverride) : null;
      }
      // Notes shorthand (CL/SL/AL/Short Leave, "check in/out 9:30am") auto-fills
      // the matching real fields instead of just sitting there as text — so a
      // one-line note is enough and HR doesn't have to duplicate it into the
      // dropdown or the time pickers by hand. Explicit field edits above always
      // win; this only fills in what the person left untouched.
      const auto = parseNotesForAutoFields(notes, date);
      if (auto.manualStatus && !rec?.manualStatus) patch.manualStatus = auto.manualStatus;
      if (auto.leaveReason && !rec?.leaveReason) patch.leaveReason = auto.leaveReason;
      if (auto.checkIn && !inVal) patch.checkIn = auto.checkIn;
      if (auto.checkOut && !outVal) patch.checkOut = auto.checkOut;
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

          {!showHours ? (
            <button onClick={() => setShowHours(true)} style={linkBtn}>+ Override WFH / Total hours</button>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10 }}>
                <Field label="WFH hours (decimal, e.g. 3.5)">
                  <input
                    type="number" step="0.1" min="0" placeholder="Auto"
                    value={wfhHoursOverride} onChange={e => setWfhHoursOverride(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Total hours (decimal, e.g. 8.5)">
                  <input
                    type="number" step="0.1" min="0" placeholder="Auto"
                    value={totalHoursOverride} onChange={e => setTotalHoursOverride(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <p style={{ margin: "-6px 0 0", fontSize: 11.5, color: COLORS.muted }}>
                Leave blank to keep auto-calculating from check-in/out times. Useful when a WFH session
                crosses midnight and shows 0h by mistake.
              </p>
            </>
          )}

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Forgot to check out, corrected by HR — or CL / SL / AL / Short Leave, check in 9:30am, check out 6:05pm"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
            <span style={{ fontSize: 11, color: COLORS.muted }}>
              Tip: typing CL / SL / AL / Short Leave, or "check in 9:30am" / "check out 6:05pm" here
              auto-fills the matching status or time field on save.
            </span>
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