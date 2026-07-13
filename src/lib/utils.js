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

// rec: {checkIn, checkOut, type, wfhCheckIn, wfhCheckOut, alternateDay}
// dateStr: "YYYY-MM-DD" for the day being evaluated — needed to detect weekends
export function computeStatus(emp, rec, isPastDay, nowMinutes, dateStr) {
  const hasOfficePunch = !!rec?.checkIn;
  const hasWfhPunch = !!rec?.wfhCheckIn;
  const workedAnyway = hasOfficePunch || hasWfhPunch || rec?.alternateDay;

  // Weekend with nothing logged → Holiday (not Leave, not Absent)
  if (dateStr) {
    const day = new Date(dateStr + "T00:00:00").getDay(); // 0 = Sun, 6 = Sat
    if ((day === 0 || day === 6) && !workedAnyway && rec?.type !== "leave") {
      return { label: "Holiday", tone: "holiday" };
    }
  }

  // Only an explicit leave record counts as Leave
  if (rec?.type === "leave") return { label: "Leave", tone: "leave" };

  if (!hasOfficePunch && !hasWfhPunch) {
    // No record at all — stays blank whether it's today or a past weekday
    return { label: "", tone: "blank" };
  }

  if (hasWfhPunch && !hasOfficePunch) {
    if (!rec.wfhCheckOut) return { label: "WFH · No checkout", tone: "wfh" };
    return { label: "WFH", tone: "wfh" };
  }

  const inMin = minutesOfDay(rec.checkIn);
  const shiftStartMin = timeToMinutes(emp.shiftStart);
  const isLate = inMin > shiftStartMin + GRACE_MIN;
  let hours = null;
  if (rec.checkOut) hours = (new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000;

  if (!rec.checkOut) {
    if (!isPastDay) return { label: isLate ? "Late" : "Present", tone: isLate ? "late" : "present" };
    return { label: "No checkout", tone: "half" };
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
  absent: { bg: "#FBE8E7", fg: "#D9534F", dot: "#D9534F" },
  leave: { bg: "#E9EEFC", fg: "#3E5A9E", dot: "#3E5A9E" },
  pending: { bg: "#EEF0F9", fg: "#5E6B85", dot: "#B7BBD6" },
  holiday: { bg: "#F0EDF9", fg: "#7B61B3", dot: "#7B61B3" },
  blank: { bg: "transparent", fg: "transparent", dot: "transparent" },
};
