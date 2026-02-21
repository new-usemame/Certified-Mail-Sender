const REQUIRED_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SCM_USERNAME',
  'SCM_PASSWORD',
  'SCM_PARTNER_KEY',
  'SCM_CLIENT_CODE',
  'RESEND_API_KEY',
  'OWNER_EMAIL',
  'BASE_URL',
];

async function runCheck(name, fn) {
  const start = Date.now();
  try {
    await fn();
    return { name, status: 'pass', error: null, durationMs: Date.now() - start };
  } catch (e) {
    return { name, status: 'fail', error: e.message, durationMs: Date.now() - start };
  }
}

async function runAll() {
  const results = [];

  for (const key of REQUIRED_ENV) {
    results.push(await runCheck(`ENV ${key}`, () => {
      if (!process.env[key] || process.env[key].includes('...') || process.env[key].includes('your_')) {
        throw new Error('not set or still placeholder');
      }
    }));
  }

  results.push(await runCheck('SQLite database', () => {
    const db = require('../db/init');
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
    if (!row) throw new Error('orders table not found');
  }));

  results.push(await runCheck('Stripe API key', async () => {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.balance.retrieve();
  }));

  results.push(await runCheck('Resend API key', async () => {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.domains.list();
  }));

  results.push(await runCheck('SimpleCertifiedMail auth', async () => {
    const params = new URLSearchParams({
      grant_type: 'password',
      username: process.env.SCM_USERNAME,
      password: process.env.SCM_PASSWORD,
      PartnerKey: process.env.SCM_PARTNER_KEY,
      ClientCode: process.env.SCM_CLIENT_CODE,
    });
    const res = await fetch('https://api.simplecertifiedmail.com/RESTv4.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error('no access_token in response');
  }));

  results.push(await runCheck('PDF generation', async () => {
    const { generateLetterPdf } = require('../services/pdf');
    const result = await generateLetterPdf('Test letter.');
    if (!result.buffer || result.buffer.length < 100) throw new Error('PDF too small');
  }));

  results.push(await runCheck('NODE_ENV', () => {
    if (!process.env.NODE_ENV) throw new Error('not set (SCM will use test mode)');
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`set to "${process.env.NODE_ENV}" — SCM will use test mode`);
    }
  }));

  results.push(await runCheck('BASE_URL format', () => {
    const url = process.env.BASE_URL;
    if (!url) throw new Error('not set');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('must start with http:// or https://');
    }
    if (url.endsWith('/')) throw new Error('should not end with /');
  }));

  results.push(await runCheck('Pricing config', () => {
    const cert = parseInt(process.env.PRICE_CERTIFIED || '1000', 10);
    const rr = parseInt(process.env.PRICE_CERTIFIED_RR || '1300', 10);
    if (cert < 500 || cert > 50000) throw new Error(`PRICE_CERTIFIED=${cert} seems wrong`);
    if (rr < 500 || rr > 50000) throw new Error(`PRICE_CERTIFIED_RR=${rr} seems wrong`);
    if (rr <= cert) throw new Error('PRICE_CERTIFIED_RR should be higher than PRICE_CERTIFIED');
  }));

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  const summary = {
    total: results.length,
    passed,
    failed,
    allPassed: failed === 0,
    timestamp: new Date().toISOString(),
  };

  return { results, summary };
}

module.exports = { runAll };
