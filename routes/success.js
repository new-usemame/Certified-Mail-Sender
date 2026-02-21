const express = require('express');
const db = require('../db/init');

const router = express.Router();

const findOrderBySession = db.prepare(`
  SELECT * FROM orders WHERE stripe_session_id = ?
`);

router.get('/', (req, res) => {
  const sessionId = req.query.session_id;

  if (!sessionId) {
    return res.render('success', {
      order: null,
      pending: false,
      googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
    });
  }

  const order = findOrderBySession.get(sessionId);

  if (!order) {
    return res.render('success', {
      order: null,
      pending: true,
      sessionId,
      googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
    });
  }

  return res.redirect(`/order/${order.order_token}`);
});

module.exports = router;
