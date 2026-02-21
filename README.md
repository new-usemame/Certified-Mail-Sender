# Certified Mail Sender

Send USPS Certified Mail online. No account needed — fill out a form, pay, and your letter gets printed, certified, and mailed.

## Setup

1. Copy `.env.example` to `.env` and fill in your keys:
   - **Stripe**: Create a Stripe account, get your secret key and set up a webhook pointing to `/webhook`
   - **SimpleCertifiedMail**: Sign up at simplecertifiedmail.com, get API credentials
   - **Resend**: Sign up at resend.com for email notifications

2. Install and run:
   ```
   npm install
   npm start
   ```

## Deploy to Railway

1. Push to your git remote
2. Connect the repo in Railway
3. Set all environment variables from `.env.example`
4. Mount a persistent volume for the SQLite database (optional but recommended)

## Pricing

Configurable via `PRICE_CERTIFIED` and `PRICE_CERTIFIED_RR` env vars (in cents).
