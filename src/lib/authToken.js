// SERVER-ONLY. Small signed-token helper so API routes can check "is this
// caller actually a logged-in admin" without pulling in a full auth library.
// Uses Node's built-in crypto — no extra dependency needed.

import crypto from "crypto";

const SECRET = process.env.AUTH_TOKEN_SECRET;
if (!SECRET) {
  throw new Error("AUTH_TOKEN_SECRET env var is missing on the server.");
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// token = base64(payloadJSON) + "." + base64(hmac-signature)
export function signToken(payload, ttlMs = ONE_DAY_MS) {
  const body = { ...payload, exp: Date.now() + ttlMs };
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  if (payload.exp < Date.now()) return null; // expired
  return payload; // { userId, role, ... }
}

// Pulls the token out of an Authorization: Bearer <token> header and checks
// the caller has one of the allowed roles. Returns the decoded payload, or
// null if missing/invalid/insufficient — callers should 401 on null.
export function requireRole(req, allowedRoles) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  if (allowedRoles && !allowedRoles.includes(payload.role)) return null;
  return payload;
}
