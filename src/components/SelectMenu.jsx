import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { COLORS } from "../lib/constants";

/* A drop-in replacement for a native <select>.
   A native select renders its option list with the operating system's own
   styling — the blue highlight bar, the system font — which is why the
   Employees filter looked nothing like the rest of the app no matter what CSS
   was applied to the closed control. The list can only be styled if the app
   draws it, so this draws it.

   Usage is the same shape as the select it replaces:

     <SelectMenu
       value={empId}
       onChange={setEmpId}
       options={employees.map(e => ({ value: e.id, label: e.name }))}
       minWidth={220}
     />
*/
export default function SelectMenu({
  value,
  onChange,
  options,
  minWidth = 160,
  placeholder = "Select",
  align = "left",
  ariaLabel,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setHover(null); } };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (v) => { onChange(v); setOpen(false); setHover(null); };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, minWidth, width: "100%",
          background: open ? "#EEF4FF" : "#fff",
          border: `1.5px solid ${open ? COLORS.blue : COLORS.line}`,
          borderRadius: 9, padding: "8px 12px", font: "inherit", fontSize: 13,
          fontWeight: 700, color: open ? "#2B4C9E" : COLORS.ink,
          cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
          textAlign: "left", transition: "border-color 120ms ease, background 120ms ease",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : <span style={{ color: COLORS.muted, fontWeight: 500 }}>{placeholder}</span>}
        </span>
        <ChevronDown
          size={14}
          style={{ flex: "0 0 auto", transform: open ? "rotate(180deg)" : "none", transition: "transform 140ms ease" }}
        />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          className="rv-anim-fadein"
          style={{
            position: "absolute", top: "calc(100% + 6px)", zIndex: 50,
            [align === "right" ? "right" : "left"]: 0,
            minWidth: "100%", maxHeight: 320, overflowY: "auto",
            background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 11,
            boxShadow: "0 14px 34px rgba(20,32,60,.16)", padding: 5,
          }}
        >
          {options.map(o => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(o.value)}
                onMouseEnter={() => setHover(o.value)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(o.value)}
                onBlur={() => setHover(null)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, width: "100%", textAlign: "left", border: "none",
                  borderRadius: 8, cursor: "pointer", padding: "8px 10px", font: "inherit",
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? "#2B4C9E" : COLORS.ink,
                  background: active ? "#EEF4FF" : (hover === o.value ? "#F4F7FC" : "transparent"),
                  transition: "background 110ms ease",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                {active && <Check size={14} style={{ flex: "0 0 auto" }} />}
              </button>
            );
          })}
          {options.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12.5, color: COLORS.muted }}>Nothing to choose from.</div>
          )}
        </div>
      )}
    </div>
  );
}
