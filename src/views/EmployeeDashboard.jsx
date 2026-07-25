import React, { useState, useRef, useEffect } from "react";
import { LogIn, LogOut, Home, Coffee, LogOut as SignOut, Repeat, MapPin, X, Check, CalendarPlus, Clock, Sun, Moon, CloudSun, ListChecks, WifiOff, Pencil, ChevronDown, Settings as SettingsIcon, User, Camera, Palette, LifeBuoy, Send, Ticket } from "lucide-react";
import { COLORS } from "../lib/constants";
import { computeStatus, fmtTime, fmtHrs, todayStr } from "../lib/utils";
import { StatusPill, LogoMark, Field, inputStyle, secondaryBtn } from "../components/ui";

/* --- Mirrors the HR monthly report's own calculations (MonthlyReport.jsx)
   so an employee's "Today" / "Recent activity" numbers always match what
   HR sees for the same records — same session math, same auto-flag and
   manual-override handling. Kept in sync with that file on purpose. --- */
function sessionHours(inT, outT) {
  if (!inT || !outT) return 0;
  const inD = new Date(inT), outD = new Date(outT);
  let ms = outD - inD;
  // Overnight sessions can read as a negative diff if the day only rolled
  // over on the clock, not in how the record's date was stored — treat any
  // negative diff within one calendar day as crossing midnight.
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
// A lone punch landing well after shift end (with no earlier punch that
// day) gets auto-flagged by the backend and stored in check_in even
// though it's really a missed check-in — show "No check-in" for it
// instead of presenting the evening time as an arrival.
function isFlaggedNotARealCheckIn(rec) {
  return !!(rec?.notes && rec.notes.startsWith("Auto-flag:") && rec?.checkIn && !rec?.checkOut);
}
// The day's total, respecting HR's manual override the same way the
// monthly report does, and falling back to the actual session math.
function dayHoursFor(rec) {
  const raw = rec?.manualTotalHours != null ? rec.manualTotalHours : totalWorkedHours(rec);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/* Time-of-day icon + tone, used instead of an emoji wave */
function greetingIcon(hour) {
  if (hour < 12) return { Icon: Sun, tone: "#F0B23D", bg: "#FBF0DC" };
  if (hour < 18) return { Icon: CloudSun, tone: "#5B9CFF", bg: "#E7EEFF" };
  return { Icon: Moon, tone: "#9AA6C7", bg: "#EDEFF5" };
}

/* Content-area palette for this page. Two variants — the values are pushed
   onto the page as CSS custom properties (--rv-pageBg, --rv-card, etc.) from
   the top-level wrapper, so every card/text color below just reads
   var(--rv-ink) etc. and repaints instantly when Settings > Appearance is
   toggled, without threading a theme prop through every subcomponent. Only
   the navy sidebar stays constant across both themes — it's brand color,
   not a "surface". */
const THEME_LIGHT = {
  pageBg: `linear-gradient(180deg, ${COLORS.bg}, #EAEFFB)`,
  card: "#FFFFFF",
  cardBorder: COLORS.line,
  ink: COLORS.ink,
  muted: COLORS.muted,
  line: COLORS.line,
  rowHover: "#F5F7FC",
};
const THEME_DARK = {
  pageBg: "linear-gradient(180deg, #0E1424, #131B30)",
  card: "#1B2338",
  cardBorder: "#2B3552",
  ink: "#EEF1FA",
  muted: "#93A0C4",
  line: "#2B3552",
  rowHover: "#242E4A",
};

/* Local styles for the subtle motion on this page only — kept scoped
   so it doesn't leak into the rest of the app. */
function DashboardStyles() {
  return (
    <style>{`
      @keyframes rvFadeUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes rvPulseRing {
        0% { box-shadow: 0 0 0 0 rgba(47,158,110,0.35); }
        70% { box-shadow: 0 0 0 9px rgba(47,158,110,0); }
        100% { box-shadow: 0 0 0 0 rgba(47,158,110,0); }
      }
      .rv-stagger { opacity: 0; animation: rvFadeUp .45s ease forwards; }
      .rv-stagger-1 { animation-delay: .02s; }
      .rv-stagger-2 { animation-delay: .08s; }
      .rv-stagger-3 { animation-delay: .14s; }
      .rv-stagger-4 { animation-delay: .2s; }
      .rv-greeting-badge.rv-live { animation: rvPulseRing 2.4s ease-in-out infinite; }
      .rv-cta2 { position: relative; overflow: hidden; transition: transform .15s ease, box-shadow .15s ease; }
      .rv-cta2::before { content: ""; position: absolute; inset: 0 0 50% 0; background: linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0)); pointer-events: none; }
      .rv-cta2:not(:disabled):hover { transform: translateY(-3px); }
      .rv-cta2:not(:disabled):active { transform: translateY(0) scale(0.98); }
      .rv-row { transition: background .15s ease; }
      .rv-row:hover { background: var(--rv-rowHover, #F5F7FC); }
      .rv-sidebar-item { transition: background .15s ease, color .15s ease, box-shadow .15s ease, transform .15s ease; }
      .rv-sidebar-item:not(.rv-active):hover { background: rgba(255,255,255,0.08) !important; color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); transform: translateX(3px); }

      .rv-dark-card { background: var(--rv-card) !important; border: 1px solid var(--rv-cardBorder) !important; color: var(--rv-ink); box-shadow: 0 10px 28px -16px rgba(15,27,51,0.22), 0 2px 8px -4px rgba(15,27,51,0.08); transition: box-shadow .2s ease; }
      .rv-dark-row { border-bottom: 1px solid var(--rv-line) !important; }
      .rv-dark-row:hover { background: var(--rv-rowHover, #F5F7FC) !important; }
      .rv-show-all-btn { transition: background .15s ease, color .15s ease; }
      .rv-show-all-btn:hover { background: var(--rv-rowHover, #F5F7FC) !important; color: var(--rv-ink); }
      .rv-expand-panel { scrollbar-width: thin; scrollbar-color: #C7D0EC transparent; }
      .rv-expand-panel::-webkit-scrollbar { width: 6px; }
      .rv-expand-panel::-webkit-scrollbar-track { background: transparent; }
      .rv-expand-panel::-webkit-scrollbar-thumb { background: #C7D0EC; border-radius: 999px; }
      .rv-expand-panel::-webkit-scrollbar-thumb:hover { background: #AEBAE0; }

      .rv-edit-link { display: inline-flex; align-items: center; gap: 4px; border: none; background: transparent; cursor: pointer; padding: 0; margin-top: 3px; color: #8FA2E0; font-size: 11px; font-weight: 700; transition: color .15s ease, gap .15s ease; }
      .rv-edit-link:hover { color: #fff; gap: 6px; }
      .rv-edit-link svg { transition: transform .2s ease; }
      .rv-edit-link:hover svg { transform: rotate(-14deg) scale(1.08); }
    `}</style>
  );
}

/* Layered: a soft top-left sheen + bottom-right depth shadow on top of the
   base navy gradient — gives the panel a glossy, embossed 3D feel without
   changing the underlying color. */
const SIDEBAR_GRADIENT = [
  "radial-gradient(130% 55% at 10% -10%, rgba(255,255,255,0.14), transparent 55%)",
  "radial-gradient(90% 65% at 105% 105%, rgba(0,0,0,0.30), transparent 60%)",
  "linear-gradient(160deg, #1B2A4A 0%, #12294D 55%, #0A1F44 100%)",
].join(", ");

const SIDEBAR_ITEMS = [
  { key: "attendance", label: "Attendance", icon: ListChecks },
  { key: "leaves", label: "Leaves", icon: CalendarPlus },
  { key: "alternate", label: "Alternate days", icon: Repeat },
];

function Sidebar({ tab, setTab, employee, onSettings, onLogout, onEditProfile, leaveRequests, attendance }) {
  const [expanded, setExpanded] = useState(null); // 'leaves' | 'alternate' | null
  const isMobile = typeof window !== "undefined" && window.innerWidth < 720;
  const initial = employee.name ? employee.name.trim()[0].toUpperCase() : "?";

  if (isMobile) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: SIDEBAR_GRADIENT,
        padding: 10, boxShadow: "0 4px 14px rgba(15,27,51,0.3), inset 0 -1px 0 rgba(255,255,255,0.06)",
      }}>
        <LogoMark size={26} />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1 }}>
          {SIDEBAR_ITEMS.map(it => {
            const active = tab === it.key;
            return (
              <button
                key={it.key}
                className={`rv-sidebar-item${active ? " rv-active" : ""}`}
                onClick={() => setTab(it.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                  padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: active ? "#fff" : "transparent",
                  color: active ? COLORS.navy : "#CBD5F5",
                  fontWeight: active ? 800 : 600, fontSize: 13, flexShrink: 0,
                }}
              >
                <it.icon size={16} /> {it.label}
              </button>
            );
          })}
        </div>
        <button onClick={onSettings} title="Settings" style={{ ...topIconBtn, flexShrink: 0 }}><SettingsIcon size={16} /></button>
        <button onClick={onLogout} title="Log out" style={{ ...topIconBtn, flexShrink: 0 }}><SignOut size={16} /></button>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", width: 280, flexShrink: 0,
      minHeight: "100vh", position: "sticky", top: 0,
      background: SIDEBAR_GRADIENT,
      padding: "22px 16px",
      boxShadow: "6px 0 30px -12px rgba(10,20,40,0.55), inset -1px 0 0 rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
    }}>
      <div style={{ marginBottom: 22, paddingLeft: 4 }}>
        <LogoMark size={30} />
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "linear-gradient(155deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 12, padding: "9px 12px", marginBottom: 22,
        boxShadow: "0 4px 14px -6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: employee.avatar ? "transparent" : `linear-gradient(135deg, ${COLORS.blue}, #1B4FCC)`, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          fontWeight: 800, fontSize: 14, flexShrink: 0,
          boxShadow: "0 3px 8px -2px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}>
          {employee.avatar ? <img src={employee.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
        </div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{employee.name}</div>
          <div style={{ fontSize: 11, color: "#B9C3E8", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{employee.department}</div>
          <button className="rv-edit-link" onClick={onEditProfile}>
            <Pencil size={11} /> Edit
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SIDEBAR_ITEMS.map(it => {
          const active = tab === it.key;
          const expandable = it.key === "leaves" || it.key === "alternate";
          const isOpen = expanded === it.key;
          return (
            <div key={it.key}>
              <button
                className={`rv-sidebar-item${active ? " rv-active" : ""}`}
                onClick={() => {
                  setTab(it.key);
                  if (expandable) setExpanded(isOpen ? null : it.key);
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", whiteSpace: "nowrap",
                  width: "100%", padding: "14px 16px", borderRadius: 12, border: "none", cursor: "pointer",
                  background: active ? "linear-gradient(180deg, #ffffff, #EEF1FA)" : "transparent",
                  color: active ? COLORS.navy : "#CBD5F5",
                  fontWeight: active ? 800 : 600, fontSize: 15, textAlign: "left",
                  boxShadow: active ? "0 6px 16px -6px rgba(0,0,0,0.4), inset 0 1px 0 #fff" : "none",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <it.icon size={20} /> {it.label}
                </span>
                {expandable && (
                  <ChevronDown
                    size={15}
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "none",
                      transition: "transform .25s ease",
                      opacity: active ? 0.65 : 0.5,
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>

              {expandable && (
                <div style={{
                  display: "grid",
                  gridTemplateRows: isOpen ? "1fr" : "0fr",
                  transition: "grid-template-rows .35s ease",
                }}>
                  <div style={{ overflow: "hidden", minHeight: 0 }}>
                    {it.key === "leaves"
                      ? <SidebarLeavesPreview leaveRequests={leaveRequests} />
                      : <SidebarAlternatePreview employee={employee} attendance={attendance} />}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <button
          className="rv-sidebar-item"
          onClick={onSettings}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
            border: "none", cursor: "pointer", background: "transparent", color: "#CBD5F5",
            fontWeight: 600, fontSize: 13.5, textAlign: "left",
          }}
        >
          <SettingsIcon size={17} /> Settings
        </button>
        <button
          className="rv-sidebar-item"
          onClick={onLogout}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
            border: "none", cursor: "pointer", background: "transparent", color: "#CBD5F5",
            fontWeight: 600, fontSize: 13.5, textAlign: "left",
          }}
        >
          <SignOut size={17} /> Log out
        </button>
      </div>
    </div>
  );
}

/* Compact, date-first previews shown inline in the sidebar when the
   Leaves / Alternate days nav item is expanded — same data as the main
   tab content, just condensed to the last handful of dates. */
const SIDEBAR_LEAVE_DOT = { pending: "#D99A2B", approved: "#3DD68C", rejected: "#D9534F" };

function SidebarLeavesPreview({ leaveRequests }) {
  const items = (leaveRequests || []).slice(0, 5);
  if (items.length === 0) {
    return (
      <div style={{ padding: "6px 14px 12px 46px", fontSize: 12, color: "#8FA2E0" }}>
        No leave requests yet.
      </div>
    );
  }
  return (
    <div style={{ padding: "6px 14px 12px 46px", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(r => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#CBD5F5", fontWeight: 600 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: SIDEBAR_LEAVE_DOT[r.status] || "#8FA2E0", flexShrink: 0 }} />
          {new Date(r.startDate + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}
          {r.endDate && r.endDate !== r.startDate && (
            <> – {new Date(r.endDate + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}</>
          )}
        </div>
      ))}
    </div>
  );
}

function SidebarAlternatePreview({ employee, attendance }) {
  const dates = Object.entries(attendance || {})
    .filter(([key, rec]) => key.startsWith(`${employee.id}|`) && rec?.alternateDay)
    .map(([key]) => key.split("|")[1])
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 5);
  if (dates.length === 0) {
    return (
      <div style={{ padding: "6px 14px 12px 46px", fontSize: 12, color: "#8FA2E0" }}>
        No alternate days marked yet.
      </div>
    );
  }
  return (
    <div style={{ padding: "6px 14px 12px 46px", display: "flex", flexDirection: "column", gap: 8 }}>
      {dates.map(date => (
        <div key={date} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#CBD5F5", fontWeight: 600 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.violet, flexShrink: 0 }} />
          {new Date(date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
        </div>
      ))}
    </div>
  );
}

export default function EmployeeDashboard({ employee, attendance, punch, now, onLogout, leaveTypes = [], leaveRequests = [], onApplyLeave, onUpdateProfile }) {
  const [wfhModal, setWfhModal] = useState(null); // 'in' | 'out' | null
  const [leaveModal, setLeaveModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(null); // null | 'profile' | 'appearance' | 'helpdesk'
  const [profileOverride, setProfileOverride] = useState(null); // { name, department, avatar } — optimistic local edit
  const [tab, setTab] = useState("attendance"); // 'attendance' | 'leaves' | 'alternate'
  const [punchError, setPunchError] = useState(null);

  // Dark mode is a per-browser display preference, not employee data — kept
  // in localStorage (not the backend) and remembered across visits.
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("rv-dark-mode") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("rv-dark-mode", darkMode ? "1" : "0");
  }, [darkMode]);
  const theme = darkMode ? THEME_DARK : THEME_LIGHT;

  const displayEmployee = profileOverride ? { ...employee, ...profileOverride } : employee;

  // Office Check in / Check out / alternate-day check-ins are IP-restricted
  // (see api/attendance/punch.js) — this surfaces the reason when the
  // office network check rejects the tap, instead of it silently failing.
  // WFH punches never hit this path with an error, since they skip the IP
  // check entirely.
  const handlePunch = async (action, meta) => {
    setPunchError(null);
    const result = await punch(employee.id, action, meta);
    if (!result.ok) setPunchError(result.error);
  };

  const date = todayStr(now);
  const rec = attendance[`${employee.id}|${date}`];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const status = computeStatus(employee, rec, false, nowMinutes, date);

  const completeSession = (rec?.checkIn && rec?.checkOut) || (rec?.wfhCheckIn && rec?.wfhCheckOut) || (rec?.secondCheckIn && rec?.secondCheckOut);
  const hours = rec?.manualTotalHours != null ? Number(rec.manualTotalHours) : (completeSession ? totalWorkedHours(rec) : null);

  const canCheckIn = !rec?.checkIn && !rec?.wfhCheckIn;
  const canCheckOut = !!rec?.checkIn && !rec?.checkOut;
  const canWfhIn = !rec?.checkIn && !rec?.wfhCheckIn;
  const canWfhOut = !!rec?.wfhCheckIn && !rec?.wfhCheckOut;

  const greet = greetingIcon(now.getHours());
  const isLive = canCheckIn; // pulsing ring only while nothing's been punched yet today

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      flexDirection: typeof window !== "undefined" && window.innerWidth < 720 ? "column" : "row",
      background: "var(--rv-pageBg)",
      "--rv-pageBg": theme.pageBg,
      "--rv-card": theme.card,
      "--rv-cardBorder": theme.cardBorder,
      "--rv-ink": theme.ink,
      "--rv-muted": theme.muted,
      "--rv-line": theme.line,
      "--rv-rowHover": theme.rowHover,
    }}>
      <DashboardStyles />
      <Sidebar tab={tab} setTab={setTab} employee={displayEmployee} onSettings={() => setSettingsModal("profile")} onLogout={onLogout} onEditProfile={() => setSettingsModal("profile")} leaveRequests={leaveRequests} attendance={attendance} />

      <div style={{ flex: 1, minWidth: 0, padding: "0 32px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "30px 0 60px" }}>
        <div className="rv-stagger rv-stagger-1" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div
            className={`rv-greeting-badge${isLive ? " rv-live" : ""}`}
            style={{
              width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
              background: greet.bg, color: greet.tone,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 3px 10px -4px rgba(15,27,51,0.25)",
            }}
          >
            <greet.Icon size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.3, color: "var(--rv-ink)" }}>
              Hi, {displayEmployee.name.split(" ")[0]}
            </h1>
            <p style={{ color: "var(--rv-muted)", margin: "2px 0 0", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              {isLive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3DD68C", flexShrink: 0 }} />}
              {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>

        <div>
            {tab === "attendance" && (
              <>
                <div key={date} className="rv-card rv-dark-card rv-anim-slideupin rv-stagger rv-stagger-2" style={{ padding: 24, marginBottom: 22, borderRadius: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: "var(--rv-ink)" }}>Today's attendance</div>
                    <StatusPill {...status} />
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 22, marginBottom: 4 }}>
                    <TimeStat label="Check-in" value={isFlaggedNotARealCheckIn(rec) ? "No check-in" : fmtTime(rec?.checkIn)} alert={isFlaggedNotARealCheckIn(rec)} />
                    <TimeStat label="Check-out" value={rec?.checkIn && !rec?.checkOut ? "No checkout" : fmtTime(rec?.checkOut)} alert={rec?.checkIn && !rec?.checkOut} />
                    <TimeStat label="WFH in" value={fmtTime(rec?.wfhCheckIn)} />
                    <TimeStat label="WFH out" value={rec?.wfhCheckIn && !rec?.wfhCheckOut ? "No checkout" : fmtTime(rec?.wfhCheckOut)} alert={rec?.wfhCheckIn && !rec?.wfhCheckOut} />
                    {hours != null && <TimeStat label="Hours logged" value={fmtHrs(hours)} />}
                  </div>

                  {rec?.alternateDay && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, background: "#EEE9FC", color: COLORS.violet, fontWeight: 700, fontSize: 12.5, padding: "5px 11px", borderRadius: 999 }}>
                      <Repeat size={12} /> Marked as an alternate day
                    </div>
                  )}
                </div>

                <div className="rv-stagger rv-stagger-3" style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 10,
                }}>
                  <CtaButton icon={LogIn} label="Check in" tone="present" disabled={!canCheckIn} onClick={() => handlePunch("in")} />
                  <CtaButton icon={LogOut} label="Check out" tone="late" disabled={!canCheckOut} onClick={() => handlePunch("out")} />
                  <CtaButton icon={Home} label="WFH check-in" tone="wfh" disabled={!canWfhIn} onClick={() => setWfhModal("in")} />
                  <CtaButton icon={Home} label="WFH check-out" tone="wfh" disabled={!canWfhOut} onClick={() => setWfhModal("out")} />
                </div>
                <PunchErrorBanner message={punchError} />

                <RecentActivity employee={employee} attendance={attendance} now={now} />
              </>
            )}

            {tab === "leaves" && (
              <>
                <div className="rv-stagger rv-stagger-2" style={{ marginBottom: 22 }}>
                  <button onClick={() => setLeaveModal(true)} style={{ ...secondaryBtn, flex: "unset", display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <CalendarPlus size={16} /> Apply for leave
                  </button>
                </div>
                <MyLeaveRequestsFull leaveRequests={leaveRequests} />
              </>
            )}

            {tab === "alternate" && (
              <>
                <div className="rv-stagger rv-stagger-2" style={{ marginBottom: 18 }}>
                  <button onClick={() => handlePunch("alternate")} style={{ ...secondaryBtn, flex: "unset", display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Repeat size={16} /> {rec?.alternateDay ? "Unmark alternate day" : "Mark today as alternate day"}
                  </button>
                  {rec?.alternateDay && (
                    <span style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "#EEE9FC", color: COLORS.violet, fontWeight: 700, fontSize: 12.5, padding: "5px 11px", borderRadius: 999 }}>
                      Today is marked
                    </span>
                  )}
                </div>

                <div className="rv-stagger rv-stagger-3" style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 10,
                }}>
                  <CtaButton icon={LogIn} label="Check in" tone="present" disabled={!canCheckIn} onClick={() => handlePunch("in")} />
                  <CtaButton icon={LogOut} label="Check out" tone="late" disabled={!canCheckOut} onClick={() => handlePunch("out")} />
                  <CtaButton icon={Home} label="WFH check-in" tone="wfh" disabled={!canWfhIn} onClick={() => setWfhModal("in")} />
                  <CtaButton icon={Home} label="WFH check-out" tone="wfh" disabled={!canWfhOut} onClick={() => setWfhModal("out")} />
                </div>
                <PunchErrorBanner message={punchError} />

                <AlternateDayLog employee={employee} attendance={attendance} />
              </>
            )}
          </div>
        </div>
      </div>

      {settingsModal && (
        <SettingsModal
          employee={displayEmployee}
          initialTab={settingsModal}
          darkMode={darkMode}
          onToggleDarkMode={setDarkMode}
          onClose={() => setSettingsModal(null)}
          onSubmitProfile={async (payload) => {
            if (onUpdateProfile) {
              await onUpdateProfile({ employeeId: employee.id, ...payload });
            }
            setProfileOverride(prev => ({ ...prev, ...payload }));
          }}
        />
      )}
      {leaveModal && (
        <LeaveApplicationModal
          leaveTypes={leaveTypes}
          onClose={() => setLeaveModal(false)}
          onSubmit={async (payload) => {
            await onApplyLeave({ employeeId: employee.id, ...payload });
            setLeaveModal(false);
          }}
        />
      )}
      {wfhModal && (
        <WfhFormModal
          mode={wfhModal}
          onClose={() => setWfhModal(null)}
          onSubmit={(meta) => { punch(employee.id, wfhModal === "in" ? "wfh_in" : "wfh_out", meta); setWfhModal(null); }}
        />
      )}
    </div>
  );
}

const topIconBtn = {
  width: 34, height: 34, borderRadius: 9, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)", color: "#fff", display: "flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer",
};

function TimeStat({ label, value, alert }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--rv-muted)", fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: alert ? COLORS.red : "var(--rv-ink)" }}>{value}</div>
    </div>
  );
}

const TONE_BG = {
  present: `linear-gradient(135deg, #2F9E6E, #1F7A54)`,
  late: `linear-gradient(135deg, #5E6B85, #3E475C)`,
  wfh: `linear-gradient(135deg, #0EA5E9, #2F6FED)`,
};
function CtaButton({ icon: Icon, label, tone, disabled, onClick }) {
  return (
    <button className="rv-cta rv-cta2" onClick={onClick} disabled={disabled} style={{
      background: disabled ? "#E9ECF6" : TONE_BG[tone],
      color: disabled ? "var(--rv-muted)" : "#fff",
      boxShadow: disabled ? "none" : "0 10px 22px -6px rgba(15,27,51,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
    }}>
      <Icon size={22} />
      {label}
    </button>
  );
}

/* Shown when an office Check in / Check out / alternate-day punch is
   rejected — almost always because the employee isn't on the office
   network. WFH punches never trigger this since they skip the IP check. */
function PunchErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rv-anim-fadein" style={{
      display: "flex", alignItems: "flex-start", gap: 10, background: "#FBE8E7", color: "#B23B36",
      border: "1px solid #F3C7C4", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 600,
      marginBottom: 22, lineHeight: 1.5,
    }}>
      <WifiOff size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  );
}

function RecentActivity({ employee, attendance, now }) {
  const listRef = useRef(null);

  // Always land at the top (today) — without this, the browser can keep an
  // old scroll position across re-renders/mounts and land you mid-list.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, []);

  // Every day from the 1st of the current month through today, most recent
  // first. Recomputed on every render from `now`/`attendance`, so a punch
  // made moments ago (today's row, or one just corrected by HR) shows up
  // immediately without any extra plumbing.
  const dayOfMonth = now.getDate();
  const allDays = [...Array(dayOfMonth)].map((_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - i);
    return todayStr(d);
  });

  const DOT_COLOR = {
    present: "#2F9E6E", late: "#D99A2B", wfh: "#2F6FED",
    absent: "#D9534F", leave: "#8B6BD1", weekend: "#B7BECF", half: "#D99A2B",
  };

  const renderRow = (date) => {
    const rec = attendance[`${employee.id}|${date}`];
    const isPast = date < todayStr(now);
    const status = computeStatus(employee, rec, isPast, now.getHours() * 60 + now.getMinutes(), date);
    const flaggedIn = isFlaggedNotARealCheckIn(rec);
    const inTime = flaggedIn ? "No check-in" : (fmtTime(rec?.checkIn) || fmtTime(rec?.wfhCheckIn));
    const outTime = (rec?.checkIn && !rec?.checkOut) || (rec?.wfhCheckIn && !rec?.wfhCheckOut)
      ? "No checkout" : (fmtTime(rec?.checkOut) || fmtTime(rec?.wfhCheckOut));
    const hasTimes = (inTime && inTime !== "No check-in") || outTime;
    const dayHours = dayHoursFor(rec);
    return (
      <div key={date} className="rv-row rv-dark-row" style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "11px 16px", gap: 10, flexWrap: "wrap", borderRadius: 8,
      }}>
        <div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--rv-ink)", fontWeight: 700 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: DOT_COLOR[status?.tone] || "var(--rv-muted)",
            }} />
            {new Date(date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
          </span>
          {(hasTimes || flaggedIn) && (
            <div style={{ fontSize: 12, color: "var(--rv-muted)", marginTop: 2, marginLeft: 16 }}>
              In: <strong style={{ color: flaggedIn ? COLORS.red : "var(--rv-ink)" }}>{inTime || "—"}</strong>
              {"  ·  "}
              Out: <strong style={{ color: outTime === "No checkout" ? COLORS.red : "var(--rv-ink)" }}>{outTime || "—"}</strong>
              {dayHours > 0 && <> {"  ·  "}Hours: <strong style={{ color: "var(--rv-ink)" }}>{fmtHrs(dayHours)}</strong></>}
            </div>
          )}
        </div>
        <StatusPill {...status} />
      </div>
    );
  };

  return (
    <div className="rv-stagger rv-stagger-4" style={{ marginTop: 26 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: "var(--rv-ink)" }}>Recent activity</div>
      <div className="rv-card rv-dark-card" style={{ padding: "6px 4px", borderRadius: 16 }}>
        <div
          ref={listRef}
          className="rv-expand-panel"
          style={{ maxHeight: 300, overflowY: "auto", overflowX: "hidden", overflowAnchor: "none" }}
        >
          {allDays.map(renderRow)}
        </div>
      </div>
    </div>
  );
}

const LEAVE_STATUS_STYLE = {
  pending: { bg: "#FBF0DC", fg: "#D99A2B", label: "Pending" },
  approved: { bg: "#E7F6EF", fg: "#2F9E6E", label: "Approved" },
  rejected: { bg: "#FBE8E7", fg: "#D9534F", label: "Rejected" },
};

function MyLeaveRequestsFull({ leaveRequests }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 7, color: "var(--rv-ink)" }}>
        <Clock size={15} color={COLORS.amber} /> My leave requests
      </div>
      {(!leaveRequests || leaveRequests.length === 0) ? (
        <div className="rv-card rv-dark-card" style={{ padding: "28px 20px", textAlign: "center", color: "var(--rv-muted)", fontSize: 13.5, borderRadius: 16 }}>
          No leave requests yet — use "Apply for leave" above when you need one.
        </div>
      ) : (
        <div className="rv-card rv-dark-card" style={{ padding: "6px 4px", borderRadius: 16 }}>
          {leaveRequests.map(r => {
            const s = LEAVE_STATUS_STYLE[r.status] || LEAVE_STATUS_STYLE.pending;
            return (
              <div key={r.id} className="rv-row rv-dark-row" style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "11px 16px", gap: 10, flexWrap: "wrap", borderRadius: 8,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--rv-ink)" }}>{r.leaveTypeName}</div>
                  <div style={{ fontSize: 12, color: "var(--rv-muted)" }}>
                    {new Date(r.startDate + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}
                    {" – "}
                    {new Date(r.endDate + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}
                  </div>
                </div>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6, background: s.bg, color: s.fg,
                  fontWeight: 700, fontSize: 12.5, padding: "4px 10px", borderRadius: 999,
                }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Alternate-day tab: every day this employee marked as an alternate working
   day, with whatever check-in/check-out (regular or WFH) was logged for it. */
function AlternateDayLog({ employee, attendance }) {
  const entries = Object.entries(attendance || {})
    .filter(([key, rec]) => key.startsWith(`${employee.id}|`) && rec?.alternateDay)
    .map(([key, rec]) => ({ date: key.split("|")[1], rec }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: "var(--rv-ink)" }}>Alternate day record</div>
      {entries.length === 0 ? (
        <div className="rv-card rv-dark-card" style={{ padding: "28px 20px", textAlign: "center", color: "var(--rv-muted)", fontSize: 13.5, borderRadius: 16 }}>
          No alternate days marked yet.
        </div>
      ) : (
        <div className="rv-card rv-dark-card" style={{ padding: "6px 4px", borderRadius: 16 }}>
          {entries.map(({ date, rec }) => {
            const flaggedIn = isFlaggedNotARealCheckIn(rec);
            const checkIn = flaggedIn ? null : (rec.checkIn || rec.wfhCheckIn);
            const checkOut = rec.checkOut || rec.wfhCheckOut;
            const isWfh = !!rec.wfhCheckIn;
            const dayHours = dayHoursFor(rec);
            return (
              <div key={date} className="rv-row rv-dark-row" style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
                padding: "11px 16px", borderRadius: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.violet, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--rv-ink)" }}>
                    {new Date(date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  {isWfh && (
                    <span style={{ fontSize: 11, color: "#5B9CFF", fontWeight: 700, background: "rgba(91,156,255,0.12)", padding: "2px 8px", borderRadius: 999 }}>WFH</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12.5, color: "var(--rv-muted)" }}>
                  <span>In: <strong style={{ color: flaggedIn ? COLORS.red : "var(--rv-ink)" }}>{flaggedIn ? "No check-in" : (fmtTime(checkIn) || "—")}</strong></span>
                  <span>Out: <strong style={{ color: "var(--rv-ink)" }}>{fmtTime(checkOut) || "—"}</strong></span>
                  {dayHours > 0 && <span>Hours: <strong style={{ color: "var(--rv-ink)" }}>{fmtHrs(dayHours)}</strong></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Settings: Profile (with picture), Appearance (light/dark), Help desk *
 * -------------------------------------------------------------------- */

const SETTINGS_TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "helpdesk", label: "Help desk", icon: LifeBuoy },
];

function SettingsModal({ employee, initialTab, darkMode, onToggleDarkMode, onClose, onSubmitProfile }) {
  const [activeTab, setActiveTab] = useState(initialTab || "profile");
  const isMobile = typeof window !== "undefined" && window.innerWidth < 720;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,27,51,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60,
    }} className="rv-anim-fadein" onClick={onClose}>
      <div
        className="rv-card rv-anim-popin"
        style={{
          width: "100%", maxWidth: 760, padding: 0, borderRadius: 18, overflow: "hidden",
          display: "flex", flexDirection: isMobile ? "column" : "row",
          maxHeight: "88vh",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left nav */}
        <div style={{
          width: isMobile ? "100%" : 200, flexShrink: 0,
          background: "#F7F8FC", borderRight: isMobile ? "none" : `1px solid ${COLORS.line}`,
          borderBottom: isMobile ? `1px solid ${COLORS.line}` : "none",
          padding: isMobile ? "14px 10px" : "22px 12px",
          display: "flex", flexDirection: isMobile ? "row" : "column", gap: 4,
          overflowX: isMobile ? "auto" : "visible",
        }}>
          {!isMobile && (
            <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.navy, padding: "0 10px 16px" }}>Settings</div>
          )}
          {SETTINGS_TABS.map(t => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap",
                  width: isMobile ? "auto" : "100%", padding: "10px 12px", borderRadius: 10, border: "none",
                  cursor: "pointer", textAlign: "left",
                  background: active ? "#fff" : "transparent",
                  color: active ? COLORS.navy : COLORS.muted,
                  fontWeight: active ? 800 : 600, fontSize: 13.5,
                  boxShadow: active ? "0 3px 10px -4px rgba(15,27,51,0.25)" : "none",
                }}
              >
                <t.icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, minWidth: 0, position: "relative", overflowY: "auto", padding: 28 }}>
          <button onClick={onClose} style={{ position: "absolute", top: 20, right: 20, background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}>
            <X size={20} />
          </button>
          {activeTab === "profile" && <ProfileSettingsPane employee={employee} onSubmit={onSubmitProfile} />}
          {activeTab === "appearance" && <AppearanceSettingsPane darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />}
          {activeTab === "helpdesk" && <HelpDeskPane employee={employee} />}
        </div>
      </div>
    </div>
  );
}

function ProfileSettingsPane({ employee, onSubmit }) {
  const [name, setName] = useState(employee.name || "");
  const [department, setDepartment] = useState(employee.department || "");
  const [avatar, setAvatar] = useState(employee.avatar || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);
  const initial = name ? name.trim()[0].toUpperCase() : "?";

  const handleFile = (file) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Image is too large — please choose one under 2MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result);
    reader.onerror = () => setError("Couldn't read that image — try another file.");
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setError(""); setSaved(false);
    if (!name.trim()) { setError("Name can't be empty."); return; }
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), department: department.trim(), avatar });
      setSaved(true);
    } catch (e) {
      setError(e.message || "Couldn't save your changes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>Profile</h3>
      <p style={{ color: COLORS.muted, fontSize: 13, margin: "0 0 22px" }}>
        Your photo and name appear across the app, including to HR.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", overflow: "hidden",
            background: avatar ? "transparent" : `linear-gradient(135deg, ${COLORS.blue}, #1B4FCC)`,
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 26, border: `1px solid ${COLORS.line}`,
          }}>
            {avatar ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Change photo"
            style={{
              position: "absolute", bottom: -2, right: -2, width: 28, height: 28, borderRadius: "50%",
              background: COLORS.navy, color: "#fff", border: "2px solid #fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Camera size={13} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => handleFile(e.target.files?.[0])} />
        </div>
        <div>
          <button onClick={() => fileInputRef.current?.click()} style={{ ...secondaryBtn, flex: "unset", padding: "8px 14px", fontSize: 12.5 }}>
            Upload photo
          </button>
          {avatar && (
            <button onClick={() => setAvatar(null)} style={{ display: "block", marginTop: 8, background: "none", border: "none", color: COLORS.red, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
              Remove photo
            </button>
          )}
        </div>
      </div>

      <Field label="Full name">
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. Ayesha Hassan" />
      </Field>
      <Field label="Designation">
        <input value={department} onChange={e => setDepartment(e.target.value)} style={inputStyle} placeholder="e.g. Software Engineer" />
      </Field>

      {error && <div style={{ color: COLORS.red, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{error}</div>}
      {saved && !busy && <div style={{ color: "#2F9E6E", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Saved.</div>}

      <button
        onClick={submit}
        disabled={busy}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
          background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.orange})`, color: "#fff",
          border: "none", borderRadius: 11, padding: "11px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          opacity: busy ? 0.7 : 1, marginTop: 6,
        }}
      >
        <Check size={16} /> {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function AppearanceSettingsPane({ darkMode, onToggleDarkMode }) {
  const options = [
    { key: false, label: "Light", Icon: Sun, bg: "#FFFFFF", ink: "#0F1B33", sub: "#F5F7FC" },
    { key: true, label: "Dark", Icon: Moon, bg: "#1B2338", ink: "#EEF1FA", sub: "#131B30" },
  ];
  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>Appearance</h3>
      <p style={{ color: COLORS.muted, fontSize: 13, margin: "0 0 22px" }}>
        Choose how RankViz looks on this device.
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {options.map(opt => {
          const active = darkMode === opt.key;
          return (
            <button
              key={opt.label}
              onClick={() => onToggleDarkMode(opt.key)}
              style={{
                width: 150, border: active ? `2px solid ${COLORS.blue}` : `1px solid ${COLORS.line}`,
                borderRadius: 14, padding: 0, cursor: "pointer", overflow: "hidden", background: "#fff",
                boxShadow: active ? "0 6px 16px -8px rgba(47,111,235,0.45)" : "none",
              }}
            >
              <div style={{ background: opt.sub, padding: "14px 12px 10px" }}>
                <div style={{ background: opt.bg, borderRadius: 8, padding: "10px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  <opt.Icon size={14} color={opt.ink} />
                  <div style={{ height: 6, flex: 1, borderRadius: 4, background: opt.ink, opacity: 0.15 }} />
                </div>
              </div>
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy }}>{opt.label}</span>
                {active && <Check size={15} color={COLORS.blue} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Help desk: quick FAQ, a ticket form, and a running list of tickets this
   employee has raised. Tickets are kept in localStorage per-employee for
   now — wire onSubmitTicket up to a real API route when the backend has one,
   and HR-side visibility will need its own read path. */
const ATTENDANCE_FAQ = [
  { q: "I forgot to check in — what do I do?", a: "Raise a ticket below under \"Missed punch\" with the date and roughly what time you arrived. HR can add or correct a check-in on your record." },
  { q: "How do alternate days work?", a: "Mark today as an alternate day from the Alternate days tab before or after you check in. It flags the day so HR knows it's outside your usual schedule." },
  { q: "When does a leave request actually count?", a: "Applying for leave only sends a request to HR — it doesn't mark your attendance until they approve it. You'll see the status update in \"My leave requests.\"" },
  { q: "My check-out shows as missing but I did check out.", a: "This usually means the check-out didn't register — raise a ticket with the date and time so HR can correct it manually." },
  { q: "Can I work from home and still check in at the office later the same day?", a: "Yes — the dashboard supports a second session per day. Use WFH check-in/out and office check-in/out independently; both count toward your total hours." },
];

const TICKET_CATEGORIES = ["Missed punch", "Leave issue", "Alternate day", "Payroll", "Access / login", "Other"];

function loadTickets(employeeId) {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(`rv-tickets-${employeeId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveTickets(employeeId, tickets) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(`rv-tickets-${employeeId}`, JSON.stringify(tickets));
  } catch { /* ignore storage errors */ }
}

function HelpDeskPane({ employee }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [tickets, setTickets] = useState(() => loadTickets(employee.id));
  const [category, setCategory] = useState(TICKET_CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const submitTicket = () => {
    setError("");
    if (!subject.trim()) { setError("Give it a short subject."); return; }
    const ticket = {
      id: `${Date.now()}`,
      category, subject: subject.trim(), description: description.trim(),
      status: "open", createdAt: new Date().toISOString(),
    };
    const next = [ticket, ...tickets];
    setTickets(next);
    saveTickets(employee.id, next);
    setSubject(""); setDescription(""); setShowForm(false);
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>Help desk</h3>
      <p style={{ color: COLORS.muted, fontSize: 13, margin: "0 0 20px" }}>
        Answers to common attendance questions, or raise a ticket for HR.
      </p>

      {/* FAQ */}
      <div style={{ marginBottom: 24 }}>
        {ATTENDANCE_FAQ.map((item, i) => {
          const open = openFaq === i;
          return (
            <div key={i} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
              <button
                onClick={() => setOpenFaq(open ? null : i)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "none", border: "none", cursor: "pointer", padding: "12px 2px",
                  textAlign: "left", fontSize: 13.5, fontWeight: 700, color: COLORS.navy,
                }}
              >
                {item.q}
                <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease", flexShrink: 0, marginLeft: 10, opacity: 0.6 }} />
              </button>
              {open && <p style={{ margin: "0 2px 14px", fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>{item.a}</p>}
            </div>
          );
        })}
      </div>

      {/* Raise a ticket */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.navy, display: "flex", alignItems: "center", gap: 7 }}>
          <Ticket size={16} /> My tickets
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={{ ...secondaryBtn, flex: "unset", padding: "7px 12px", fontSize: 12.5 }}>
            Raise a ticket
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background: "#F7F8FC", border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="Category" style={{ flex: "1 1 160px" }}>
              <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subject" style={{ flex: "2 1 200px" }}>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} placeholder="e.g. Missed check-out on July 22" />
            </Field>
          </div>
          <Field label="Details (optional)">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Anything HR should know" />
          </Field>
          {error && <div style={{ color: COLORS.red, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setShowForm(false); setError(""); }} style={secondaryBtn}>Cancel</button>
            <button
              onClick={submitTicket}
              style={{
                flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.orange})`, color: "#fff",
                border: "none", borderRadius: 11, padding: "10px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
              }}
            >
              <Send size={14} /> Submit
            </button>
          </div>
        </div>
      )}

      {tickets.length === 0 ? (
        <div style={{ background: "#F7F8FC", border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "18px 16px", textAlign: "center", color: COLORS.muted, fontSize: 12.5 }}>
          No tickets raised yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map(t => (
            <div key={t.id} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy }}>{t.subject}</div>
                <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>
                  {t.category} · {new Date(t.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                </div>
              </div>
              <span style={{
                fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                background: "#FBF0DC", color: "#8A5D14",
              }}>
                Open
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeaveApplicationModal({ leaveTypes, onClose, onSubmit }) {
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id || "");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (leaveTypes.length > 0 && !leaveTypeId) { setError("Choose a leave type."); return; }
    if (endDate < startDate) { setError("End date can't be before the start date."); return; }
    setBusy(true);
    try {
      const type = leaveTypes.find(t => t.id === leaveTypeId);
      await onSubmit({
        leaveTypeId: type?.id || null,
        leaveTypeName: type?.name || "Leave",
        startDate, endDate, reason,
      });
    } catch (e) {
      setError(e.message || "Couldn't submit the request.");
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,27,51,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60,
    }} className="rv-anim-fadein" onClick={onClose}>
      <div className="rv-card rv-anim-popin" style={{ width: "100%", maxWidth: 460, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: COLORS.bg, color: COLORS.violet, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarPlus size={18} />
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Apply for leave</h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}><X size={20} /></button>
        </div>
        <p style={{ color: COLORS.muted, fontSize: 13, margin: "6px 0 20px" }}>
          This goes to HR for approval — it won't mark your attendance until they approve it.
        </p>

        {leaveTypes.length === 0 ? (
          <div style={{ background: "#FBF0DC", color: "#8A5D14", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            HR hasn't set up any leave types yet. You can still submit — they'll follow up.
          </div>
        ) : (
          <Field label="Leave type">
            <select value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)} style={inputStyle}>
              {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <Field label="From" style={{ flex: 1 }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="To" style={{ flex: 1 }}>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <Field label="Reason (optional)">
          <input value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} placeholder="e.g. Family event" />
        </Field>

        {error && <div style={{ color: COLORS.red, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.orange})`, color: "#fff",
              border: "none", borderRadius: 11, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            <Check size={16} /> {busy ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------- WFH check-in/out form, shown in a wide "landscape" layout -------- */
function WfhFormModal({ mode, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,27,51,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60,
    }} className="rv-anim-fadein" onClick={onClose}>
      <div className="rv-card rv-anim-popin" style={{ width: "100%", maxWidth: 620, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: COLORS.bg, color: COLORS.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Home size={18} />
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              Work from home {mode === "in" ? "check-in" : "check-out"}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}><X size={20} /></button>
        </div>
        <p style={{ color: COLORS.muted, fontSize: 13, margin: "6px 0 20px" }}>
          A couple of quick details for HR's records.
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Field label={mode === "in" ? "Reason for WFH" : "Summary of work done"} style={{ flex: "1 1 260px", marginBottom: 6 }}>
            <input value={reason} onChange={e => setReason(e.target.value)} style={inputStyle}
              placeholder={mode === "in" ? "e.g. Focused work, no commute needed" : "e.g. Finished the Q3 report draft"} />
          </Field>
          <Field label="Location" style={{ flex: "1 1 200px", marginBottom: 6 }}>
            <div style={{ position: "relative" }}>
              <MapPin size={15} style={{ position: "absolute", left: 11, top: 12, color: COLORS.muted }} />
              <input value={location} onChange={e => setLocation(e.target.value)} style={{ ...inputStyle, paddingLeft: 32 }} placeholder="e.g. Home — Lahore" />
            </div>
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button
            onClick={() => onSubmit({ reason, location })}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.orange})`, color: "#fff",
              border: "none", borderRadius: 11, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            <Check size={16} /> Confirm {mode === "in" ? "check-in" : "check-out"}
          </button>
        </div>
      </div>
    </div>
  );
}