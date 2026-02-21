const SCM_BASE = 'https://api.simplecertifiedmail.com/RESTv4.0';

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const params = new URLSearchParams({
    grant_type: 'password',
    username: process.env.SCM_USERNAME,
    password: process.env.SCM_PASSWORD,
    PartnerKey: process.env.SCM_PARTNER_KEY,
    ClientCode: process.env.SCM_CLIENT_CODE,
  });

  const res = await fetch(`${SCM_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SCM token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Refresh 1 hour before expiry (tokens valid ~24h)
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  return cachedToken;
}

/**
 * Queue a print item for certified mailing via SimpleCertifiedMail.
 * Accepts a base64-encoded PDF, sender/recipient info, and options.
 * Returns { StatusCode, StatusMessage, QueueID }.
 */
async function queuePrintItem({
  senderName,
  senderStreet,
  senderCity,
  senderState,
  senderZip,
  senderEmail,
  recipientName,
  recipientStreet,
  recipientCity,
  recipientState,
  recipientZip,
  pdfBase64,
  pageCount,
  returnReceipt,
  reference,
}) {
  const token = await getAccessToken();

  const body = {
    GroupName: process.env.SCM_GROUP_NAME || 'default',
    Mode: process.env.NODE_ENV === 'production' ? 1 : 0,
    TemplateName: reference || 'CertifiedMailSender',
    FromName: senderName,
    FromAddress1: senderStreet,
    FromCity: senderCity,
    FromState: senderState,
    FromZip: senderZip.substring(0, 5),
    FromZip4: senderZip.length > 5 ? senderZip.replace('-', '').substring(5, 9) : '',
    FromEmail: senderEmail || '',
    ToName: recipientName,
    ToAddress1: recipientStreet,
    ToCity: recipientCity,
    ToState: recipientState,
    ToZip: recipientZip.substring(0, 5),
    ToZip4: recipientZip.length > 5 ? recipientZip.replace('-', '').substring(5, 9) : '',
    ToReference: reference || '',
    RequestCertified: true,
    TrackERR: !!returnReceipt,
    DateAdvance: 0,
    Document: pdfBase64,
    PageCount: pageCount || 1,
    PODRecipientList: senderEmail || '',
  };

  const res = await fetch(`${SCM_BASE}/api/scm/queueprintitem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SCM queuePrintItem failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (data.StatusCode !== 1) {
    throw new Error(`SCM error ${data.StatusCode}: ${data.StatusMessage}`);
  }

  return data;
}

/**
 * Get tracking status for a document by its QueueID.
 */
async function getDocumentStatus(queueId) {
  const token = await getAccessToken();

  const res = await fetch(`${SCM_BASE}/api/scm/getdocumentstatusbydocid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ID: String(queueId),
      GroupName: process.env.SCM_GROUP_NAME || 'default',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SCM getDocumentStatus failed (${res.status}): ${text}`);
  }

  return res.json();
}

module.exports = { queuePrintItem, getDocumentStatus };
