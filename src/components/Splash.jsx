import React, { useEffect, useState } from "react";
import { COLORS } from "../lib/constants";
import { LogoMark } from "./ui";
import bgImage from "../assets/login-background.webp";
import logoFull from "../assets/logo-full.png";

/**
 * Shows the RankViz logo pop in, holds briefly, then slides the whole
 * panel upward and off-screen, calling onDone once the transition finishes.
 */
export default function Splash({ onDone, subtitle = "Attendance, made visible.", holdMs = 150 }) {
  const [phase, setPhase] = useState("in"); // in -> hold -> out
  const [logoReady, setLogoReady] = useState(false);
  const SLIDE_MS = 500;

  // Preload the logo image first. Starting the pop-in animation before the
  // image has actually downloaded is what caused the "thin line" glitch —
  // the animation would scale/translate an empty image box.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setLogoReady(true);
    img.onerror = () => setLogoReady(true); // don't hang the splash forever if it fails
    img.src = logoFull;
    if (img.complete) setLogoReady(true); // already cached
  }, []);

  // Only start the hold/exit timers once the logo is actually visible.
  useEffect(() => {
    if (!logoReady) return;
    const t1 = setTimeout(() => setPhase("out"), holdMs);
    const t2 = setTimeout(() => onDone && onDone(), holdMs + SLIDE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [logoReady, holdMs, onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      backgroundImage: `linear-gradient(180deg, rgba(6,12,28,0.55), rgba(6,12,28,0.8)), url(${bgImage})`,
      backgroundSize: "cover", backgroundPosition: "center",
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
      animation: phase === "out" ? `rvSlideUpOut ${SLIDE_MS}ms cubic-bezier(.6,0,.4,1) forwards` : undefined,
    }}>
      {logoReady && (
        <div className="rv-anim-popin" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div className="rv-anim-float">
            <LogoMark size={78} />
          </div>
          <div style={{ color: "#B9C3E8", fontSize: 14, fontWeight: 500 }}>{subtitle}</div>
        </div>
      )}
    </div>
  );
}
