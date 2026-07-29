import { GRACE_MIN, HALFDAY_HOURS } from "./constants";

export function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
export function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function fmtTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" });
}
export function fmtHrs(h) {
  if (h == null) return "—";
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm}m`;
}
export function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function minutesOfDay(d) {
  const dt = new Date(d);
  return dt.getHours() * 60 + dt.getMinutes();
}
export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}
export function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// Label shown for a manual status override — keyed by the same tone names
// used in TONE_STYLES below, so an override always renders with a color
// that matches its meaning elsewhere in the app.
export const MANUAL_STATUS_LABELS = {
  present: "Present", half: "Half Day", wfh: "WFH",
  short_leave: "Short Leave", holiday: "Holiday", absent: "Absent",
};

// cdata.js flags a lone punch that lands well after shift_end (with no
// earlier punch that day) by prefixing its auto-note with "Auto-flag:" —
// it still has to store the raw punch time SOMEWHERE (check_in is the only
// field a first punch of the day can land in), but it's really a checkout
// with a missed/lost check-in, not a genuine check-in. Shared here so both
// the Status pill (computeStatus) and the table cells that render the raw
// time (MonthlyReport.jsx) agree on which rows this applies to.
export function isFlaggedNotARealCheckIn(rec) {
  return !!(rec?.notes && rec.notes.startsWith("Auto-flag:") && rec?.checkIn && !rec?.checkOut);
}

// rec: {checkIn, checkOut, type, wfhCheckIn, wfhCheckOut, alternateDay, manualStatus}
// dateStr: "YYYY-MM-DD" for the day being evaluated — needed to detect weekends
export function computeStatus(emp, rec, isPastDay, nowMinutes, dateStr) {
  // A manual override (set from the Monthly Report's Status-Edit dropdown)
  // wins outright — skip the check-in/check-out calculation entirely so HR's
  // explicit choice is never second-guessed by the auto logic.
  if (rec?.manualStatus) {
    return { label: MANUAL_STATUS_LABELS[rec.manualStatus] || rec.manualStatus, tone: rec.manualStatus, manual: true };
  }

  const autoFlaggedCheckout = isFlaggedNotARealCheckIn(rec);
  const hasOfficeIn = !!rec?.checkIn, hasOfficeOut = !!rec?.checkOut;
  const hasWfhIn = !!rec?.wfhCheckIn, hasWfhOut = !!rec?.wfhCheckOut;
  const workedAnyway = hasOfficeIn || hasOfficeOut || hasWfhIn || hasWfhOut || rec?.alternateDay;

  // Weekend with nothing logged → Holiday (not Leave, not Absent)
  if (dateStr) {
    const day = new Date(dateStr + "T00:00:00").getDay(); // 0 = Sun, 6 = Sat
    if ((day === 0 || day === 6) && !workedAnyway && rec?.type !== "leave") {
      return { label: "Holiday", tone: "holiday" };
    }
  }

  // Only an explicit leave record counts as Leave
  if (rec?.type === "leave") return { label: "Leave", tone: "leave" };

  if (!workedAnyway) {
    // No record at all — stays blank whether it's today or a past weekday
    return { label: "", tone: "blank" };
  }

  // A lone evening punch that cdata.js couldn't tell apart from a real
  // check-in is really a checkout with a missed/lost check-in — flag it
  // that way instead of treating the stored time as an arrival.
  if (autoFlaggedCheckout) {
    return { label: "No check-in", tone: "no_checkin" };
  }

  // From here, "missing" is derived purely by comparing check-in vs
  // check-out on whichever side (office or WFH) has activity — never an
  // independently-decided status.
  if (hasOfficeIn || hasOfficeOut) {
    if (!hasOfficeIn && hasOfficeOut) {
      return { label: "No check-in", tone: "no_checkin" };
    }
    // else hasOfficeIn is true — falls through to the full present/late/half
    // logic below, which already derives "No checkout" from checkOut alone.
  } else if (hasWfhIn || hasWfhOut) {
    if (hasWfhIn && !hasWfhOut) return { label: "WFH · No checkout", tone: "wfh" };
    if (!hasWfhIn && hasWfhOut) return { label: "No check-in", tone: "no_checkin" };
    return { label: "WFH", tone: "wfh" };
  }

  if (!hasOfficeIn) {
    // Nothing left unaccounted for (e.g. an alternateDay flag with no
    // punches at all) — stays blank as before.
    return { label: "", tone: "blank" };
  }

  const inMin = minutesOfDay(rec.checkIn);
  const shiftStartMin = timeToMinutes(emp.shiftStart);
  const isLate = inMin > shiftStartMin + GRACE_MIN;
  let hours = null;
  if (rec.checkOut) hours = (new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000;

  if (!rec.checkOut) {
    if (!isPastDay) return { label: isLate ? "Late" : "Present", tone: isLate ? "late" : "present" };
    return { label: "No checkout", tone: "no_checkout" };
  }
  if (hours != null && hours < HALFDAY_HOURS) {
    return { label: `Half Day${isLate ? " · Late" : ""}`, tone: "half" };
  }
  if (isLate) return { label: "Late", tone: "late" };
  return { label: "Present", tone: "present" };
}

export const TONE_STYLES = {
  present: { bg: "#E7F6EF", fg: "#2F9E6E", dot: "#2F9E6E" },
  wfh: { bg: "#E9EEFC", fg: "#0EA5E9", dot: "#0EA5E9" },
  late: { bg: "#FBF0DC", fg: "#D99A2B", dot: "#D99A2B" },
  half: { bg: "#FBF0DC", fg: "#D99A2B", dot: "#D99A2B" },
  no_checkout: { bg: "#FDEDE3", fg: "#D97A3F", dot: "#D97A3F" },
  no_checkin: { bg: "#FCE8E8", fg: "#C0392B", dot: "#C0392B" },
  absent: { bg: "#FBE8E7", fg: "#D9534F", dot: "#D9534F" },
  leave: { bg: "#E9EEFC", fg: "#3E5A9E", dot: "#3E5A9E" },
  short_leave: { bg: "#EFEAFB", fg: "#6C4FC9", dot: "#6C4FC9" },
  pending: { bg: "#EEF0F9", fg: "#5E6B85", dot: "#B7BBD6" },
  holiday: { bg: "#F0EDF9", fg: "#7B61B3", dot: "#7B61B3" },
  blank: { bg: "transparent", fg: "transparent", dot: "transparent" },
};