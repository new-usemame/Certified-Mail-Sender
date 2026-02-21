const db = require('../db/init');
const { queuePrintItem } = require('./certifiedMail');
const { sendCustomerEmail, sendOwnerEmail, sendFailureAlert } = require('./email');

const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 10 * 60 * 1000;

const findRetryable = db.prepare(`
  SELECT o.*, p.pdf_base64, p.page_count AS pdf_page_count
  FROM orders o
  JOIN pending_pdfs p ON o.pdf_id = p.pdf_id
  WHERE o.status = 'failed'
    AND o.retry_count < ?
    AND o.delivery_status_detail NOT LIKE '%not found%'
  ORDER BY o.created_at ASC
  LIMIT 5
`);

const updateRetrySuccess = db.prepare(`
  UPDATE orders SET tracking_number = ?, status = 'sent', scm_queue_id = ?,
  delivery_status = 'queued', delivery_status_detail = 'Fulfilled on retry',
  retry_count = retry_count + 1, delivery_status_updated_at = datetime('now')
  WHERE id = ?
`);

const updateRetryFailed = db.prepare(`
  UPDATE orders SET retry_count = retry_count + 1,
  delivery_status_detail = ?, delivery_status_updated_at = datetime('now')
  WHERE id = ?
`);

async function retryFailedOrders() {
  let orders;
  try {
    orders = findRetryable.all(MAX_RETRIES);
  } catch (e) {
    console.error('Retry job: failed to query retryable orders:', e.message);
    return;
  }

  for (const order of orders) {
    const meta = parseMetadataFromOrder(order);
    try {
      const scmResult = await queuePrintItem({
        senderName: meta.senderName,
        senderStreet: meta.senderStreet,
        senderCity: meta.senderCity,
        senderState: meta.senderState,
        senderZip: meta.senderZip,
        senderEmail: order.customer_email,
        recipientName: order.recipient_name,
        recipientStreet: meta.recipientStreet,
        recipientCity: meta.recipientCity,
        recipientState: meta.recipientState,
        recipientZip: meta.recipientZip,
        pdfBase64: order.pdf_base64,
        pageCount: order.pdf_page_count || 1,
        returnReceipt: !!order.return_receipt,
        reference: `order-${order.id}`,
      });

      const trackingNumber = scmResult.PIC || `Q${scmResult.QueueID}`;
      updateRetrySuccess.run(trackingNumber, String(scmResult.QueueID), order.id);
      db.prepare('DELETE FROM pending_pdfs WHERE pdf_id = ?').run(order.pdf_id);

      console.log(`Retry job: order #${order.id} fulfilled successfully (tracking: ${trackingNumber})`);

      await Promise.all([
        sendCustomerEmail({
          to: order.customer_email,
          trackingNumber,
          recipientName: order.recipient_name,
          recipientAddress: order.recipient_address,
          returnReceipt: !!order.return_receipt,
          orderToken: order.order_token,
        }),
        sendOwnerEmail({
          customerEmail: order.customer_email,
          trackingNumber,
          senderName: order.sender_name,
          recipientName: order.recipient_name,
          recipientAddress: order.recipient_address,
          amountCents: order.amount_cents,
          orderId: order.id,
          returnReceipt: !!order.return_receipt,
        }),
      ]).catch((e) => console.error('Retry job: email error for order', order.id, e.message));
    } catch (err) {
      console.error(`Retry job: order #${order.id} failed again:`, err.message);
      updateRetryFailed.run(err.message, order.id);

      if (order.retry_count + 1 >= MAX_RETRIES) {
        await sendFailureAlert({
          orderId: order.id,
          error: `Exhausted ${MAX_RETRIES} retries. Last error: ${err.message}`,
        }).catch(console.error);
      }
    }
  }
}

function parseMetadataFromOrder(order) {
  const senderParts = (order.sender_address || '').split(', ');
  const recipientParts = (order.recipient_address || '').split(', ');

  function parseStateZip(stateZip) {
    const parts = (stateZip || '').split(' ');
    return { state: parts[0] || '', zip: parts[1] || '' };
  }

  const senderSZ = parseStateZip(senderParts[2]);
  const recipientSZ = parseStateZip(recipientParts[2]);

  return {
    senderName: order.sender_name || '',
    senderStreet: senderParts[0] || '',
    senderCity: senderParts[1] || '',
    senderState: senderSZ.state,
    senderZip: senderSZ.zip,
    recipientStreet: recipientParts[0] || '',
    recipientCity: recipientParts[1] || '',
    recipientState: recipientSZ.state,
    recipientZip: recipientSZ.zip,
  };
}

let retryTimer = null;

function startRetryJob() {
  retryTimer = setInterval(() => {
    retryFailedOrders().catch((e) => console.error('Retry job error:', e.message));
  }, RETRY_INTERVAL_MS);
  retryFailedOrders().catch((e) => console.error('Retry job initial run error:', e.message));
}

function stopRetryJob() {
  if (retryTimer) clearInterval(retryTimer);
}

module.exports = { startRetryJob, stopRetryJob, retryFailedOrders };
