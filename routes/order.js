const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db/init');
const { getDocumentStatus, parseProofAvailability, getProofDocument } = require('../services/certifiedMail');

const router = express.Router();

const orderPageLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again in a few minutes.',
});

const proofDownloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many download requests. Please try again in a few minutes.',
});

const phoneUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.',
});

const findOrderByToken = db.prepare('SELECT * FROM orders WHERE order_token = ?');
const updateDeliveryStatus = db.prepare(`
  UPDATE orders SET delivery_status = ?, delivery_status_detail = ?,
  delivery_status_updated_at = datetime('now') WHERE order_token = ?
`);
const updateProofAvailability = db.prepare(`
  UPDATE orders SET
    acceptance_doc_available = ?,
    delivery_doc_available = ?,
    signature_doc_available = ?,
    accepted_date = ?,
    delivery_date = ?,
    signature_name = ?
  WHERE order_token = ?
`);
const updatePhone = db.prepare('UPDATE orders SET phone_number = ? WHERE order_token = ?');

const STATUS_CACHE_MINUTES = 5;

const SCM_STATUS_MAP = {
  'Queued': 'queued',
  'Printed': 'printed',
  'In Transit': 'in_transit',
  'InTransit': 'in_transit',
  'Delivered': 'delivered',
  'Returned': 'returned',
  'Return to Sender': 'returned',
  'ReturnToSender': 'returned',
  'Failed': 'failed',
};

function mapScmStatus(scmStatus) {
  if (!scmStatus) return null;
  return SCM_STATUS_MAP[scmStatus] || null;
}

const TIMELINE_STEPS = [
  { key: 'processing', label: 'Processing' },
  { key: 'queued', label: 'Queued' },
  { key: 'printed', label: 'Printed' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
];

function getStepIndex(status) {
  const idx = TIMELINE_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

async function refreshStatus(order) {
  if (!order.scm_queue_id) return order;

  const isTerminal = order.delivery_status === 'delivered' || order.delivery_status === 'returned';

  const lastUpdated = order.delivery_status_updated_at
    ? new Date(order.delivery_status_updated_at).getTime()
    : 0;
  const staleMs = STATUS_CACHE_MINUTES * 60 * 1000;

  const proofsMissing = !order.acceptance_doc_available && !order.delivery_doc_available;
  const shouldRefresh = (Date.now() - lastUpdated >= staleMs) && (!isTerminal || proofsMissing);

  if (!shouldRefresh) return order;

  try {
    const result = await getDocumentStatus(order.scm_queue_id);
    const mapped = mapScmStatus(result.TrackingStatus || result.Status || result.StatusMessage);
    if (mapped && mapped !== order.delivery_status) {
      const detail = result.StatusMessage || result.Status || '';
      updateDeliveryStatus.run(mapped, detail, order.order_token);
      order.delivery_status = mapped;
      order.delivery_status_detail = detail;
      order.delivery_status_updated_at = new Date().toISOString();
    } else {
      updateDeliveryStatus.run(order.delivery_status, order.delivery_status_detail || '', order.order_token);
      order.delivery_status_updated_at = new Date().toISOString();
    }

    const proofs = parseProofAvailability(result);
    updateProofAvailability.run(
      proofs.acceptanceDocAvailable,
      proofs.deliveryDocAvailable,
      proofs.signatureDocAvailable,
      proofs.acceptedDate,
      proofs.deliveryDate,
      proofs.signatureName,
      order.order_token,
    );
    order.acceptance_doc_available = proofs.acceptanceDocAvailable;
    order.delivery_doc_available = proofs.deliveryDocAvailable;
    order.signature_doc_available = proofs.signatureDocAvailable;
    order.accepted_date = proofs.acceptedDate;
    order.delivery_date = proofs.deliveryDate;
    order.signature_name = proofs.signatureName;
  } catch (err) {
    console.error('Failed to refresh delivery status:', err.message);
  }

  return order;
}

router.get('/:token', orderPageLimiter, async (req, res) => {
  let order = findOrderByToken.get(req.params.token);

  if (!order) {
    return res.status(404).render('order', {
      order: null,
      notFound: true,
      timelineSteps: TIMELINE_STEPS,
      currentStepIndex: 0,
      googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
      phoneSaved: false,
    });
  }

  order = await refreshStatus(order);

  const isFailed = order.delivery_status === 'failed' || order.delivery_status === 'returned';
  const currentStepIndex = isFailed ? -1 : getStepIndex(order.delivery_status);

  res.render('order', {
    order,
    notFound: false,
    timelineSteps: TIMELINE_STEPS,
    currentStepIndex,
    googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
    phoneSaved: req.query.phone === 'saved',
  });
});

router.get('/:token/proof/:type', proofDownloadLimiter, async (req, res) => {
  const { token, type } = req.params;
  const validTypes = ['acceptance', 'delivery', 'signature'];
  if (!validTypes.includes(type)) {
    return res.status(400).send('Invalid proof type.');
  }

  const order = findOrderByToken.get(token);
  if (!order) return res.status(404).send('Order not found.');
  if (!order.scm_queue_id) {
    return res.status(404).send('This order has not been submitted for mailing yet.');
  }

  try {
    const result = await getProofDocument(order.scm_queue_id, type);
    if (!result) {
      const messages = {
        acceptance: 'Proof of Acceptance is not yet available. It will be posted within hours of USPS acceptance.',
        delivery: 'Proof of Delivery is not yet available. It will be posted within hours of delivery.',
        signature: 'Return Receipt is not yet available. It will be posted within 24 hours of delivery.',
      };
      return res.status(404).send(messages[type]);
    }

    const pdfBuffer = Buffer.from(result.base64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Proof document download error:', err.message);
    res.status(500).send('Failed to retrieve document. Please try again later.');
  }
});

router.post('/:token/phone', phoneUpdateLimiter, (req, res) => {
  const order = findOrderByToken.get(req.params.token);
  if (!order) return res.status(404).send('Order not found');

  const phone = (req.body.phone_number || '').trim();
  if (!phone || !/^[\d\s\-\(\)\+]+$/.test(phone)) {
    return res.redirect(`/order/${req.params.token}?phone=invalid`);
  }

  updatePhone.run(phone, req.params.token);
  res.redirect(`/order/${req.params.token}?phone=saved`);
});

module.exports = router;
