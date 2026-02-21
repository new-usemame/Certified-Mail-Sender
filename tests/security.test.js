const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const TEST_DB = path.join(__dirname, '..', 'test-security.db');

process.env.DB_PATH = TEST_DB;
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.RESEND_API_KEY = 're_test_fake';
process.env.OWNER_EMAIL = 'test@example.com';
process.env.BASE_URL = 'http://localhost:3099';
process.env.CSRF_SECRET = 'test-csrf-secret-for-testing';
process.env.PORT = '3099';

const supertest = require('supertest');
const app = require('../server');

function extractCsrfTokenAndCookies(res) {
  const html = res.text;
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  const token = match ? match[1] : null;
  const cookies = res.headers['set-cookie'] || [];
  const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
  return { token, cookieHeader };
}

after(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(TEST_DB + suffix); } catch {}
  }
  // Force exit since setInterval in server.js keeps the process alive
  setTimeout(() => process.exit(0), 500);
});

// ---------- Security Header Tests ----------

describe('Security Headers', () => {
  it('includes X-Content-Type-Options: nosniff', async () => {
    const res = await supertest(app).get('/');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('includes Content-Security-Policy', async () => {
    const res = await supertest(app).get('/');
    assert.ok(res.headers['content-security-policy'], 'CSP header missing');
  });

  it('includes X-Frame-Options', async () => {
    const res = await supertest(app).get('/');
    const xfo = res.headers['x-frame-options'];
    assert.ok(xfo, 'X-Frame-Options header missing');
  });

  it('includes Strict-Transport-Security', async () => {
    const res = await supertest(app).get('/');
    assert.ok(
      res.headers['strict-transport-security'],
      'HSTS header missing',
    );
  });
});

// ---------- CSRF Protection Tests ----------

describe('CSRF Protection', () => {
  it('rejects POST /contact without CSRF token', async () => {
    const res = await supertest(app)
      .post('/contact')
      .type('form')
      .send({ name: 'Test', email: 'a@b.com', message: 'hi' });

    assert.equal(res.status, 403);
  });

  it('rejects POST /checkout without CSRF token (multipart)', async () => {
    const res = await supertest(app)
      .post('/checkout')
      .field('sender_name', 'Alice')
      .field('sender_street', '123 Main')
      .field('sender_city', 'NY')
      .field('sender_state', 'NY')
      .field('sender_zip', '10001')
      .field('customer_email', 'a@b.com')
      .field('recipient_name', 'Bob')
      .field('recipient_street', '456 Oak')
      .field('recipient_city', 'LA')
      .field('recipient_state', 'CA')
      .field('recipient_zip', '90001')
      .field('letter_mode', 'text')
      .field('letter_text', 'hello');

    assert.equal(res.status, 403);
  });

  it('rejects POST /order/:token/phone without CSRF token', async () => {
    const fakeToken = crypto.randomUUID();
    const res = await supertest(app)
      .post(`/order/${fakeToken}/phone`)
      .type('form')
      .send({ phone_number: '555-1234' });

    assert.equal(res.status, 403);
  });

  it('allows POST /contact with valid CSRF token', async () => {
    const getRes = await supertest(app).get('/contact');
    const { token, cookieHeader } = extractCsrfTokenAndCookies(getRes);
    assert.ok(token, 'CSRF token not found in contact form');

    const res = await supertest(app)
      .post('/contact')
      .set('Cookie', cookieHeader)
      .type('form')
      .send({
        _csrf: token,
        name: 'Test',
        email: 'a@b.com',
        message: 'Hello',
      });

    // Should not be 403 (might be 500 because Resend API key is fake, but not 403)
    assert.notEqual(res.status, 403, 'Valid CSRF token was rejected');
  });
});

// ---------- Webhook / Payment Bypass Tests ----------

describe('Payment Bypass Prevention', () => {
  it('rejects webhook with missing signature', async () => {
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_fake', metadata: {} } },
    });

    const res = await supertest(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.equal(res.status, 400);
  });

  it('rejects webhook with invalid signature', async () => {
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_fake', metadata: {} } },
    });

    const res = await supertest(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=9999999999,v1=badsignature')
      .send(payload);

    assert.equal(res.status, 400);
  });

  it('rejects webhook with forged but structurally valid signature', async () => {
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_forged',
          metadata: {
            sender_name: 'Attacker',
            sender_street: '123 Evil St',
            sender_city: 'Hackville',
            sender_state: 'CA',
            sender_zip: '90001',
            customer_email: 'attacker@evil.com',
            recipient_name: 'Victim',
            recipient_street: '456 Target Ave',
            recipient_city: 'LA',
            recipient_state: 'CA',
            recipient_zip: '90002',
            letter_type: 'text',
            return_receipt: '0',
            pdf_id: 'pdf_fake',
            page_count: '1',
          },
        },
      },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const fakeSecret = 'whsec_attacker_does_not_have_this';
    const signedPayload = `${timestamp}.${payload}`;
    const sig = crypto
      .createHmac('sha256', fakeSecret)
      .update(signedPayload)
      .digest('hex');

    const res = await supertest(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', `t=${timestamp},v1=${sig}`)
      .send(payload);

    assert.equal(res.status, 400);
  });

  it('does not create orders from unauthenticated checkout POST', async () => {
    const db = require('../db/init');
    const countBefore = db
      .prepare('SELECT COUNT(*) as c FROM orders')
      .get().c;

    const getRes = await supertest(app).get('/');
    const { token, cookieHeader } = extractCsrfTokenAndCookies(getRes);

    // POST to checkout with valid CSRF but no payment — should NOT create an order
    // (it redirects to Stripe or errors; it never inserts into orders)
    await supertest(app)
      .post('/checkout')
      .set('Cookie', cookieHeader)
      .field('_csrf', token)
      .field('sender_name', 'Alice')
      .field('sender_street', '123 Main')
      .field('sender_city', 'New York')
      .field('sender_state', 'NY')
      .field('sender_zip', '10001')
      .field('customer_email', 'a@b.com')
      .field('recipient_name', 'Bob')
      .field('recipient_street', '456 Oak')
      .field('recipient_city', 'LA')
      .field('recipient_state', 'CA')
      .field('recipient_zip', '90001')
      .field('letter_mode', 'text')
      .field('letter_text', 'Test letter content for security testing.');

    const countAfter = db
      .prepare('SELECT COUNT(*) as c FROM orders')
      .get().c;

    assert.equal(
      countAfter,
      countBefore,
      'Checkout POST without payment must not create an order',
    );
  });

  it('does not serve temporary PDF files via HTTP', async () => {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const testFile = path.join(uploadsDir, 'pdf_test_leak.b64');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(testFile, 'secret-pdf-content');

    try {
      const res = await supertest(app).get('/uploads/pdf_test_leak.b64');
      assert.notEqual(res.status, 200, 'Temporary PDF file should not be served');
    } finally {
      try { fs.unlinkSync(testFile); } catch {}
    }
  });
});

// ---------- Rate Limiting Tests ----------

describe('Rate Limiting with Trust Proxy', () => {
  it('rate limits per-IP using X-Forwarded-For', async () => {
    const agent1 = supertest(app);
    const agent2 = supertest(app);

    // First IP hits global limiter heavily
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        agent1.get('/').set('X-Forwarded-For', '1.2.3.4'),
      );
    }
    await Promise.all(promises);

    // Second IP should still get through
    const res = await agent2.get('/').set('X-Forwarded-For', '5.6.7.8');
    assert.equal(res.status, 200, 'Different IP should not share rate limit bucket');
  });

  it('trust proxy is enabled', () => {
    assert.equal(
      app.get('trust proxy'),
      1,
      'trust proxy should be set to 1 for Railway',
    );
  });
});

// ---------- Order Token Access Tests ----------

describe('Order Token Security', () => {
  it('returns 404 for invalid order tokens', async () => {
    const res = await supertest(app).get('/order/nonexistent-token-12345');
    assert.equal(res.status, 404);
  });

  it('returns 404 for SQL injection attempts in order token', async () => {
    const res = await supertest(app).get(
      "/order/' OR '1'='1",
    );
    assert.equal(res.status, 404);
  });
});

// ---------- File Upload Boundary Tests ----------

describe('File Upload Security', () => {
  it('rejects non-PDF file upload with wrong content-type', async () => {
    const getRes = await supertest(app).get('/');
    const { token, cookieHeader } = extractCsrfTokenAndCookies(getRes);

    const res = await supertest(app)
      .post('/checkout')
      .set('Cookie', cookieHeader)
      .field('_csrf', token)
      .field('sender_name', 'Alice')
      .field('sender_street', '123 Main')
      .field('sender_city', 'NY')
      .field('sender_state', 'NY')
      .field('sender_zip', '10001')
      .field('customer_email', 'a@b.com')
      .field('recipient_name', 'Bob')
      .field('recipient_street', '456 Oak')
      .field('recipient_city', 'LA')
      .field('recipient_state', 'CA')
      .field('recipient_zip', '90001')
      .field('letter_mode', 'pdf')
      .attach('letter_pdf', Buffer.from('<script>alert(1)</script>'), {
        filename: 'malicious.html',
        contentType: 'text/html',
      });

    // Multer rejects non-PDF MIME type, so the route renders the form with an error
    assert.ok(
      res.status === 200 || res.status === 400,
      `Expected 200 or 400, got ${res.status}`,
    );
    if (res.text) {
      assert.ok(
        res.text.includes('upload') || res.text.includes('PDF') || res.text.includes('Upload'),
        'Should prompt for a valid PDF',
      );
    }
  });
});
