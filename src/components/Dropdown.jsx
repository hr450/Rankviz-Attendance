import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { COLORS, MANUAL_STATUS_OPTIONS } from "../lib/constants";
import { TONE_STYLES } from "../lib/utils";

/* The app's one dropdown.
   A native <select> draws its open list with the operating system's styling —
   the blue highlight bar, the system font — and no CSS on the closed control
   changes that. The only fix is for the app to draw the list itself, which is
   what this does.

   Grown out of the old StatusEditDropdown, which did exactly this but was
   hard-wired to MANUAL_STATUS_OPTIONS and never actually imported anywhere.
   It now takes any option list, so every filter and picker in the app can use
   the same component instead of each page growing its own.

     <Dropdown value={empId} onChange={setEmpId}
               options={employees.map(e => ({ value: e.id, label: e.name }))} />

   Pass showDots for the status picker, where the coloured dot matches the
   StatusPill shown in the same row. */

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

export default function Dropdown({
  value,
  onChange,
  options = MANUAL_STATUS_OPTIONS,
  disabled = false,
  saving = false,
  showDots = false,
  minWidth = 150,
  align = "left",
  placeholder = "Select",
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const current = options.find(o => o.value === (value ?? "")) || null;

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
    if (val !== (value ?? "")) onChange(val);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth, display: "inline-block" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && !saving && setOpen(o => !o)}
        disabled={disabled}
        style={{
          display: "flex", alignItems: "center", gap: 7, width: "100%",
          background: "#fff", border: `1px solid ${open ? COLORS.blue : COLORS.line}`,
          borderRadius: 9, padding: "7px 10px", fontSize: 12.5, fontWeight: 650,
          color: COLORS.ink, cursor: disabled ? "default" : "pointer",
          opacity: saving ? 0.6 : 1, transition: "border-color .15s, box-shadow .15s",
          boxShadow: open ? `0 0 0 3px ${COLORS.blue}22` : "none",
          font: "inherit", fontFamily: "inherit",
        }}
      >
        {saving ? (
          <Loader2 size={12} style={{ animation: "rv-spin .7s linear infinite", color: COLORS.muted }} />
        ) : showDots ? (
          <Dot value={current ? current.value : ""} />
        ) : null}
        <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 650, fontSize: 12.5 }}>
          {current ? current.label : <span style={{ color: COLORS.muted, fontWeight: 500 }}>{placeholder}</span>}
        </span>
        <ChevronDown
          size={13}
          style={{ color: COLORS.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}
        />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          className="rv-anim-fadein"
          style={{
            position: "absolute", top: "calc(100% + 6px)", zIndex: 40,
            [align === "right" ? "right" : "left"]: 0,
            background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 11,
            boxShadow: "0 10px 28px rgba(14,42,82,0.14)", padding: 5,
            minWidth: "100%", maxHeight: 320, overflowY: "auto",
          }}
        >
          {options.map(o => {
            const active = (value ?? "") === o.value;
            return (
              <div
                key={String(o.value)}
                role="option"
                aria-selected={active}
                onClick={() => pick(o.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 9px",
                  borderRadius: 7, fontSize: 12.5, fontWeight: active ? 700 : 550,
                  color: active ? COLORS.blue : COLORS.ink, cursor: "pointer",
                  background: active ? "#EEF3FF" : "transparent",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F7FC"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {showDots && <Dot value={o.value} />}
                <span style={{ flex: 1 }}>{o.label}</span>
                {active && <Check size={13} color={COLORS.blue} />}
              </div>
            );
          })}
          {options.length === 0 && (
            <div style={{ padding: "8px 10px", fontSize: 12.5, color: COLORS.muted }}>Nothing to choose from.</div>
          )}
        </div>
      )}
    </div>
  );
}

// The saving spinner needs this once, globally (top-level CSS or App.jsx):
// @keyframes rv-spin { to { transform: rotate(360deg); } }
