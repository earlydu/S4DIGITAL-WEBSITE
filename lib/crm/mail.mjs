// Outbound email for the CRM. Currently one message: the password reset.
//
// Resend is the provider, because the TUK site already uses it, so there is an
// account and a verified domain rather than a new dependency. Set:
//
//   RESEND_API_KEY=re_...
//   CRM_FROM_EMAIL="s4digital <sales@s4digi.com>"   (must be a verified sender)
//
// With no key the reset endpoint says so plainly instead of pretending a mail
// went out, because a reset flow that silently does nothing is worse than one
// that is honestly switched off.

export const mailReady = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.CRM_FROM_EMAIL);

export async function sendMail({ to, subject, text, html }) {
  if (!mailReady()) {
    throw new Error(
      'Email is not configured on the server. Set RESEND_API_KEY and CRM_FROM_EMAIL, ' +
      'or reset the password from the command line with "node tools/crm.mjs set-password".'
    );
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.CRM_FROM_EMAIL,
      to: [to],
      subject,
      text,
      html: html || undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Could not send the email (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

/** The reset email. Plain, short, and it says how long the link lasts. */
export const resetEmail = ({ name, link, minutes }) => ({
  subject: 'Reset your s4digital sales password',
  text: [
    `Hi ${name || 'there'},`,
    '',
    'Someone asked to reset the password on your s4digital sales account.',
    'If that was you, open this link:',
    '',
    link,
    '',
    `It stops working in ${minutes} minutes, and it can only be used once.`,
    '',
    'If it was not you, ignore this. Nothing has changed and your current',
    'password still works.',
  ].join('\n'),
  html: `
    <div style="font-family:-apple-system,Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#0d0d0f">
      <p>Hi ${name || 'there'},</p>
      <p>Someone asked to reset the password on your s4digital sales account.
         If that was you, use the button below.</p>
      <p style="margin:28px 0">
        <a href="${link}" style="background:#0d0d0f;color:#fff;padding:13px 24px;border-radius:999px;
           text-decoration:none;font-weight:700;display:inline-block">Set a new password</a>
      </p>
      <p style="color:#71727c;font-size:13.5px">
        It stops working in ${minutes} minutes and can only be used once.<br>
        If it was not you, ignore this. Nothing has changed.
      </p>
    </div>`,
});
