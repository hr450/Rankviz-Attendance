import React, { useEffect, useState } from "react";
import { COLORS } from "../lib/constants";
import { LogoMark } from "./ui";

/**
 * Shows the RankViz logo pop in, holds briefly, then slides the whole
 * panel upward and off-screen, calling onDone once the transition finishes.
 */
export default function Splash({ onDone, subtitle = "Attendance, made visible.", holdMs = 1200 }) {
  const [phase, setPhase] = useState("in"); // in -> hold -> out

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("out"), holdMs);
    const t2 = setTimeout(() => onDone && onDone(), holdMs + 650);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [holdMs, onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: `radial-gradient(circle at 30% 20%, ${COLORS.navy2}, ${COLORS.navy} 65%)`,
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
      animation: phase === "out" ? "rvSlideUpOut .6s cubic-bezier(.6,0,.4,1) forwards" : undefined,
    }}>
      <div className="rv-anim-popin" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div className="rv-anim-float">
          <LogoMark size={78} showWord={false} />
        </div>
        <div style={{ fontWeight: 900, fontSize: 34, color: "#fff", letterSpacing: -0.5 }}>RankViz</div>
        <div style={{ color: "#B9C3E8", fontSize: 14, fontWeight: 500 }}>{subtitle}</div>
      </div>
    </div>
  );
}
