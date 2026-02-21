function hasColumn(db, table, column) {
  const cols = db.pragma(`table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function run(db) {
  const additions = [
    { column: 'order_token', sql: 'ALTER TABLE orders ADD COLUMN order_token TEXT' },
    { column: 'phone_number', sql: 'ALTER TABLE orders ADD COLUMN phone_number TEXT' },
    { column: 'scm_queue_id', sql: 'ALTER TABLE orders ADD COLUMN scm_queue_id TEXT' },
    { column: 'delivery_status', sql: "ALTER TABLE orders ADD COLUMN delivery_status TEXT DEFAULT 'processing'" },
    { column: 'delivery_status_detail', sql: 'ALTER TABLE orders ADD COLUMN delivery_status_detail TEXT' },
    { column: 'delivery_status_updated_at', sql: 'ALTER TABLE orders ADD COLUMN delivery_status_updated_at DATETIME' },
  ];

  for (const { column, sql } of additions) {
    if (!hasColumn(db, 'orders', column)) {
      db.exec(sql);
    }
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_token ON orders(order_token)');
}

module.exports = { run };
