function hasColumn(db, table, column) {
  const cols = db.pragma(`table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function run(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_pdfs (
      pdf_id TEXT PRIMARY KEY,
      pdf_base64 TEXT NOT NULL,
      page_count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  if (!hasColumn(db, 'orders', 'retry_count')) {
    db.exec('ALTER TABLE orders ADD COLUMN retry_count INTEGER DEFAULT 0');
  }
  if (!hasColumn(db, 'orders', 'pdf_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN pdf_id TEXT');
  }
}

module.exports = { run };
