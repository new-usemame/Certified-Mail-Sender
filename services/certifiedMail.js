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
  senderStreet2,
  senderCity,
  senderState,
  senderZip,
  senderEmail,
  recipientName,
  recipientStreet,
  recipientStreet2,
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
    FromAddress2: senderStreet2 || '',
    FromCity: senderCity,
    FromState: senderState,
    FromZip: senderZip.substring(0, 5),
    FromZip4: senderZip.length > 5 ? senderZip.replace('-', '').substring(5, 9) : '',
    FromEmail: senderEmail || '',
    ToName: recipientName,
    ToAddress1: recipientStreet,
    ToAddress2: recipientStreet2 || '',
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
 * Returns the full SCM response including proof document fields.
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

/**
 * Extract proof document availability metadata from an SCM status response.
 */
function parseProofAvailability(scmData) {
  return {
    acceptanceDocAvailable: scmData.AcceptanceDoc ? 1 : 0,
    deliveryDocAvailable: scmData.DeliveryDoc ? 1 : 0,
    signatureDocAvailable: scmData.SignatureDoc ? 1 : 0,
    acceptedDate: scmData.AcceptedDate || null,
    deliveryDate: scmData.DeliveryDate || null,
    signatureName: scmData.SignatureName || null,
  };
}

const PROOF_TYPE_FIELDS = {
  acceptance: 'AcceptanceDoc',
  delivery: 'DeliveryDoc',
  signature: 'SignatureDoc',
};

/**
 * Fetch a specific proof document PDF (base64) from SCM.
 * Returns { base64, filename } or null if not yet available.
 */
async function getProofDocument(queueId, proofType) {
  const field = PROOF_TYPE_FIELDS[proofType];
  if (!field) throw new Error(`Invalid proof type: ${proofType}`);

  const data = await getDocumentStatus(queueId);
  const base64 = data[field];

  if (!base64) return null;

  const names = {
    acceptance: 'Proof-of-Acceptance',
    delivery: 'Proof-of-Delivery',
    signature: 'Return-Receipt',
  };

  return {
    base64,
    filename: `${names[proofType]}-${queueId}.pdf`,
  };
}

module.exports = { queuePrintItem, getDocumentStatus, parseProofAvailability, getProofDocument };
