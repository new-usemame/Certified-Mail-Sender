const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const migrate001 = require('./migrate-001-tracking');
migrate001.run(db);

const migrate002 = require('./migrate-002-proofs');
migrate002.run(db);

const migrate003 = require('./migrate-003-pdf-storage');
migrate003.run(db);

const migrate004 = require('./migrate-004-backup-email');
migrate004.run(db);

module.exports = db;
