import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.RENDER_VOLUME_PATH || '.';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ghostzin.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('user','master')) DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance REAL DEFAULT 0 CHECK(balance >= 0),
    coutinho_balance REAL DEFAULT 0 CHECK(coutinho_balance >= 0),
    last_yield_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pix_keys (
    key_value TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type TEXT CHECK(type IN ('cpf','email','phone','random')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS credit_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    amount REAL NOT NULL CHECK(amount > 0),
    status TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
    master_notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    from_account TEXT,
    to_account TEXT,
    amount REAL NOT NULL CHECK(amount > 0),
    type TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_pix_keys_val ON pix_keys(key_value);
  CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_account);
  CREATE INDEX IF NOT EXISTS idx_credit_user ON credit_requests(user_id);
`);

export default db;
