import React, { useEffect, useState } from "react";
import { COLORS } from "../lib/constants";
import { LogoMark } from "./ui";
import bgImage from "../assets/login-background.webp";

/**
 * Shows the RankViz logo pop in, holds briefly, then slides the whole
 * panel upward and off-screen, calling onDone once the transition finishes.
 */
export default function Splash({ onDone, subtitle = "Attendance, made visible.", holdMs = 150 }) {
  const [phase, setPhase] = useState("in"); // in -> hold -> out

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("out"), holdMs);
    const t2 = setTimeout(() => onDone && onDone(), holdMs + 350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [holdMs, onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      backgroundImage: `linear-gradient(180deg, rgba(6,12,28,0.55), rgba(6,12,28,0.8)), url(${bgImage})`,
      backgroundSize: "cover", backgroundPosition: "center",
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
      animation: phase === "out" ? "rvSlideUpOut .35s cubic-bezier(.6,0,.4,1) forwards" : undefined,
    }}>
      <div className="rv-anim-popin" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div className="rv-anim-float">
          <LogoMark size={78} showWord={false} />
        </div>
        <div style={{ color: "#B9C3E8", fontSize: 14, fontWeight: 500 }}>{subtitle}</div>
      </div>
    </div>
  );
}
