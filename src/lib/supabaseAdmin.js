// SERVER-ONLY. Never import this file from anything that ships to the browser.
// Uses SUPABASE_SERVICE_ROLE_KEY, which bypasses Row Level Security — that's
// exactly why it must only ever run on Vercel, never in client JS.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  // Fail loudly at boot rather than silently sending unauthenticated requests.
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars are missing on the server.");
}

export async function supaAdminFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}
