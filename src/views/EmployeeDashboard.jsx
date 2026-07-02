import React, { useState } from "react";
import { LogIn, LogOut, Home, Coffee, HelpCircle, LogOut as SignOut, Repeat, MapPin, X, Check } from "lucide-react";
import { COLORS } from "../lib/constants";
import { computeStatus, fmtTime, fmtHrs, todayStr } from "../lib/utils";
import { StatusPill, LogoMark, Field, inputStyle, secondaryBtn } from "../components/ui";
import HelpModal from "../components/HelpModal";

export default function EmployeeDashboard({ employee, attendance, punch, now, onLogout }) {
  const [showHelp, setShowHelp] = useState(false);
  const [wfhModal, setWfhModal] = useState(null); // 'in' | 'out' | null

  const date = todayStr(now);
  const rec = attendance[`${employee.id}|${date}`];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const status = computeStatus(employee, rec, false, nowMinutes);

  const hours = (rec?.checkIn && rec?.checkOut) ? (new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000
    : (rec?.wfhCheckIn && rec?.wfhCheckOut) ? (new Date(rec.wfhCheckOut) - new Date(rec.wfhCheckIn)) / 3600000 : null;

  const canCheckIn = !rec?.checkIn && !rec?.wfhCheckIn;
  const canCheckOut = !!rec?.checkIn && !rec?.checkOut;
  const canWfhIn = !rec?.checkIn && !rec?.wfhCheckIn;
  const canWfhOut = !!rec?.wfhCheckIn && !rec?.wfhCheckOut;

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${COLORS.bg}, #EAEFFB)` }}>
      <TopBar employee={employee} onHelp={() => setShowHelp(true)} onLogout={onLogout} />

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "26px 18px 60px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>
          Hi, {employee.name.split(" ")[0]} 👋
        </h1>
        <p style={{ color: COLORS.muted, margin: "0 0 20px", fontSize: 14 }}>
          {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </p>

        <div key={date} className="rv-card rv-anim-slideupin" style={{ padding: 24, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5 }}>Today's attendance</div>
            <StatusPill {...status} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 22, marginBottom: 4 }}>
            <TimeStat label="Check-in" value={fmtTime(rec?.checkIn)} />
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

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 22,
        }}>
          <CtaButton icon={LogIn} label="Check in" tone="present" disabled={!canCheckIn} onClick={() => punch(employee.id, "in")} />
          <CtaButton icon={LogOut} label="Check out" tone="late" disabled={!canCheckOut} onClick={() => punch(employee.id, "out")} />
          <CtaButton icon={Home} label="WFH check-in" tone="wfh" disabled={!canWfhIn} onClick={() => setWfhModal("in")} />
          <CtaButton icon={Home} label="WFH check-out" tone="wfh" disabled={!canWfhOut} onClick={() => setWfhModal("out")} />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => punch(employee.id, "leave")} style={{ ...secondaryBtn, flex: "unset", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Coffee size={16} /> Mark leave today
          </button>
          <button onClick={() => punch(employee.id, "alternate")} style={{ ...secondaryBtn, flex: "unset", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Repeat size={16} /> Mark as alternate day
          </button>
        </div>

        <RecentActivity employee={employee} attendance={attendance} now={now} />
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
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

function TopBar({ employee, onHelp, onLogout }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 30, background: COLORS.navy, color: "#fff",
      padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
      boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
    }}>
      <LogoMark size={30} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: "#B9C3E8", fontWeight: 600, marginRight: 4, display: window.innerWidth < 480 ? "none" : "inline" }}>
          {employee.department}
        </span>
        <button onClick={onHelp} title="Help" style={topIconBtn}><HelpCircle size={17} /></button>
        <button onClick={onLogout} title="Log out" style={topIconBtn}><SignOut size={17} /></button>
      </div>
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
      <div style={{ fontSize: 11.5, color: COLORS.muted, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: alert ? COLORS.red : COLORS.ink }}>{value}</div>
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
    <button className="rv-cta" onClick={onClick} disabled={disabled} style={{
      background: disabled ? "#E9ECF6" : TONE_BG[tone],
      color: disabled ? COLORS.muted : "#fff",
      boxShadow: disabled ? "none" : "0 8px 20px -6px rgba(15,27,51,0.35)",
    }}>
      <Icon size={22} />
      {label}
    </button>
  );
}

function RecentActivity({ employee, attendance, now }) {
  const days = [...Array(5)].map((_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - i);
    return todayStr(d);
  });
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>Recent activity</div>
      <div className="rv-card" style={{ padding: "6px 4px" }}>
        {days.map(date => {
          const rec = attendance[`${employee.id}|${date}`];
          const status = computeStatus(employee, rec, date < todayStr(now), now.getHours() * 60 + now.getMinutes());
          return (
            <div key={date} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "11px 16px", borderBottom: `1px solid ${COLORS.line}`,
            }}>
              <span style={{ fontSize: 13, color: COLORS.muted, fontWeight: 600 }}>
                {new Date(date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <StatusPill {...status} />
            </div>
          );
        })}
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
