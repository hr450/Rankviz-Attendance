export async function notifyHR({ subject, lines }) {
  try {
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, lines }),
    });
  } catch {
    // Non-blocking — attendance already saved to Supabase even if the email fails.
  }
}
