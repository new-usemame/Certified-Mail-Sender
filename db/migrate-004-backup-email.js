function run(db) {
  const cols = db.pragma('table_info(orders)');
  if (!cols.some((c) => c.name === 'backup_email')) {
    db.exec('ALTER TABLE orders ADD COLUMN backup_email TEXT');
  }
}

module.exports = { run };
