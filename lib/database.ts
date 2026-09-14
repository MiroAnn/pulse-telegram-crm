import { env } from "cloudflare:workers";

export type DatabaseEnv = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  LOCAL_ADMIN_KEY?: string;
};

export function getEnv() {
  return env as unknown as DatabaseEnv;
}

const statements = [
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL UNIQUE,
    username TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT,
    phone TEXT,
    email TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT 'violet'
  )`,
  `CREATE TABLE IF NOT EXISTS customer_tags (
    customer_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    UNIQUE(customer_id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    audience_mode TEXT NOT NULL DEFAULT 'all',
    excluded_tag_ids TEXT NOT NULL DEFAULT '[]',
    included_tag_ids TEXT NOT NULL DEFAULT '[]',
    scheduled_at TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    sent_at TEXT,
    UNIQUE(campaign_id, customer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS quiz_sessions (
    telegram_id TEXT PRIMARY KEY,
    answers_json TEXT NOT NULL DEFAULT '[]',
    current_step INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    result TEXT,
    details TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status)`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_due ON campaigns(status, scheduled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_customer_tags_tag ON customer_tags(tag_id, customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quiz_sessions_status ON quiz_sessions(status, updated_at)`,
];

let initialized = false;

export async function ensureDatabase() {
  const { DB } = getEnv();
  if (initialized) return DB;
  await DB.batch(statements.map((sql) => DB.prepare(sql)));
  await DB.prepare("PRAGMA optimize").run();
  initialized = true;
  return DB;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
}
