const Stripe = require('stripe');

let _stripe;
function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function getPriceCents(returnReceipt) {
  return returnReceipt
    ? parseInt(process.env.PRICE_CERTIFIED_RR || '1300', 10)
    : parseInt(process.env.PRICE_CERTIFIED || '1000', 10);
}

async function createCheckoutSession({ metadata, returnReceipt }) {
  const priceCents = getPriceCents(returnReceipt);
  const label = returnReceipt
    ? 'USPS Certified Mail + Return Receipt'
    : 'USPS Certified Mail';

  return getStripe().checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: label },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    metadata,
    success_url: `${process.env.BASE_URL}/success`,
    cancel_url: `${process.env.BASE_URL}/cancel`,
  });
}

function constructWebhookEvent(rawBody, sig) {
  return getStripe().webhooks.constructEvent(
    rawBody,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET,
  );
}

module.exports = { getStripe, createCheckoutSession, constructWebhookEvent, getPriceCents };
