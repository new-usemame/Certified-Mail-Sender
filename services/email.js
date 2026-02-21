const { Resend } = require('resend');

const FROM_ADDRESS = process.env.FROM_EMAIL || 'Certified Mail Sender <onboarding@resend.dev>';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function buildCustomerHtml({ trackingNumber, recipientName, recipientAddress, returnReceipt, orderToken }) {
  const trackingPageUrl = `${process.env.BASE_URL}/order/${encodeURIComponent(orderToken)}`;
  const safeTrackingNumber = escapeHtml(trackingNumber);
  const safeRecipientName = escapeHtml(recipientName);
  const safeRecipientAddress = escapeHtml(recipientAddress);
  const uspsUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber || '')}`;
  const service = returnReceipt ? 'USPS Certified Mail + Return Receipt' : 'USPS Certified Mail';

  const rrSection = returnReceipt
    ? `<tr><td style="padding:12px 0;border-bottom:1px solid #e0ddd8">
        <span style="font-family:'Courier Prime',Courier,monospace;font-size:11px;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:.04em">Return Receipt</span><br>
        <span style="font-size:14px;color:#2C2C2C">Included &mdash; recipient signs upon delivery. PDF posted within 24 hours.</span>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C2C2C">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7"><tr><td align="center" style="padding:24px 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

<!-- Postal stripe -->
<tr><td style="height:4px;background:linear-gradient(to bottom,#CC0000 50%,#333366 50%)"></td></tr>

<!-- Header -->
<tr><td style="background:#1B2A4A;padding:20px 24px;text-align:center">
  <span style="font-family:'Courier Prime',Courier,monospace;font-size:20px;font-weight:700;color:#fff;letter-spacing:.04em">CERTIFIED MAIL SENDER</span><br>
  <span style="font-family:'Courier Prime',Courier,monospace;font-size:11px;color:rgba(255,255,255,.7);letter-spacing:.06em">OFFICIAL USPS CERTIFIED MAIL SERVICE</span>
</td></tr>

<!-- Confirmed banner -->
<tr><td style="background:#fff;padding:28px 24px;text-align:center;border-bottom:2px solid #2d6a4f">
  <span style="font-size:28px;color:#2d6a4f">&#10003;</span><br>
  <span style="font-family:'Courier Prime',Courier,monospace;font-size:18px;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:.04em">Order Confirmed</span><br>
  <span style="font-size:14px;color:#706A65;margin-top:4px;display:inline-block">Your certified letter has been submitted to USPS for delivery.</span>
</td></tr>

<!-- Tracking number -->
<tr><td style="background:#fff;padding:24px;text-align:center">
  <span style="font-family:'Courier Prime',Courier,monospace;font-size:11px;font-weight:700;color:#706A65;text-transform:uppercase;letter-spacing:.06em">USPS TRACKING NUMBER</span><br>
  <span style="font-family:'Courier Prime',Courier,monospace;font-size:20px;font-weight:700;color:#1B2A4A;display:inline-block;margin:8px 0;letter-spacing:.02em">${safeTrackingNumber || 'Assigning...'}</span><br>
  ${trackingNumber ? `<a href="${uspsUrl}" style="display:inline-block;margin-top:8px;padding:10px 24px;background:#333366;color:#fff;font-family:'Courier Prime',Courier,monospace;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;text-decoration:none;border-radius:0">Track on USPS.com</a>` : ''}
</td></tr>

<!-- Order details -->
<tr><td style="background:#fff;padding:0 24px 24px">
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1B2A4A">
  <tr><td style="padding:12px;border-bottom:1px solid #e0ddd8">
    <span style="font-family:'Courier Prime',Courier,monospace;font-size:11px;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:.04em">Recipient</span><br>
    <span style="font-size:14px;color:#2C2C2C">${safeRecipientName}</span><br>
    <span style="font-size:13px;color:#706A65">${safeRecipientAddress}</span>
  </td></tr>
  <tr><td style="padding:12px;border-bottom:1px solid #e0ddd8">
    <span style="font-family:'Courier Prime',Courier,monospace;font-size:11px;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:.04em">Service</span><br>
    <span style="font-size:14px;color:#2C2C2C">${service}</span>
  </td></tr>
  ${rrSection}
</table>
</td></tr>

<!-- What to expect -->
<tr><td style="background:#fff;padding:0 24px 24px">
<table width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed #1B2A4A;padding:16px">
  <tr><td style="padding:16px">
    <span style="font-family:'Courier Prime',Courier,monospace;font-size:13px;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:.04em">What To Expect</span>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
      <tr><td style="padding:6px 0;font-size:13px;color:#2C2C2C"><strong>Proof of Acceptance</strong> &mdash; Official PDF posted within hours of USPS acceptance</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#2C2C2C"><strong>Proof of Delivery</strong> &mdash; Official PDF posted within hours of delivery</td></tr>
      ${returnReceipt ? '<tr><td style="padding:6px 0;font-size:13px;color:#2C2C2C"><strong>Return Receipt</strong> &mdash; Signed PDF posted within 24 hours of delivery</td></tr>' : ''}
      <tr><td style="padding:6px 0;font-size:13px;color:#706A65">All documents are stored for 10 years and downloadable from your tracking page.</td></tr>
    </table>
  </td></tr>
</table>
</td></tr>

<!-- View order CTA -->
<tr><td style="background:#fff;padding:0 24px 28px;text-align:center">
  <a href="${trackingPageUrl}" style="display:inline-block;padding:12px 32px;background:#1B2A4A;color:#fff;font-family:'Courier Prime',Courier,monospace;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;text-decoration:none;border:2px solid #1B2A4A">View Your Order</a>
  <br><span style="font-size:12px;color:#706A65;margin-top:8px;display:inline-block">Bookmark your tracking page to check status anytime</span>
</td></tr>

<!-- Footer -->
<tr><td style="background:#1B2A4A;padding:20px 24px;text-align:center">
  <span style="font-family:'Courier Prime',Courier,monospace;font-size:12px;color:rgba(255,255,255,.7)">Certified Mail Sender &mdash; Official USPS Certified Mail Service</span><br>
  <span style="font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;display:inline-block">Questions? Reply to this email or visit our contact page.</span>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

async function sendCustomerEmail({ to, trackingNumber, recipientName, recipientAddress, returnReceipt, orderToken }) {
  const trackingPageUrl = `${process.env.BASE_URL}/order/${orderToken}`;

  const html = buildCustomerHtml({ trackingNumber, recipientName, recipientAddress, returnReceipt, orderToken });

  const rrLine = returnReceipt
    ? 'Electronic Return Receipt: Included (recipient signs upon delivery, PDF posted within 24 hours)\n'
    : '';

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Your Certified Mail is on its way — Tracking #${trackingNumber || 'pending'}`,
    html,
    text: [
      'Your certified letter has been submitted for printing and mailing via USPS.',
      '',
      `Tracking Number: ${trackingNumber || 'Will be assigned shortly'}`,
      `Recipient: ${recipientName}`,
      `Address: ${recipientAddress}`,
      rrLine,
      'Track on USPS.com:',
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber || ''}`,
      '',
      'View your order and download proof documents:',
      trackingPageUrl,
      '',
      'What to expect:',
      '- Proof of Acceptance: Official PDF posted within hours of USPS acceptance',
      '- Proof of Delivery: Official PDF posted within hours of delivery',
      returnReceipt ? '- Return Receipt: Signed PDF posted within 24 hours of delivery' : '',
      '- All documents stored for 10 years',
      '',
      '— Certified Mail Sender',
    ].filter(Boolean).join('\n'),
  });
}

async function sendOwnerEmail({ customerEmail, trackingNumber, senderName, recipientName, recipientAddress, amountCents, orderId, returnReceipt }) {
  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: process.env.OWNER_EMAIL,
    subject: `New order #${orderId} — ${recipientName}`,
    text: [
      `New certified mail order received.`,
      '',
      `Order ID: ${orderId}`,
      `Customer Email: ${customerEmail}`,
      `Sender: ${senderName}`,
      `Recipient: ${recipientName}`,
      `Recipient Address: ${recipientAddress}`,
      `Return Receipt: ${returnReceipt ? 'Yes' : 'No'}`,
      `Amount: $${(amountCents / 100).toFixed(2)}`,
      `Tracking: ${trackingNumber || 'pending'}`,
      '',
      '— Certified Mail Sender',
    ].join('\n'),
  });
}

async function sendFailureAlert({ orderId, error }) {
  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: process.env.OWNER_EMAIL,
    subject: `ALERT: Order #${orderId} — mail send failed`,
    text: [
      `Order #${orderId} failed to send via SimpleCertifiedMail.`,
      '',
      `Error: ${error}`,
      '',
      'Please retry manually or issue a refund via Stripe.',
      '',
      '— Certified Mail Sender',
    ].join('\n'),
  });
}

async function sendCustomerFailureEmail({ to, orderToken }) {
  const trackingPageUrl = `${process.env.BASE_URL}/order/${orderToken}`;

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: 'Update on your certified mail order',
    text: [
      'We encountered an issue processing your certified letter.',
      '',
      'Our team has been notified and will reach out to you within 24 hours to resolve this. No action is needed on your part.',
      '',
      'You can check the status of your order anytime:',
      trackingPageUrl,
      '',
      'We apologize for the inconvenience.',
      '',
      '— Certified Mail Sender',
    ].join('\n'),
  });
}

async function sendContactEmail({ name, email, subject, message }) {
  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: process.env.OWNER_EMAIL,
    replyTo: email,
    subject: `Contact Form: ${subject}`,
    text: [
      `New message from the contact form.`,
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      `Subject: ${subject}`,
      '',
      `Message:`,
      message,
      '',
      '— Certified Mail Sender Contact Form',
    ].join('\n'),
  });
}

module.exports = { sendCustomerEmail, sendOwnerEmail, sendFailureAlert, sendCustomerFailureEmail, sendContactEmail };
