import React, { useState } from "react";
import { LogIn, UserPlus, ShieldCheck, UserCircle2, Loader2, AlertCircle } from "lucide-react";
import { COLORS } from "../lib/constants";
import { LogoMark, Field, inputStyle, primaryBtn } from "./ui";
import { verifyLogin, createAdminAccount } from "../lib/db";
import bgImage from "../assets/login-background.webp";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("admin"); // admin | employee
  const [adminTab, setAdminTab] = useState("login"); // login | signup
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

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

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: `linear-gradient(160deg, rgba(14,42,82,0.55) 0%, rgba(14,42,82,0.82) 100%), url(${bgImage})`,
      backgroundSize: "cover", backgroundPosition: "center", padding: 20,
    }} className="rv-anim-fadein">
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
          <LogoMark size={54} dark={true} />
        </div>

        <div className="rv-card rv-anim-slideupin" style={{ padding: "30px 28px 26px" }}>
          <div style={{ display: "flex", gap: 6, background: COLORS.bg, borderRadius: 12, padding: 4, marginBottom: 22 }}>
            {[
              { id: "admin", label: "HR Admin", icon: ShieldCheck },
              { id: "employee", label: "Employee", icon: UserCircle2 },
            ].map(m => (
              <button key={m.id} onClick={() => { setMode(m.id); setError(""); }} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer",
                background: mode === m.id ? "#fff" : "transparent",
                boxShadow: mode === m.id ? "0 1px 4px rgba(15,27,51,0.12)" : "none",
                color: mode === m.id ? COLORS.orange : COLORS.muted, fontWeight: 700, fontSize: 13.5,
                transition: "all .15s",
              }}>
                <m.icon size={15} />{m.label}
              </button>
            ))}
          </div>

          <h2 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 800 }}>
            {mode === "admin" ? (adminTab === "signup" ? "Create HR account" : "Welcome back") : "Employee sign in"}
          </h2>
          <p style={{ margin: "0 0 22px", fontSize: 13.5, color: COLORS.muted }}>
            {mode === "admin"
              ? "Sign in to manage attendance, employees and reports."
              : "Sign in with the username your HR team set up for you."}
          </p>

          {mode === "admin" && (
            <div style={{ display: "flex", gap: 18, marginBottom: 18, borderBottom: `1px solid ${COLORS.line}` }}>
              {["login", "signup"].map(t => (
                <button key={t} onClick={() => { setAdminTab(t); setError(""); }} style={{
                  background: "none", border: "none", cursor: "pointer", padding: "0 0 10px",
                  fontWeight: 700, fontSize: 13.5, color: adminTab === t ? COLORS.orange : COLORS.muted,
                  borderBottom: adminTab === t ? `2px solid ${COLORS.orange}` : "2px solid transparent",
                  marginBottom: -1, textTransform: "capitalize",
                }}>{t === "login" ? "Log in" : "Sign up"}</button>
              ))}
            </div>
          )}

          {mode === "admin" && adminTab === "signup" && (
            <Field label="Full name">
              <input value={form.name} onChange={set("name")} style={inputStyle} placeholder="e.g. Ananya Rao" />
            </Field>
          )}

          <Field label={mode === "employee" ? "Username" : "Username or email"}>
            <input value={form.username} onChange={set("username")} style={inputStyle}
              placeholder={mode === "employee" ? "e.g. rahul.nair" : "e.g. hr@rankviz.com"} />
          </Field>
          <Field label="Password">
            <input type="password" value={form.password} onChange={set("password")} style={inputStyle}
              placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} />
          </Field>

          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, background: "#FBE8E7", color: COLORS.red,
              padding: "9px 12px", borderRadius: 10, fontSize: 13, marginBottom: 14, fontWeight: 600,
            }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <button onClick={submit} disabled={busy} style={{ ...primaryBtn, width: "100%", marginTop: 4, opacity: busy ? 0.7 : 1 }}>
            {busy ? <Loader2 size={16} className="rv-spin" /> : (adminTab === "signup" && mode === "admin" ? <UserPlus size={16} /> : <LogIn size={16} />)}
            {busy ? "Please wait…" : (mode === "admin" && adminTab === "signup" ? "Create account" : "Log in")}
          </button>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13.5 }}>
            {mode === "admin" ? (
              <a href="#" onClick={e => { e.preventDefault(); setMode("employee"); setError(""); }}
                style={{ color: COLORS.orange, fontWeight: 700, textDecoration: "none" }}>
                Employee?? login here →
              </a>
            ) : (
              <a href="#" onClick={e => { e.preventDefault(); setMode("admin"); setError(""); }}
                style={{ color: COLORS.orange, fontWeight: 700, textDecoration: "none" }}>
                Admin?? login here →
              </a>
            )}
          </div>
        </div>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 18 }}>
          © {new Date().getFullYear()} RankViz · hr@rankviz.com
        </p>
      </div>
    </div>
  );
}
