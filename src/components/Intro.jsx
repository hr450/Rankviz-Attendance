import React, { useState, useEffect } from "react";
import { ShieldCheck, TrendingUp, ClipboardList, Lock, ArrowRight } from "lucide-react";
import { LogoMark } from "./ui";

const MESSAGES = [
  { text: "Hi!", emotion: "happy" },
  { text: "Hi employee, please punch your attendance!", emotion: "alert" },
  { text: "RankViz never forgets a check-in.", emotion: "calm" },
  { text: "One tap. Fully verified.", emotion: "excited" },
];

const ADVANTAGES = [
  { icon: ShieldCheck, title: "AI Verification", desc: "Every check-in is checked in real time, not at month-end." },
  { icon: TrendingUp, title: "Anomaly Detection", desc: "Odd hours or duplicate punches get flagged instantly." },
  { icon: ClipboardList, title: "Audit-Ready Reports", desc: "Export clean, timestamped history for any date range." },
  { icon: Lock, title: "Bank-Grade Security", desc: "256-bit encryption on every record, always." },
];

export default function Intro({ onContinue }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [show, setShow] = useState(true);
  const [particles] = useState(() =>
    Array.from({ length: 16 }, () => ({
      left: Math.random() * 100,
      dur: 8 + Math.random() * 10,
      delay: Math.random() * 10,
      dx: Math.random() * 80 - 40,
    }))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setMsgIndex(i => (i + 1) % MESSAGES.length);
        setShow(true);
      }, 300);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  const msg = MESSAGES[msgIndex];

  return (
    <div className="rvintro-page">
      <style>{CSS}</style>
      <div className="rvintro-bg" />
      <div className="rvintro-orb rvintro-orb1" />
      <div className="rvintro-orb rvintro-orb2" />
      <div className="rvintro-orb rvintro-orb3" />

      <div className="rvintro-particles">
        {particles.map((p, i) => (
          <span
            key={i}
            className="rvintro-particle"
            style={{ left: `${p.left}vw`, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, "--dx": `${p.dx}px` }}
          />
        ))}
      </div>

      <div className="rvintro-stage">
        <div className="rvintro-top-row">
          <div className="rvintro-brand"><LogoMark size={36} dark={true} showWord={false} /></div>
          <div className="rvintro-status-chip"><span className="rvintro-dot" /> Live &amp; verifying</div>
        </div>

        <div className="rvintro-main-grid">
          <div className="rvintro-left-info">
            <div className="rvintro-eyebrow">AI-Powered Attendance</div>
            <h1>Attendance that <span>verifies itself.</span></h1>
            <p className="rvintro-lede">
              RankViz replaces registers and spreadsheets with one web system that logs every check-in the moment it happens. <b>Accurate, secure, and error-free — by design.</b>
            </p>
            <div className="rvintro-adv-list">
              {ADVANTAGES.map((a, i) => (
                <div key={i} className="rvintro-adv-item">
                  <div className="rvintro-ico"><a.icon size={15} /></div>
                  <div>
                    <h3>{a.title}</h3>
                    <p>{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rvintro-robot-col">
            <div className="rvintro-robot-panel">
              <div className="rvintro-panel-chrome"><span/><span/><span/></div>
              <div className="rvintro-panel-label">LIVE</div>
              <div className={`rvintro-robot rvintro-emotion-${msg.emotion}`}>
                <div className="rvintro-robot-antenna" />
                <div className="rvintro-robot-head">
                  <div className="rvintro-robot-eyebrow rvintro-robot-eyebrow-l" />
                  <div className="rvintro-robot-eyebrow rvintro-robot-eyebrow-r" />
                  <div className="rvintro-robot-face">
                    <div className="rvintro-robot-eye" />
                    <div className="rvintro-robot-eye" />
                  </div>
                  <div className="rvintro-robot-mouth" />
                  <div className="rvintro-robot-blush rvintro-robot-blush-l" />
                  <div className="rvintro-robot-blush rvintro-robot-blush-r" />
                </div>
                <div className="rvintro-robot-body">
                  <div className="rvintro-robot-chest"><span/></div>
                  <div className="rvintro-robot-arm rvintro-robot-arm-l" />
                  <div className="rvintro-robot-arm rvintro-robot-arm-r" />
                </div>
              </div>
              <div className={`rvintro-robot-message${show ? " show" : ""}`}>{msg.text}</div>
              <div className="rvintro-panel-caption">Your attendance assistant, always on.</div>
            </div>

            <div className="rvintro-robot-cta">
              <button className="rvintro-cta" onClick={onContinue}>
                Sign Up <ArrowRight size={15} />
              </button>
              <button className="rvintro-skip" onClick={onContinue}>Skip</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.rvintro-page{
  --navy-950:#050F22; --navy-900:#0A1E42; --navy-800:#0E2A5E;
  --royal:#1E4FD8; --azure:#2F6FED; --sky:#6FA8FF; --slate:#AEC1E8; --mint:#3DDC97;
  position:relative; min-height:100vh; overflow:hidden; color:#fff;
  display:flex; flex-direction:column;
}
@media (prefers-reduced-motion: reduce){
  .rvintro-page *{ animation-duration:0.001ms !important; animation-iteration-count:1 !important; transition-duration:0.001ms !important; }
}
.rvintro-bg{
  position:fixed; inset:0; z-index:0;
  background:linear-gradient(160deg, var(--navy-950), var(--navy-800) 55%, var(--royal) 130%);
  background-size:220% 220%;
  animation:rvintroBgshift 18s ease-in-out infinite;
}
@keyframes rvintroBgshift{
  0%{background-position:0% 20%;} 50%{background-position:100% 80%;} 100%{background-position:0% 20%;}
}
.rvintro-particles{ position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
.rvintro-particle{
  position:absolute; bottom:-20px; width:4px; height:4px; border-radius:50%;
  background:var(--azure); opacity:0.4; animation-name:rvintroDrift; animation-timing-function:linear; animation-iteration-count:infinite;
}
@keyframes rvintroDrift{
  0%{ transform:translateY(0) translateX(0); opacity:0; }
  10%{ opacity:0.4; }
  90%{ opacity:0.4; }
  100%{ transform:translateY(-115vh) translateX(var(--dx,20px)); opacity:0; }
}

.rvintro-orb{position:fixed; z-index:0; border-radius:50%; filter:blur(50px); pointer-events:none;}
.rvintro-orb1{width:480px;height:480px; top:-200px; left:-150px; background:radial-gradient(circle, var(--sky), transparent 70%); opacity:0.3; animation:rvintroFloat1 15s ease-in-out infinite;}
.rvintro-orb2{width:420px;height:420px; bottom:-200px; right:-150px; background:radial-gradient(circle, var(--azure), transparent 70%); opacity:0.2; animation:rvintroFloat2 18s ease-in-out infinite;}
.rvintro-orb3{width:240px;height:240px; top:15%; right:12%; background:radial-gradient(circle, var(--sky), transparent 70%); opacity:0.18; animation:rvintroFloat3 11s ease-in-out infinite;}
@keyframes rvintroFloat1{0%,100%{transform:translate(0,0);}50%{transform:translate(50px,40px);}}
@keyframes rvintroFloat2{0%,100%{transform:translate(0,0);}50%{transform:translate(-45px,-35px);}}
@keyframes rvintroFloat3{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-25px,30px) scale(1.12);}}

.rvintro-stage{position:relative; z-index:2; flex:1; display:flex; flex-direction:column; width:100%; max-width:1180px; margin:0 auto; padding:clamp(24px,4vh,44px) clamp(20px,5vw,48px) 0;}
.rvintro-top-row{display:flex; justify-content:space-between; align-items:center; padding-bottom:8px;}
.rvintro-brand{ opacity:0; animation:rvintroFadeUp 0.8s ease forwards 0.05s; }
.rvintro-status-chip{
  display:inline-flex; align-items:center; gap:7px; font-size:11.5px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;
  color:var(--sky); background:rgba(255,255,255,0.06); border:1px solid rgba(111,168,255,0.3);
  padding:7px 13px 7px 11px; border-radius:100px; opacity:0; animation:rvintroFadeUp 0.8s ease forwards 0.1s;
}
.rvintro-dot{width:6px;height:6px;border-radius:50%; background:var(--mint); display:inline-block; box-shadow:0 0 0 0 rgba(24,178,116,0.5); animation:rvintroAiPulse 1.6s ease-out infinite;}
@keyframes rvintroAiPulse{0%{box-shadow:0 0 0 0 rgba(24,178,116,0.45);}70%{box-shadow:0 0 0 6px rgba(24,178,116,0);}100%{box-shadow:0 0 0 0 rgba(24,178,116,0);}}
@keyframes rvintroFadeUp{ from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:translateY(0);} }

.rvintro-main-grid{ flex:1; display:grid; grid-template-columns:1.2fr 0.95fr; gap:clamp(24px,4vw,56px); align-items:center; padding:clamp(20px,3vh,36px) 0; }
@media (max-width:760px){ .rvintro-main-grid{grid-template-columns:1fr;} }

.rvintro-left-info{ opacity:0; animation:rvintroFadeUp 0.8s ease forwards 0.2s; text-align:left; }
.rvintro-eyebrow{ display:inline-flex; align-items:center; gap:8px; font-size:11.5px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--sky); }
.rvintro-eyebrow::before{ content:''; width:16px; height:2px; border-radius:2px; background:var(--azure); }
.rvintro-left-info h1{ margin-top:16px; font-size:clamp(30px,4.6vw,50px); font-weight:700; letter-spacing:-0.02em; line-height:1.08; max-width:14ch; }
.rvintro-left-info h1 span{ background:linear-gradient(100deg, var(--royal), var(--azure) 60%, var(--sky)); -webkit-background-clip:text; background-clip:text; color:transparent; }
.rvintro-lede{ margin-top:16px; font-size:clamp(14.5px,1.4vw,16.5px); color:var(--slate); line-height:1.65; max-width:46ch; }
.rvintro-lede b{color:#fff;}

.rvintro-adv-list{ margin-top:28px; display:flex; flex-direction:column; gap:12px; max-width:440px; }
.rvintro-adv-item{
  display:flex; align-items:flex-start; gap:12px; text-align:left;
  background:rgba(255,255,255,0.055); border:1px solid rgba(255,255,255,0.12); border-radius:14px;
  padding:13px 15px; transition:transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}
.rvintro-adv-item:hover{ transform:translateX(4px); border-color:rgba(111,168,255,0.4); background:rgba(111,168,255,0.1); }
.rvintro-ico{ width:32px; height:32px; flex-shrink:0; border-radius:9px; background:linear-gradient(155deg, #DCE9FB, #9FC4FF); display:flex; align-items:center; justify-content:center; color:var(--royal); }
.rvintro-adv-item h3{ font-size:13.5px; font-weight:700; }
.rvintro-adv-item p{ font-size:12px; color:var(--slate); margin-top:2px; line-height:1.5; }

.rvintro-robot-col{ display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0; animation:rvintroFadeUp 0.8s ease forwards 0.35s; }
.rvintro-robot-panel{
  position:relative; width:100%; max-width:340px; min-height:340px;
  background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); border-radius:26px; overflow:hidden;
  box-shadow:0 30px 60px -22px rgba(0,0,0,0.55);
  display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 24px 30px;
}
.rvintro-panel-chrome{ position:absolute; top:14px; left:16px; display:flex; gap:6px; }
.rvintro-panel-chrome span{ width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.18); }
.rvintro-panel-label{ position:absolute; top:14px; right:16px; font-size:10px; font-weight:600; letter-spacing:0.1em; color:rgba(220,233,251,0.55); }

.rvintro-robot{ width:118px; height:138px; position:relative; animation:rvintroRobotFloat 3.4s ease-in-out infinite; }
@keyframes rvintroRobotFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-12px);}}
.rvintro-robot-antenna{ position:absolute; top:-16px; left:50%; transform:translateX(-50%); width:3px; height:18px; background:var(--sky); }
.rvintro-robot-antenna::after{ content:''; position:absolute; top:-7px; left:50%; transform:translateX(-50%); width:10px; height:10px; border-radius:50%; background:var(--mint); box-shadow:0 0 12px var(--mint); }
.rvintro-robot-head{ width:90px; height:64px; margin:20px auto 0; border-radius:22px; background:linear-gradient(155deg, #E7EFFC, #BFDAFF); position:relative; box-shadow:0 14px 28px -10px rgba(3,10,25,0.5); }
.rvintro-robot-face{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:14px; transition:gap 0.3s ease; }
.rvintro-robot-eye{ width:12px; height:16px; border-radius:6px; background:var(--navy-900); transition:all 0.3s ease; }
.rvintro-robot-mouth{
  position:absolute; bottom:10px; left:50%; transform:translateX(-50%);
  width:14px; height:2px; border-radius:2px; background:var(--navy-900);
  opacity:0.85; transition:all 0.3s ease;
}
.rvintro-robot-blush{
  position:absolute; bottom:16px; width:9px; height:6px; border-radius:50%;
  background:#FF9AA6; opacity:0; transition:opacity 0.3s ease;
}
.rvintro-robot-blush-l{ left:10px; }
.rvintro-robot-blush-r{ right:10px; }
.rvintro-robot-body{ width:102px; height:50px; margin:6px auto 0; border-radius:18px; background:linear-gradient(155deg, #DCE9FB, #9FC4FF); display:flex; align-items:center; justify-content:center; }
.rvintro-robot-chest{ width:34px; height:34px; border-radius:50%; background:rgba(30,79,216,0.16); border:2px solid var(--royal); display:flex; align-items:center; justify-content:center; }
.rvintro-robot-chest span{ width:14px; height:14px; border-radius:50%; background:var(--mint); box-shadow:0 0 10px var(--mint); animation:rvintroChestPulse 1.8s ease-in-out infinite; }
@keyframes rvintroChestPulse{0%,100%{transform:scale(1); opacity:1;}50%{transform:scale(1.25); opacity:0.7;}}

/* ---- Emotion states ---- */

/* happy — smiling eyes, curved grin, rosy cheeks */
.rvintro-emotion-happy .rvintro-robot-eye{ height:6px; border-radius:6px 6px 3px 3px; transform:translateY(3px); }
.rvintro-emotion-happy .rvintro-robot-mouth{
  width:22px; height:11px; border-radius:0 0 16px 16px; background:transparent;
  border:2px solid var(--navy-900); border-top:none;
}
.rvintro-emotion-happy .rvintro-robot-blush{ opacity:0.9; }
.rvintro-emotion-happy .rvintro-robot-antenna::after{ background:var(--mint); box-shadow:0 0 14px var(--mint); }

/* alert — wide eyes, small o-mouth, amber antenna blink, tiny head shake */
.rvintro-emotion-alert .rvintro-robot-eye{ height:19px; width:10px; border-radius:5px; }
.rvintro-emotion-alert .rvintro-robot-mouth{
  width:9px; height:9px; border-radius:50%; background:transparent; border:2px solid var(--navy-900);
}
.rvintro-emotion-alert .rvintro-robot-head{ animation:rvintroShake 0.5s ease-in-out; }
.rvintro-emotion-alert .rvintro-robot-antenna::after{
  background:#FFB020; box-shadow:0 0 14px #FFB020; animation:rvintroAlertBlink 0.55s ease-in-out infinite;
}
@keyframes rvintroShake{ 0%,100%{transform:translateX(0);} 25%{transform:translateX(-2.5px);} 75%{transform:translateX(2.5px);} }
@keyframes rvintroAlertBlink{ 0%,100%{opacity:1;} 50%{opacity:0.35;} }

/* calm — neutral flat gaze, relaxed slow float */
.rvintro-emotion-calm .rvintro-robot-eye{ height:14px; }
.rvintro-emotion-calm .rvintro-robot-mouth{ width:12px; height:2px; }
.rvintro-emotion-calm.rvintro-robot{ animation-duration:4.4s; }

/* excited — wide sparkly eyes, big grin, faster bounce + pulse */
.rvintro-emotion-excited .rvintro-robot-eye{ height:17px; border-radius:8px; box-shadow:0 0 6px rgba(111,168,255,0.8); }
.rvintro-emotion-excited .rvintro-robot-mouth{
  width:26px; height:13px; border-radius:0 0 18px 18px; background:transparent;
  border:2.5px solid var(--navy-900); border-top:none;
}
.rvintro-emotion-excited .rvintro-robot-blush{ opacity:0.9; }
.rvintro-emotion-excited.rvintro-robot{ animation-duration:1.7s; }
.rvintro-emotion-excited .rvintro-robot-chest span{ animation-duration:0.8s; }
.rvintro-emotion-excited .rvintro-robot-antenna::after{ animation:rvintroChestPulse 0.7s ease-in-out infinite; }

.rvintro-robot-message{
  margin-top:22px; background:rgba(255,255,255,0.08); border:1px solid rgba(111,168,255,0.3);
  border-radius:14px; padding:11px 16px; max-width:230px; text-align:center;
  font-size:13px; font-weight:600; line-height:1.4; color:#fff;
  opacity:0; transform:translateY(8px) scale(0.94); transition:opacity 0.35s ease, transform 0.35s ease;
}
.rvintro-robot-message.show{ opacity:1; transform:translateY(0) scale(1); }
.rvintro-panel-caption{ margin-top:16px; font-size:12.5px; color:var(--slate); text-align:center; }

.rvintro-bottom-cta{
  position:relative; z-index:2; padding:20px 20px clamp(28px,4vh,44px);
  display:flex; flex-direction:column; align-items:center; gap:12px;
  opacity:0; animation:rvintroFadeUp 0.8s ease forwards 0.5s;
}
.rvintro-robot-cta{
  position:relative; z-index:2; margin-top:18px;
  display:flex; flex-direction:column; align-items:center; gap:10px;
  opacity:0; animation:rvintroFadeUp 0.8s ease forwards 0.5s;
}
.rvintro-cta{
  appearance:none; border:none; cursor:pointer;
  background:linear-gradient(135deg, var(--royal), var(--navy-900)); background-size:180% 180%;
  color:#fff; font-weight:700; font-size:15px; padding:15px 32px; border-radius:100px;
  display:inline-flex; align-items:center; gap:9px; box-shadow:0 16px 30px -12px rgba(30,79,216,0.5);
  transition:transform 0.2s cubic-bezier(.2,.8,.3,1), box-shadow 0.2s ease, background-position 0.5s ease;
}
.rvintro-cta:hover{ transform:translateY(-3px) scale(1.02); box-shadow:0 22px 38px -12px rgba(30,79,216,0.55); background-position:100% 50%; }
.rvintro-skip{ font-size:13px; color:var(--slate); text-decoration:underline; text-underline-offset:3px; background:none; border:none; cursor:pointer; }
.rvintro-skip:hover{color:#fff;}
`;