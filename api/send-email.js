import nodemailer from "nodemailer";

const HR_EMAIL = "hr@rankviz.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  // If SMTP isn't configured, fail silently — attendance already saved to
  // Supabase regardless of whether the email goes out.
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    res.status(200).json({ skipped: true, reason: "SMTP not configured" });
    return;
  }

  try {
    const { subject, lines } = req.body || {};
    if (!subject) {
      res.status(400).json({ error: "Missing subject" });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const text = Array.isArray(lines) ? lines.join("\n") : "";
    const html = Array.isArray(lines)
      ? `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;">${lines
          .map((l) => `<div>${l}</div>`)
          .join("")}</div>`
      : "";

    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: HR_EMAIL,
      subject,
      text,
      html,
    });

    res.status(200).json({ sent: true });
  } catch (err) {
    // Never block the attendance flow on an email failure.
    res.status(200).json({ sent: false, error: err.message });
  }
}
