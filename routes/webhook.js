const crypto = require('crypto');
const express = require('express');
const { constructWebhookEvent, getPriceCents } = require('../services/stripe');
const { queuePrintItem } = require('../services/certifiedMail');
const { sendCustomerEmail, sendOwnerEmail, sendFailureAlert, sendCustomerFailureEmail } = require('../services/email');
const db = require('../db/init');

const router = express.Router();

const insertOrder = db.prepare(`
  INSERT INTO orders (
    stripe_session_id, customer_email, sender_name, sender_address,
    recipient_name, recipient_address, letter_type, return_receipt,
    tracking_number, status, amount_cents, order_token, delivery_status, pdf_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateOrderSuccess = db.prepare(`
  UPDATE orders SET tracking_number = ?, status = ?, scm_queue_id = ?,
  delivery_status = ?, delivery_status_updated_at = datetime('now')
  WHERE stripe_session_id = ?
`);

const updateOrderFailed = db.prepare(`
  UPDATE orders SET status = ?, delivery_status = ?,
  delivery_status_detail = ?, delivery_status_updated_at = datetime('now')
  WHERE stripe_session_id = ?
`);

const getOrderToken = db.prepare(`
  SELECT order_token FROM orders WHERE stripe_session_id = ?
`);

const findExistingOrder = db.prepare(`
  SELECT id FROM orders WHERE stripe_session_id = ?
`);

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;

  // Idempotency: if this session was already processed, acknowledge and skip
  const existingOrder = findExistingOrder.get(session.id);
  if (existingOrder) {
    return res.json({ received: true });
  }

  const m = session.metadata;
  const returnReceipt = m.return_receipt === '1';

  const expectedCents = getPriceCents(returnReceipt);
  const actualCents = session.amount_total;
  const amountCents = actualCents || expectedCents;

  if (actualCents != null && actualCents < expectedCents) {
    console.error(`Amount underpayment: expected ${expectedCents}, Stripe charged ${actualCents}, session ${session.id}`);
    const orderToken = crypto.randomUUID();
    try {
      insertOrder.run(
        session.id, m.customer_email, m.sender_name,
        `${m.sender_street}, ${m.sender_city}, ${m.sender_state} ${m.sender_zip}`,
        m.recipient_name,
        `${m.recipient_street}, ${m.recipient_city}, ${m.recipient_state} ${m.recipient_zip}`,
        m.letter_type, returnReceipt ? 1 : 0,
        null, 'payment_mismatch', amountCents, orderToken, 'failed', m.pdf_id,
      );
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.json({ received: true });
    }
    await sendFailureAlert({
      orderId: 'N/A',
      error: `Amount underpayment: expected ${expectedCents}, got ${actualCents}. Session ${session.id}. Order needs manual review.`,
    }).catch(console.error);
    await sendCustomerFailureEmail({ to: m.customer_email, orderToken }).catch(console.error);
    return res.json({ received: true });
  }

  const senderStreetFull = m.sender_street2 ? `${m.sender_street}, ${m.sender_street2}` : m.sender_street;
  const recipientStreetFull = m.recipient_street2 ? `${m.recipient_street}, ${m.recipient_street2}` : m.recipient_street;
  const senderAddress = `${senderStreetFull}, ${m.sender_city}, ${m.sender_state} ${m.sender_zip}`;
  const recipientAddress = `${recipientStreetFull}, ${m.recipient_city}, ${m.recipient_state} ${m.recipient_zip}`;

  const orderToken = crypto.randomUUID();

  let orderId;
  try {
    const result = insertOrder.run(
      session.id, m.customer_email, m.sender_name, senderAddress,
      m.recipient_name, recipientAddress, m.letter_type, returnReceipt ? 1 : 0,
      null, 'pending', amountCents, orderToken, 'processing', m.pdf_id,
    );
    orderId = result.lastInsertRowid;
  } catch (dbErr) {
    if (dbErr.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.json({ received: true });
    }
    console.error('DB insert error:', dbErr);
    return res.status(500).send('DB error');
  }

  const fetchPdf = db.prepare('SELECT pdf_base64, page_count FROM pending_pdfs WHERE pdf_id = ?');
  const pdfRow = fetchPdf.get(m.pdf_id);
  if (!pdfRow) {
    console.error('Failed to read PDF from database:', m.pdf_id);
    updateOrderFailed.run('failed', 'failed', 'PDF data not found during processing', session.id);
    await Promise.all([
      sendFailureAlert({ orderId, error: `PDF not found in database: ${m.pdf_id}` }),
      sendCustomerFailureEmail({ to: m.customer_email, orderToken }),
    ]).catch(console.error);
    return res.json({ received: true });
  }
  const pdfBase64 = pdfRow.pdf_base64;

  let trackingNumber = null;
  try {
    const scmResult = await queuePrintItem({
      senderName: m.sender_name,
      senderStreet: m.sender_street,
      senderStreet2: m.sender_street2 || '',
      senderCity: m.sender_city,
      senderState: m.sender_state,
      senderZip: m.sender_zip,
      senderEmail: m.customer_email,
      recipientName: m.recipient_name,
      recipientStreet: m.recipient_street,
      recipientStreet2: m.recipient_street2 || '',
      recipientCity: m.recipient_city,
      recipientState: m.recipient_state,
      recipientZip: m.recipient_zip,
      pdfBase64,
      pageCount: pdfRow.page_count || parseInt(m.page_count, 10) || 1,
      returnReceipt,
      reference: `order-${orderId}`,
    });

    trackingNumber = scmResult.PIC || `Q${scmResult.QueueID}`;
    updateOrderSuccess.run(trackingNumber, 'sent', String(scmResult.QueueID), 'queued', session.id);

    db.prepare('DELETE FROM pending_pdfs WHERE pdf_id = ?').run(m.pdf_id);
  } catch (scmErr) {
    console.error('SCM API error:', scmErr);
    updateOrderFailed.run('failed', 'failed', scmErr.message, session.id);
    await Promise.all([
      sendFailureAlert({ orderId, error: scmErr.message }),
      sendCustomerFailureEmail({ to: m.customer_email, orderToken }),
    ]).catch(console.error);
    return res.json({ received: true });
  }

  try {
    await Promise.all([
      sendCustomerEmail({
        to: m.customer_email,
        trackingNumber,
        recipientName: m.recipient_name,
        recipientAddress,
        returnReceipt,
        orderToken,
      }),
      sendOwnerEmail({
        customerEmail: m.customer_email,
        trackingNumber,
        senderName: m.sender_name,
        recipientName: m.recipient_name,
        recipientAddress,
        amountCents,
        orderId,
        returnReceipt,
      }),
    ]);
  } catch (emailErr) {
    console.error('Email send error:', emailErr);
  }

  res.json({ received: true });
});

module.exports = router;
