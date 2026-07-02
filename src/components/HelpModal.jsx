import React from "react";
import { X, Mail, LogIn, LogOut, Home, Coffee, HelpCircle } from "lucide-react";
import { COLORS } from "../lib/constants";

const ITEMS = [
  { icon: LogIn, title: "Check in", body: "Tap Check in when you arrive at the office. It's disabled once you've already checked in today." },
  { icon: LogOut, title: "Check out", body: "Tap Check out before you leave. Forgetting to check out shows as \"No checkout\" in reports." },
  { icon: Home, title: "WFH check-in / check-out", body: "Working remotely? Use the WFH buttons instead — they open a short form and log separately from office hours." },
  { icon: Coffee, title: "Leave", body: "Mark a leave day if you won't be working at all. HR is notified automatically." },
];

export default function HelpModal({ onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,27,51,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60,
    }} className="rv-anim-fadein" onClick={onClose}>
      <div className="rv-card rv-anim-slideupin" style={{ width: "100%", maxWidth: 440, padding: 26 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HelpCircle size={20} color={COLORS.orange} />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>How this works</h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}><X size={20} /></button>
        </div>
        <p style={{ color: COLORS.muted, fontSize: 13, margin: "0 0 18px" }}>A quick guide to your attendance dashboard.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          {ITEMS.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: COLORS.bg, color: COLORS.orange,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}><it.icon size={17} /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{it.title}</div>
                <div style={{ fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>{it.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 8, background: COLORS.bg, borderRadius: 12,
          padding: "10px 12px", fontSize: 12.5, color: COLORS.muted,
        }}>
          <Mail size={14} /> Need more help? Reach HR at <strong style={{ color: COLORS.ink }}>hr@rankviz.com</strong>
        </div>
      </div>
    </div>
  );
}
