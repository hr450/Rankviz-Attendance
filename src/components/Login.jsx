import React, { useState, useEffect, useRef } from "react";
import { LogIn, UserPlus, ShieldCheck, UserCircle2, Loader2, AlertCircle } from "lucide-react";
import { LogoMark } from "./ui";
import { verifyLogin, createAdminAccount } from "../lib/db";

/* Same set of "trust" words used in the animated design's hidden-word
   spotlight layer — purely decorative, revealed near the cursor. */
const HIDDEN_WORDS = [
  "SECURE", "VERIFIED", "ACCURATE", "ERROR-FREE", "ENCRYPTED", "REAL-TIME",
  "TRUSTED", "AUDIT-READY", "PRECISE", "RELIABLE", "TRANSPARENT", "PROTECTED",
  "INSTANT", "CONSISTENT",
];

function useHiddenWords(count = 14) {
  const [words] = useState(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        id: i,
        text: HIDDEN_WORDS[i % HIDDEN_WORDS.length],
        size: 15 + Math.random() * 24,
        top: 4 + Math.random() * 90,
        left: 2 + Math.random() * 82,
        rot: (Math.random() * 16 - 8).toFixed(1),
      });
    }
    return arr;
  });
  return words;
}

function useParticles(count = 18) {
  const [particles] = useState(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        id: i,
        left: Math.random() * 100,
        dur: 8 + Math.random() * 10,
        delay: Math.random() * 10,
        dx: Math.random() * 80 - 40,
      });
    }
    return arr;
  });
  return particles;
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("admin"); // admin | employee
  const [adminTab, setAdminTab] = useState("login"); // login | signup
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const words = useHiddenWords(14);
  const particles = useParticles(18);
  const brightRef = useRef(null);
  const mouseRef = useRef({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
  });
  const curRef = useRef({ ...mouseRef.current });

  useEffect(() => {
    const onMove = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onTouch = (e) => {
      if (e.touches && e.touches[0]) mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    let raf;
    const loop = () => {
      const c = curRef.current, m = mouseRef.current;
      c.x += (m.x - c.x) * 0.18;
      c.y += (m.y - c.y) * 0.18;
      if (brightRef.current) {
        brightRef.current.style.setProperty("--mx", c.x + "px");
        brightRef.current.style.setProperty("--my", c.y + "px");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      cancelAnimationFrame(raf);
    };
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  /* ---- Auth logic below is unchanged from the previous Login.jsx ---- */
  const doLogin = async () => {
    setError(""); setBusy(true);
    try {
      const acct = await verifyLogin(form.username, form.password);
      if (!acct) { setError("Incorrect username/email or password."); setBusy(false); return; }
      if (mode === "admin" && acct.role !== "admin") { setError("This account isn't an HR/admin account."); setBusy(false); return; }
      if (mode === "employee" && acct.role !== "employee") { setError("This account isn't an employee account."); setBusy(false); return; }
      onLogin(acct);
    } catch (e) {
      setError(e.message || "Something went wrong signing in.");
    }
    setBusy(false);
  };

  const doSignup = async () => {
    setError(""); setBusy(true);
    try {
      if (!form.name.trim()) throw new Error("Enter your full name.");
      if (!form.username.trim()) throw new Error("Enter a username or email.");
      if (form.password.length < 4) throw new Error("Password should be at least 4 characters.");
      const acct = await createAdminAccount(form);
      onLogin(acct);
    } catch (e) {
      setError(e.message || "Couldn't create the account.");
    }
    setBusy(false);
  };

  const submit = () => {
    if (mode === "admin" && adminTab === "signup") doSignup();
    else doLogin();
  };
  /* ---- End unchanged auth logic ---- */

  return (
    <div className="llg-page">
      <style>{CSS}</style>

      <div className="llg-bg" />
      <div className="llg-grid" />
      <div className="llg-orb llg-orb1" />
      <div className="llg-orb llg-orb2" />
      <div className="llg-orb llg-orb3" />

      <div className="llg-particles">
        {particles.map(p => (
          <div key={p.id} className="llg-p" style={{ left: p.left + "vw", animationDuration: p.dur + "s", animationDelay: p.delay + "s", "--dx": p.dx + "px" }} />
        ))}
      </div>

      <div className="llg-words-dim">
        {words.map(w => (
          <div key={w.id} className="llg-hword" style={{ fontSize: w.size, top: w.top + "vh", left: w.left + "vw", transform: `rotate(${w.rot}deg)` }}>{w.text}</div>
        ))}
      </div>
      <div className="llg-words-bright" ref={brightRef}>
        {words.map(w => (
          <div key={w.id} className="llg-hword" style={{ fontSize: w.size, top: w.top + "vh", left: w.left + "vw", transform: `rotate(${w.rot}deg)` }}>{w.text}</div>
        ))}
      </div>

      <div className="llg-stage">
        <div className="llg-logo-row">
          <LogoMark size={64} dark={true} />
        </div>
        <div className="llg-tagline">AI-Powered Attendance Intelligence</div>
        <div className="llg-ai-chip"><span className="llg-ai-dot" /> Secured &amp; verified by <b>RankViz AI</b></div>

        <div className="llg-card">
          <div className={`llg-role-toggle${mode === "employee" ? " employee" : ""}`}>
            <div className="llg-role-pill" />
            <button type="button" className={mode === "admin" ? "active" : ""} onClick={() => { setMode("admin"); setError(""); }}>
              <ShieldCheck size={14} /> HR Admin
            </button>
            <button type="button" className={mode === "employee" ? "active" : ""} onClick={() => { setMode("employee"); setError(""); }}>
              <UserCircle2 size={14} /> Employee
            </button>
          </div>

          <div className="llg-welcome">
            <h1>{mode === "admin" ? (adminTab === "signup" ? "Create HR account" : "Welcome back") : "Employee sign in"}</h1>
            <p>
              {mode === "admin"
                ? "Sign in to manage attendance, employees and reports."
                : "Sign in with the username your HR team set up for you."}
            </p>
          </div>

          {mode === "admin" && (
            <div className={`llg-auth-tabs${adminTab === "signup" ? " signup" : ""}`}>
              <button type="button" className={adminTab === "login" ? "active" : ""} onClick={() => { setAdminTab("login"); setError(""); }}>Log In</button>
              <button type="button" className={adminTab === "signup" ? "active" : ""} onClick={() => { setAdminTab("signup"); setError(""); }}>Sign Up</button>
              <div className="llg-auth-underline" />
            </div>
          )}

          {mode === "admin" && adminTab === "signup" && (
            <div className="llg-field">
              <label>Full name</label>
              <div className="llg-input-wrap">
                <input value={form.name} onChange={set("name")} placeholder="e.g. Ananya Rao" />
              </div>
            </div>
          )}

          <div className="llg-field">
            <label>{mode === "employee" ? "Username" : "Username or email"}</label>
            <div className="llg-input-wrap">
              <input value={form.username} onChange={set("username")}
                placeholder={mode === "employee" ? "e.g. rahul.nair" : "e.g. hr@rankviz.com"} />
            </div>
          </div>
          <div className="llg-field">
            <label>Password</label>
            <div className="llg-input-wrap">
              <input type="password" value={form.password} onChange={set("password")}
                placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} />
            </div>
          </div>

          {error && (
            <div className="llg-error"><AlertCircle size={15} /> {error}</div>
          )}

          <button type="button" onClick={submit} disabled={busy} className="llg-login-btn" style={{ opacity: busy ? 0.75 : 1 }}>
            {busy ? <Loader2 size={16} className="rv-spin" /> : (adminTab === "signup" && mode === "admin" ? <UserPlus size={16} /> : <LogIn size={16} />)}
            {busy ? "Please wait…" : (mode === "admin" && adminTab === "signup" ? "Create account" : "Log in")}
          </button>
        </div>

        <div className="llg-footer">© {new Date().getFullYear()} <b>RankViz</b> · hr@rankviz.com</div>
      </div>
    </div>
  );
}

const CSS = `
.llg-page{
  --navy-950:#050F22; --navy-900:#0A1E42; --navy-800:#0E2A5E;
  --royal:#1E4FD8; --azure:#2F6FED; --sky:#6FA8FF; --ice:#DCE9FB; --ink:#0B1E3F; --red:#D9534F;
  position:relative; min-height:100vh; width:100%; overflow:hidden;
  display:flex; align-items:center; justify-content:center;
  color:#fff;
}
@media (prefers-reduced-motion: reduce){
  .llg-page *{ animation-duration:0.001ms !important; animation-iteration-count:1 !important; transition-duration:0.001ms !important; }
}

.llg-bg{
  position:fixed; inset:0; z-index:0;
  background:linear-gradient(125deg, var(--navy-950), var(--navy-800) 45%, var(--royal) 100%);
  background-size:220% 220%;
  animation:llgBgshift 16s ease-in-out infinite;
}
@keyframes llgBgshift{
  0%{background-position:0% 30%;}
  50%{background-position:100% 70%;}
  100%{background-position:0% 30%;}
}
.llg-grid{
  position:fixed; inset:0; z-index:1; pointer-events:none;
  background-image:
    linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
  background-size:46px 46px;
  mask-image:radial-gradient(ellipse 75% 65% at 50% 35%, black 20%, transparent 78%);
  -webkit-mask-image:radial-gradient(ellipse 75% 65% at 50% 35%, black 20%, transparent 78%);
}
.llg-orb{position:fixed; z-index:1; border-radius:50%; filter:blur(6px); pointer-events:none;}
.llg-orb1{width:420px;height:420px; top:-140px; left:-120px; background:radial-gradient(circle at 35% 30%, var(--sky), transparent 70%); opacity:0.35; animation:llgFloat1 13s ease-in-out infinite;}
.llg-orb2{width:300px;height:300px; bottom:-100px; right:-80px; background:radial-gradient(circle at 40% 40%, var(--azure), transparent 70%); opacity:0.3; animation:llgFloat2 17s ease-in-out infinite;}
.llg-orb3{width:180px;height:180px; top:20%; right:8%; background:radial-gradient(circle, var(--sky), transparent 70%); opacity:0.2; animation:llgFloat3 10s ease-in-out infinite;}
@keyframes llgFloat1{0%,100%{transform:translate(0,0);}50%{transform:translate(60px,50px);}}
@keyframes llgFloat2{0%,100%{transform:translate(0,0);}50%{transform:translate(-50px,-40px);}}
@keyframes llgFloat3{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-30px,40px) scale(1.15);}}

.llg-particles{position:fixed; inset:0; z-index:1; pointer-events:none; overflow:hidden;}
.llg-p{position:absolute; bottom:-20px; width:4px; height:4px; border-radius:50%; background:var(--sky); opacity:0.55; animation:llgDrift linear infinite;}
@keyframes llgDrift{
  0%{transform:translateY(0) translateX(0); opacity:0;}
  10%{opacity:0.6;} 90%{opacity:0.6;}
  100%{transform:translateY(-115vh) translateX(var(--dx,20px)); opacity:0;}
}

.llg-words-dim{position:fixed; inset:0; z-index:1; pointer-events:none; overflow:hidden;}
.llg-hword{position:absolute; font-weight:800; letter-spacing:0.02em; color:rgba(255,255,255,0.045); white-space:nowrap; user-select:none;}
.llg-words-bright{
  position:fixed; inset:0; z-index:1; pointer-events:none; overflow:hidden;
  -webkit-mask-image:radial-gradient(circle 170px at var(--mx,50%) var(--my,50%), black 0%, transparent 100%);
  mask-image:radial-gradient(circle 170px at var(--mx,50%) var(--my,50%), black 0%, transparent 100%);
}
.llg-words-bright .llg-hword{ color:var(--sky); text-shadow:0 0 18px rgba(111,168,255,0.85), 0 0 40px rgba(47,111,237,0.4); }

.llg-stage{position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; padding:40px 20px; width:100%;}

.llg-logo-row{
  opacity:0; transform:translateY(-18px) scale(0.96);
  animation:llgLogoIn 0.9s cubic-bezier(.2,.8,.2,1) forwards;
}
@keyframes llgLogoIn{ to{ opacity:1; transform:translateY(0) scale(1); } }

.llg-tagline{
  margin-top:10px; font-size:13px; letter-spacing:0.22em; text-transform:uppercase; color:#AFC7F2;
  opacity:0; animation:llgFadeUp 0.8s ease forwards 0.35s;
}
@keyframes llgFadeUp{ from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:translateY(0);} }

.llg-ai-chip{
  margin-top:14px; display:inline-flex; align-items:center; gap:7px; font-size:12px; color:#CBDBFF;
  background:rgba(111,168,255,0.1); border:1px solid rgba(111,168,255,0.25);
  padding:7px 14px; border-radius:100px;
  opacity:0; animation:llgFadeUp 0.8s ease forwards 0.5s;
}
.llg-ai-chip b{color:#FFFFFF;}
.llg-ai-dot{
  width:7px; height:7px; border-radius:50%; background:#7FE0A8; display:inline-block;
  box-shadow:0 0 0 0 rgba(127,224,168,0.6); animation:llgAiPulse 1.6s ease-out infinite;
}
@keyframes llgAiPulse{
  0%{box-shadow:0 0 0 0 rgba(127,224,168,0.55);}
  70%{box-shadow:0 0 0 6px rgba(127,224,168,0);}
  100%{box-shadow:0 0 0 0 rgba(127,224,168,0);}
}

.llg-card{
  margin-top:34px; width:min(400px,92vw);
  background:rgba(255,255,255,0.98); border-radius:20px; padding:28px 28px 30px; color:var(--ink);
  box-shadow:0 40px 80px -20px rgba(3,10,25,0.55), 0 0 0 1px rgba(255,255,255,0.06);
  opacity:0; transform:translateY(24px);
  animation:llgCardIn 0.8s cubic-bezier(.2,.8,.2,1) forwards 0.45s;
}
@keyframes llgCardIn{ to{opacity:1; transform:translateY(0);} }

.llg-role-toggle{ display:flex; background:#EEF3FC; border-radius:12px; padding:4px; position:relative; }
.llg-role-toggle button{
  flex:1; border:none; background:transparent; cursor:pointer;
  font-size:13.5px; font-weight:700; color:#6E85A8;
  padding:10px 8px; border-radius:9px; position:relative; z-index:2;
  display:flex; align-items:center; justify-content:center; gap:6px;
  transition:color 0.25s ease;
}
.llg-role-toggle button.active{color:var(--royal);}
.llg-role-pill{
  position:absolute; top:4px; left:4px; height:calc(100% - 8px); width:calc(50% - 4px);
  background:#fff; border-radius:9px; box-shadow:0 6px 16px -6px rgba(30,79,216,0.35);
  transition:transform 0.32s cubic-bezier(.2,.8,.2,1);
}
.llg-role-toggle.employee .llg-role-pill{ transform:translateX(100%); }

.llg-welcome{margin-top:22px;}
.llg-welcome h1{font-size:22px; font-weight:800; letter-spacing:-0.01em;}
.llg-welcome p{font-size:13.5px; color:#6E85A8; margin-top:5px;}

.llg-auth-tabs{display:flex; gap:22px; margin-top:20px; border-bottom:1px solid #E7EEFA; position:relative;}
.llg-auth-tabs button{ background:none; border:none; cursor:pointer; font-size:14px; font-weight:700; color:#8CA0C2; padding:0 0 10px; position:relative; }
.llg-auth-tabs button.active{color:var(--royal);}
.llg-auth-underline{position:absolute; bottom:-1px; left:0; height:2px; width:52px; background:var(--royal); transition:transform 0.3s cubic-bezier(.2,.8,.2,1);}
.llg-auth-tabs.signup .llg-auth-underline{ transform:translateX(76px); width:66px; }

.llg-field{margin-top:18px;}
.llg-field label{font-size:12.5px; font-weight:700; color:#3C5478; display:block; margin-bottom:7px;}
.llg-input-wrap{position:relative;}
.llg-field input{
  width:100%; border:1.5px solid #E7EEFA; background:#F5F9FF; border-radius:10px;
  padding:12px 14px; font-size:14px; color:var(--ink);
  outline:none; transition:border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}
.llg-field input:focus{ border-color:var(--azure); background:#fff; box-shadow:0 0 0 4px rgba(47,111,237,0.14); }

.llg-error{
  display:flex; align-items:center; gap:8px; background:#FBE8E7; color:var(--red);
  padding:9px 12px; border-radius:10px; font-size:13px; margin-top:14px; font-weight:600;
}

.llg-login-btn{
  margin-top:24px; width:100%; border:none; cursor:pointer;
  background:linear-gradient(135deg, var(--royal), var(--navy-800)); background-size:180% 180%;
  color:#fff; font-weight:800; font-size:15px; padding:14px; border-radius:11px;
  display:flex; align-items:center; justify-content:center; gap:9px;
  box-shadow:0 16px 30px -12px rgba(30,79,216,0.55);
  transition:transform 0.2s cubic-bezier(.2,.8,.3,1), box-shadow 0.2s ease, background-position 0.5s ease;
}
.llg-login-btn:hover{ transform:translateY(-2px) scale(1.015); box-shadow:0 22px 38px -12px rgba(30,79,216,0.6); background-position:100% 50%; }
.llg-login-btn:active{ transform:translateY(0) scale(0.99); }

.llg-footer{ margin-top:26px; text-align:center; font-size:12px; color:#B9CBEF; opacity:0; animation:llgFadeUp 0.8s ease forwards 0.75s; }
.llg-footer b{color:#DCE9FB;}

@media (max-width:420px){ .llg-card{padding:24px 20px 26px;} }
`;
