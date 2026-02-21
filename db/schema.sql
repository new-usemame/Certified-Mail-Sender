CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_session_id TEXT UNIQUE,
  customer_email TEXT NOT NULL,
  sender_name TEXT,
  sender_address TEXT,
  recipient_name TEXT,
  recipient_address TEXT,
  letter_type TEXT CHECK(letter_type IN ('text', 'pdf')),
  return_receipt INTEGER DEFAULT 0,
  tracking_number TEXT,
  status TEXT DEFAULT 'pending',
  amount_cents INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
