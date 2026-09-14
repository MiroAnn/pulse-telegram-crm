import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const source = process.argv[2];
const databasePath = process.env.DATABASE_PATH || "/app/data/pulse.sqlite";
if (!source) throw new Error("Usage: node server/import.mjs dashboard.json");
const data = JSON.parse(await readFile(source, "utf8"));
const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys=ON");

const insertTag = db.prepare("INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)");
const insertCustomer = db.prepare(`INSERT OR REPLACE INTO customers
  (id, telegram_id, username, first_name, last_name, phone, email, avatar_url, status, is_demo, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertLink = db.prepare("INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)");
const insertCampaign = db.prepare(`INSERT OR REPLACE INTO campaigns
  (id, title, message, audience_mode, excluded_tag_ids, included_tag_ids, scheduled_at, status, sent_count, failed_count, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertQuiz = db.prepare(`INSERT OR REPLACE INTO quiz_sessions
  (telegram_id, answers_json, current_step, status, result, details, started_at, completed_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertMessage = db.prepare(`INSERT OR IGNORE INTO chat_messages
  (id, telegram_id, telegram_message_id, direction, kind, text, scenario, is_unread, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

db.exec("BEGIN");
try {
  for (const tag of data.tags || []) insertTag.run(tag.id, tag.name, tag.color);
  for (const customer of data.customers || []) {
    insertCustomer.run(customer.id, customer.telegram_id, customer.username, customer.first_name, customer.last_name, customer.phone, customer.email, customer.avatar_url, customer.status, customer.is_demo || 0, customer.created_at, customer.updated_at || customer.created_at);
    for (const tag of customer.tags || []) insertLink.run(customer.id, tag.id);
    const quiz = customer.quiz;
    if (quiz) insertQuiz.run(customer.telegram_id, quiz.answers_json, quiz.current_step || 1, quiz.status, quiz.result, quiz.details, quiz.started_at || customer.created_at, quiz.completed_at, quiz.updated_at || quiz.completed_at || customer.created_at);
  }
  for (const campaign of data.campaigns || []) insertCampaign.run(campaign.id, campaign.title, campaign.message, campaign.audience_mode, campaign.excluded_tag_ids || "[]", campaign.included_tag_ids || "[]", campaign.scheduled_at, campaign.status, campaign.sent_count || 0, campaign.failed_count || 0, campaign.created_at, campaign.updated_at || campaign.created_at);
  for (const message of data.messages || []) insertMessage.run(message.id, message.telegram_id, message.telegram_message_id, message.direction, message.kind, message.text, message.scenario, message.is_unread || 0, message.created_at);
  db.exec("COMMIT");
  console.log(JSON.stringify({ customers: data.customers?.length || 0, messages: data.messages?.length || 0 }));
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
