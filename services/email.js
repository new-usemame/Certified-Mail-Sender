const { Resend } = require('resend');

const FROM_ADDRESS = 'Certified Mail Sender <onboarding@resend.dev>';

let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

async function sendCustomerEmail({ to, trackingNumber, recipientName, recipientAddress, returnReceipt, orderToken }) {
  const rrLine = returnReceipt
    ? 'Electronic Return Receipt: Included (you will be notified upon delivery)\n'
    : '';

  const trackingPageUrl = `${process.env.BASE_URL}/order/${orderToken}`;

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Your Certified Mail is on its way — Tracking #${trackingNumber || 'pending'}`,
    text: [
      'Your certified letter has been submitted for printing and mailing via USPS.',
      '',
      `Tracking Number: ${trackingNumber || 'Will be assigned shortly'}`,
      `Recipient: ${recipientName}`,
      `Address: ${recipientAddress}`,
      rrLine,
      'You can track your letter at:',
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber || ''}`,
      '',
      'Track your letter\'s progress anytime:',
      trackingPageUrl,
      '',
      '— Certified Mail Sender',
    ].join('\n'),
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
