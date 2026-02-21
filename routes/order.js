const express = require('express');
const db = require('../db/init');
const { getDocumentStatus } = require('../services/certifiedMail');

const router = express.Router();

const findOrderByToken = db.prepare('SELECT * FROM orders WHERE order_token = ?');
const updateDeliveryStatus = db.prepare(`
  UPDATE orders SET delivery_status = ?, delivery_status_detail = ?,
  delivery_status_updated_at = datetime('now') WHERE order_token = ?
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
  if (order.delivery_status === 'delivered' || order.delivery_status === 'returned') return order;

  const lastUpdated = order.delivery_status_updated_at
    ? new Date(order.delivery_status_updated_at).getTime()
    : 0;
  const staleMs = STATUS_CACHE_MINUTES * 60 * 1000;

  if (Date.now() - lastUpdated < staleMs) return order;

  try {
    const result = await getDocumentStatus(order.scm_queue_id);
    const mapped = mapScmStatus(result.Status || result.StatusMessage);
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
  } catch (err) {
    console.error('Failed to refresh delivery status:', err.message);
  }

  return order;
}

router.get('/:token', async (req, res) => {
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

router.post('/:token/phone', (req, res) => {
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
