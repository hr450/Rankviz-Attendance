// api/attendance/punch.js
//
// Lets an employee (or the Today tab's quick actions) check in / check out
// directly from the web app — but ONLY for office actions, and ONLY when
// the request is coming from the office network's IP address.
//
// IMPORTANT: IP must be checked server-side. A browser can report anything
// it wants as "its own IP" — that's spoofable — so this never trusts the
// client. It reads the actual source IP Vercel attaches to the incoming
// request (x-forwarded-for) and compares it against an allowlist you set
// as an environment variable.
//
// Env var (Vercel project settings -> Environment Variables):
//   OFFICE_IPS = "203.0.113.42"                     // single IP
//   OFFICE_IPS = "203.0.113.42,198.51.100.10"        // multiple IPs (multiple lines/routers)
//   OFFICE_IPS = "203.0.113.0/24"                    // CIDR range also supported
// Comma-separate to mix any of the above.
//
// Actions and whether they require the office IP:
//   in, out, second_in, second_out   -> IP CHECKED (must be on office network)
//   wfh_in, wfh_out, leave, alternate -> IP NOT checked (location-agnostic by design)
//
// Body (JSON):
//   { employee_id: "emp_123", action: "in" | "out" | "wfh_in" | "wfh_out" |
//     "second_in" | "second_out" | "leave" | "alternate",
//     meta?: { reason, location } }   // meta only used for wfh_in
//
// Returns the updated attendance fields (camelCase, same shape the app
// already keeps in its `attendance` state) so the client doesn't need a
// second round-trip to refresh.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OFFICE_IPS = process.env.OFFICE_IPS || "";

const OFFICE_ONLY_ACTIONS = new Set(["in", "out", "second_in", "second_out"]);
const ALL_ACTIONS = new Set([
  "in", "out", "wfh_in", "wfh_out", "second_in", "second_out", "leave", "alternate",
]);

function getSupabaseBaseUrl() {
  let base = (SUPABASE_URL || "").trim();
  base = base.replace(/\/+$/, "");
  base = base.replace(/\/rest\/v1$/i, "");
  base = base.replace(/\/+$/, "");
  return base;
}

async function supabaseFetch(path, options = {}) {
  const base = getSupabaseBaseUrl();
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path} failed: ${res.status} ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/* ---------------- IP extraction & matching ---------------- */

function getClientIp(req) {
  // Vercel sets x-forwarded-for as "client, proxy1, proxy2, ..." — the
  // first entry is the original client.
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = (Array.isArray(xff) ? xff[0] : xff).split(",")[0].trim();
    if (first) return first;
  }
  // Fallbacks for local/dev environments.
  return req.socket?.remoteAddress || req.connection?.remoteAddress || "";
}

// Strips a "::ffff:" IPv4-mapped-IPv6 prefix so "::ffff:203.0.113.42"
// compares equal to "203.0.113.42".
function normalizeIp(ip) {
  return (ip || "").trim().replace(/^::ffff:/i, "");
}

function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipMatchesEntry(ip, entry) {
  entry = entry.trim();
  if (!entry) return false;
  if (entry.includes("/")) {
    // CIDR range, e.g. 203.0.113.0/24
    const [range, bitsStr] = entry.split("/");
    const bits = Number(bitsStr);
    const ipInt = ipToInt(ip);
    const rangeInt = ipToInt(range);
    if (ipInt === null || rangeInt === null || Number.isNaN(bits)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  }
  return normalizeIp(ip) === normalizeIp(entry);
}

function isOfficeIp(ip) {
  const allowed = OFFICE_IPS.split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0) return false; // fail closed if not configured
  const clean = normalizeIp(ip);
  return allowed.some(entry => ipMatchesEntry(clean, entry));
}

/* ---------------- attendance row helpers ---------------- */

function todayStr() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rowToRec(r) {
  if (!r) return {};
  return {
    checkIn: r.check_in, checkOut: r.check_out, type: r.type,
    wfhCheckIn: r.wfh_check_in, wfhCheckOut: r.wfh_check_out,
    secondCheckIn: r.second_check_in, secondCheckOut: r.second_check_out,
    alternateDay: !!r.alternate_day, leaveReason: r.leave_reason || "",
  };
}

async function getRow(employeeId, date) {
  const rows = await supabaseFetch(
    `attendance?employee_id=eq.${encodeURIComponent(employeeId)}&date=eq.${date}&select=*`
  );
  return rows && rows[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server not configured (missing Supabase env vars)" });
    return;
  }

  const { employee_id, action, meta } = req.body || {};
  if (!employee_id) { res.status(400).json({ error: "employee_id is required" }); return; }
  if (!ALL_ACTIONS.has(action)) { res.status(400).json({ error: `Unknown action "${action}"` }); return; }

  // --- IP check, only for physical office actions ---
  if (OFFICE_ONLY_ACTIONS.has(action)) {
    const ip = getClientIp(req);
    if (!isOfficeIp(ip)) {
      res.status(403).json({
        error: "You must be connected to the office network to check in/out. This action isn't restricted for WFH.",
        code: "OFFICE_IP_REQUIRED",
      });
      return;
    }
  }

  try {
    const date = todayStr();
    const existing = await getRow(employee_id, date);
    const existingRec = rowToRec(existing);
    const nowIso = new Date().toISOString();

    const payload = { employee_id, date, source: "web" };

    switch (action) {
      case "in":
        payload.check_in = nowIso;
        payload.type = existingRec.type === "leave" ? "office" : (existingRec.type || "office");
        break;
      case "out":
        payload.check_out = nowIso;
        break;
      case "wfh_in":
        payload.wfh_check_in = nowIso;
        payload.type = "wfh";
        if (meta?.reason) payload.leave_reason = meta.reason;
        break;
      case "wfh_out":
        payload.wfh_check_out = nowIso;
        break;
      case "second_in":
        payload.second_check_in = nowIso;
        break;
      case "second_out":
        payload.second_check_out = nowIso;
        break;
      case "leave":
        payload.type = "leave";
        payload.check_in = null; payload.check_out = null;
        payload.wfh_check_in = null; payload.wfh_check_out = null;
        payload.second_check_in = null; payload.second_check_out = null;
        break;
      case "alternate":
        payload.alternate_day = true;
        break;
    }

    // A manual HR edit takes precedence — a web punch should never quietly
    // overwrite a row HR already corrected by hand (mirrors the same rule
    // cdata.js follows for device punches).
    if (existing?.manually_edited && (action === "in" || action === "out" || action === "second_in" || action === "second_out")) {
      res.status(409).json({
        error: "This day's record was manually corrected by HR and can't be overwritten by a punch. Ask HR to update it if this is wrong.",
        code: "MANUALLY_EDITED_LOCKED",
      });
      return;
    }

    let result;
    if (existing) {
      result = await supabaseFetch(
        `attendance?employee_id=eq.${encodeURIComponent(employee_id)}&date=eq.${date}`,
        { method: "PATCH", body: JSON.stringify(payload) }
      );
    } else {
      result = await supabaseFetch("attendance", { method: "POST", body: JSON.stringify([payload]) });
    }

    const savedRow = Array.isArray(result) ? result[0] : result;
    res.status(200).json({ success: true, record: rowToRec(savedRow || payload) });
  } catch (err) {
    console.error("attendance punch error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
