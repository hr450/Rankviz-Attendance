import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { COLORS, MANUAL_STATUS_OPTIONS } from "../lib/constants";
import { TONE_STYLES } from "../lib/utils";

// Maps a MANUAL_STATUS_OPTIONS value -> the tone key TONE_STYLES uses,
// so the dot color always matches the StatusPill color shown elsewhere.
const VALUE_TO_TONE = {
  "": "pending",
  present: "present",
  half: "half",
  wfh: "wfh",
  short_leave: "short_leave",
  holiday: "holiday",
  absent: "absent",
};

function Dot({ value, size = 8 }) {
  const tone = TONE_STYLES[VALUE_TO_TONE[value] || "pending"];
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: value === "" ? "#C7CEE3" : tone.dot,
        boxShadow: value === "" ? "none" : `0 0 0 3px ${tone.bg}`,
      }}
    />
  );
}

export default function StatusEditDropdown({ value, onChange, disabled, saving }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const current = MANUAL_STATUS_OPTIONS.find(o => o.value === (value || "")) || MANUAL_STATUS_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const pick = (val) => {
    setOpen(false);
    if (val !== (value || "")) onChange(val);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: 128 }}>
      <button
        type="button"
        onClick={() => !disabled && !saving && setOpen(o => !o)}
        disabled={disabled}
        style={{
          display: "flex", alignItems: "center", gap: 7, width: "100%",
          background: "#fff", border: `1px solid ${open ? COLORS.blue : COLORS.line}`,
          borderRadius: 9, padding: "7px 9px", fontSize: 12.5, fontWeight: 650,
          color: COLORS.ink, cursor: disabled ? "default" : "pointer",
          opacity: saving ? 0.6 : 1, transition: "border-color .15s, box-shadow .15s",
          boxShadow: open ? `0 0 0 3px ${COLORS.blue}22` : "none",
        }}
      >
        {saving ? (
          <Loader2 size={12} style={{ animation: "rv-spin .7s linear infinite", color: COLORS.muted }} />
        ) : (
          <Dot value={current.value} />
        )}
        <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {current.label}
        </span>
        <ChevronDown size={13} style={{ color: COLORS.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
      </button>

      {open && (
        <div
          className="rv-anim-fadein"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40,
            background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 11,
            boxShadow: "0 10px 28px rgba(14,42,82,0.14)", padding: 5, minWidth: 148,
          }}
        >
          {MANUAL_STATUS_OPTIONS.map(o => {
            const active = (value || "") === o.value;
            return (
              <div
                key={o.value}
                onClick={() => pick(o.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 9px",
                  borderRadius: 7, fontSize: 12.5, fontWeight: active ? 700 : 550,
                  color: active ? COLORS.blue : COLORS.ink, cursor: "pointer",
                  background: active ? "#EEF3FF" : "transparent",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F7FC"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <Dot value={o.value} />
                <span style={{ flex: 1 }}>{o.label}</span>
                {active && <Check size={13} color={COLORS.blue} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Add once, globally (e.g. in your top-level CSS or App.jsx <style>):
// @keyframes rv-spin { to { transform: rotate(360deg); } }
