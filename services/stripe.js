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

async function createCheckoutSession({ metadata, returnReceipt, billingAddress }) {
  const priceCents = getPriceCents(returnReceipt);
  const label = returnReceipt
    ? 'USPS Certified Mail + Return Receipt'
    : 'USPS Certified Mail';

  const sessionParams = {
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: metadata.customer_email,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
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
    success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/cancel`,
  };

  if (billingAddress) {
    sessionParams.payment_intent_data = {
      shipping: {
        name: billingAddress.name,
        address: {
          line1: billingAddress.line1,
          line2: billingAddress.line2 || '',
          city: billingAddress.city,
          state: billingAddress.state,
          postal_code: billingAddress.postal_code,
          country: billingAddress.country,
        },
      },
    };
  }

  return getStripe().checkout.sessions.create(sessionParams);
}

function constructWebhookEvent(rawBody, sig) {
  return getStripe().webhooks.constructEvent(
    rawBody,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET,
  );
}

module.exports = { getStripe, createCheckoutSession, constructWebhookEvent, getPriceCents };
