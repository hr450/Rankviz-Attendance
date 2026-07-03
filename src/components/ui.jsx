import React from "react";
import { COLORS } from "../lib/constants";
import { TONE_STYLES } from "../lib/utils";
import logoFull from "../assets/logo-full.png";

export function StatusPill({ label, tone }) {
  const s = TONE_STYLES[tone] || TONE_STYLES.pending;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: s.bg, color: s.fg, fontWeight: 600, fontSize: 12.5,
      padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: s.dot }} />
      {label}
    </span>
  );
}

export function StatCard({ label, value, tone }) {
  const s = TONE_STYLES[tone] || TONE_STYLES.pending;
  return (
    <div className="rv-card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: s.dot }} />
        <span style={{ fontSize: 27, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ color: COLORS.muted, fontSize: 13, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export function IconBtn({ children, onClick, title, disabled }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} className="rv-icon-btn">
      {children}
    </button>
  );
}

export function Field({ label, children, style, hint }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`,
  fontSize: 14, color: COLORS.ink, boxSizing: "border-box", outline: "none",
  transition: "border-color .15s, box-shadow .15s", background: "#fff",
};
export const selectStyle = { ...inputStyle, cursor: "pointer" };

export const primaryBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.orangeDark})`, color: "#fff",
  border: "none", borderRadius: 11, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
  boxShadow: "0 6px 16px rgba(47,111,237,0.28)", transition: "transform .12s, box-shadow .12s",
};
export const secondaryBtn = {
  flex: 1, background: COLORS.bg, color: COLORS.ink, border: `1px solid ${COLORS.line}`,
  borderRadius: 11, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
  transition: "background .12s",
};

export const th = { padding: "9px 12px", fontWeight: 600 };
export const td = { padding: "12px 12px", fontSize: 14 };

export function LogoMark({ size = 40, showWord = true, dark = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <img
        src={logoFull}
        alt="RankViz logo"
        style={{ height: size, width: "auto", objectFit: "contain", flexShrink: 0, display: "block" }}
      />
      {showWord && (
        <span style={{
          fontWeight: 800, fontSize: size * 0.44, letterSpacing: -0.3,
          color: dark ? "#fff" : COLORS.ink,
        }}>RankViz</span>
      )}
    </div>
  );
}
