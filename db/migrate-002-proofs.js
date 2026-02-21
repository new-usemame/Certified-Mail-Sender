function hasColumn(db, table, column) {
  const cols = db.pragma(`table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function run(db) {
  const additions = [
    { column: 'acceptance_doc_available', sql: 'ALTER TABLE orders ADD COLUMN acceptance_doc_available INTEGER DEFAULT 0' },
    { column: 'delivery_doc_available', sql: 'ALTER TABLE orders ADD COLUMN delivery_doc_available INTEGER DEFAULT 0' },
    { column: 'signature_doc_available', sql: 'ALTER TABLE orders ADD COLUMN signature_doc_available INTEGER DEFAULT 0' },
    { column: 'accepted_date', sql: 'ALTER TABLE orders ADD COLUMN accepted_date DATETIME' },
    { column: 'delivery_date', sql: 'ALTER TABLE orders ADD COLUMN delivery_date DATETIME' },
    { column: 'signature_name', sql: 'ALTER TABLE orders ADD COLUMN signature_name TEXT' },
  ];

  for (const { column, sql } of additions) {
    if (!hasColumn(db, 'orders', column)) {
      db.exec(sql);
    }
  }
}

module.exports = { run };
