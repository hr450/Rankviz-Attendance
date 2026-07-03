import React, { useState } from "react";
import { Building2, Calendar, Users, BarChart3, FileText, X, Menu, LogOut, CalendarCheck } from "lucide-react";
import { COLORS } from "../lib/constants";
import { LogoMark } from "./ui";

const NAV_ITEMS = [
  { id: "today", label: "Today", icon: Building2 },
  { id: "log", label: "Attendance Log", icon: Calendar },
  { id: "employees", label: "Employees", icon: Users },
  { id: "leaveApprovals", label: "Leave Approvals", icon: CalendarCheck },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "monthly", label: "Monthly Report", icon: FileText },
];

export default function Shell({ children, tab, setTab, saveState, account, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="rv-sidebar-desktop" style={{
        width: 252, background: `linear-gradient(190deg, ${COLORS.navy2}, ${COLORS.navy})`, color: "#fff",
        flexDirection: "column", padding: "22px 16px", flexShrink: 0, position: "sticky", top: 0, height: "100vh",
      }}>
        <SidebarInner tab={tab} setTab={setTab} account={account} onLogout={onLogout} />
      </aside>

      <div className="rv-mobile-bar" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 40,
        background: COLORS.navy, color: "#fff", alignItems: "center",
        justifyContent: "space-between", padding: "12px 16px", boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
      }}>
        <LogoMark size={30} />
        <button onClick={() => setMobileOpen(v => !v)} style={{
          background: COLORS.orange, color: "#fff", border: "none", borderRadius: 9,
          padding: "8px 10px", fontWeight: 700, display: "flex",
        }}>{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button>
      </div>
      {mobileOpen && (
        <div style={{
          position: "fixed", top: 58, left: 0, right: 0, bottom: 0, zIndex: 39,
          background: COLORS.navy, padding: 16, overflowY: "auto",
        }} className="rv-anim-fadein">
          <SidebarInner tab={tab} setTab={(t) => { setTab(t); setMobileOpen(false); }} account={account} onLogout={onLogout} />
        </div>
      )}

      <main className="rv-main-pad" style={{ flex: 1, minWidth: 0, padding: "24px 24px 60px" }}>
        <TopBar saveState={saveState} account={account} />
        {children}
      </main>
    </div>
  );
}

function SidebarInner({ tab, setTab, account, onLogout }) {
  return (
    <>
      <div style={{ padding: "0 8px 24px" }}><LogoMark size={34} /></div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)",
        borderRadius: 12, padding: "10px 12px", marginBottom: 20,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 99, background: COLORS.orange, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0,
        }}>{(account?.name || "H").slice(0, 1).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{account?.name || "HR Admin"}</div>
          <div style={{ fontSize: 11.5, color: "#9AA4CC" }}>HR Department</div>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className="rv-nav-btn" style={{
            background: tab === id ? "rgba(47,111,237,0.22)" : "transparent",
            color: tab === id ? "#fff" : "#B9BEDD",
          }}>
            <Icon size={17} color={tab === id ? COLORS.orange : "#8F94BB"} />
            {label}
          </button>
        ))}
      </nav>

      <button onClick={onLogout} className="rv-nav-btn" style={{ color: "#B9BEDD", marginTop: 8 }}>
        <LogOut size={17} color="#8F94BB" /> Log out
      </button>
    </>
  );
}

function TopBar({ saveState, account }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15, color: COLORS.navy }}>
        <span style={{
          width: 8, height: 8, borderRadius: 99,
          background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.violet})`,
        }} />
        RankViz
      </div>
      <span style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 600 }}>
        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : ""}
      </span>
    </div>
  );
}
