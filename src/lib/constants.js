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

export const HR_NOTIFY_EMAIL = "hr@rankviz.com";

// Fill these in after running supabase_schema.sql in your Supabase project
export const SUPABASE_URL = "https://btwvmupsezhqzidkzxun.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_r7dRsMhjZKsI-J3dVzNmlw_g2toBWUT";
export const SUPABASE_CONFIGURED =
  !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR-ANON");
