export const COLORS = {
  navy: "#0E2A52",
  navy2: "#153865",
  ink: "#0F1B33",
  muted: "#5E6B85",
  bg: "#F4F7FD",
  card: "#FFFFFF",
  line: "#E3E9F6",
  orange: "#2F6FED",
  orangeDark: "#1E54C4",
  green: "#2F9E6E",
  amber: "#D99A2B",
  red: "#D9534F",
  blue: "#0EA5E9",
  violet: "#7C6FED",
};

export const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

export const DEPARTMENTS = [
  "Human Resources", "Engineering", "Design", "Sales", "Marketing", "Operations", "Finance",
];

export const GRACE_MIN = 15;
export const HALFDAY_HOURS = 4.5;

// Options for Monthly Report's per-row "Status-Edit" dropdown. Value ""
// means "Auto" — clears any manual override so computeStatus() goes back
// to calculating the status from check-in/check-out times.
export const MANUAL_STATUS_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "half", label: "Half Day" },
  { value: "wfh", label: "WFH" },
  { value: "short_leave", label: "Short Leave" },
  { value: "leave", label: "Leave" },
  { value: "extra_day", label: "Extra Day" },
  { value: "holiday", label: "Holiday" },
  { value: "absent", label: "Absent" },
];

export const HR_NOTIFY_EMAIL = "hr@rankviz.com";

// Employee login uses "Sign in with Google", restricted to this domain.
// The client ID is public/safe to expose (it identifies the app to Google,
// it isn't a secret) — get it from Google Cloud Console > APIs & Services >
// Credentials > OAuth 2.0 Client IDs (Web application).
export const GOOGLE_CLIENT_ID = "PASTE_YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com";
export const COMPANY_EMAIL_DOMAIN = "rankviz.com";

// Fill these in after running supabase_schema.sql in your Supabase project
export const SUPABASE_URL = "https://btwvmupsezhqzidkzxun.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_r7dRsMhjZKsI-J3dVzNmlw_g2toBWUT";
export const SUPABASE_CONFIGURED =
  !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR-ANON");