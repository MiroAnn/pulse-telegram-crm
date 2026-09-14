import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

const token = process.env.TELEGRAM_BOT_TOKEN || "";
const adminPassword = process.env.ADMIN_PASSWORD || "";
const adminOrigin = process.env.ADMIN_ORIGIN || "https://miroann.github.io";
const publicApiUrl = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
const port = Number(process.env.PORT || 4100);
const dataDir = process.env.DATA_DIR || "/app/data";
if (!token || !adminPassword) throw new Error("TELEGRAM_BOT_TOKEN and ADMIN_PASSWORD are required");
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "pulse.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
db.exec(`
CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT NOT NULL UNIQUE, username TEXT, first_name TEXT NOT NULL, last_name TEXT, phone TEXT, email TEXT, avatar_url TEXT, status TEXT NOT NULL DEFAULT 'active', is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT 'violet');
CREATE TABLE IF NOT EXISTS customer_tags (customer_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, UNIQUE(customer_id, tag_id));
CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, message TEXT NOT NULL, audience_mode TEXT NOT NULL DEFAULT 'all', excluded_tag_ids TEXT NOT NULL DEFAULT '[]', included_tag_ids TEXT NOT NULL DEFAULT '[]', scheduled_at TEXT, status TEXT NOT NULL DEFAULT 'draft', sent_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL, customer_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT, sent_at TEXT, UNIQUE(campaign_id, customer_id));
CREATE TABLE IF NOT EXISTS quiz_sessions (telegram_id TEXT PRIMARY KEY, answers_json TEXT NOT NULL DEFAULT '[]', current_step INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', result TEXT, details TEXT, started_at TEXT NOT NULL, completed_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT NOT NULL, telegram_message_id INTEGER, direction TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', text TEXT NOT NULL, scenario TEXT NOT NULL DEFAULT 'freeform', is_unread INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(telegram_id, telegram_message_id, direction));
CREATE TABLE IF NOT EXISTS scenario_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, message_key TEXT NOT NULL UNIQUE, scenario_key TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, tag_name TEXT, tag_color TEXT NOT NULL DEFAULT 'violet', sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_due ON campaigns(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tag ON customer_tags(tag_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_status ON quiz_sessions(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_created ON chat_messages(telegram_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(is_unread, created_at);
CREATE INDEX IF NOT EXISTS idx_scenario_messages_scenario_order ON scenario_messages(scenario_key, sort_order);
PRAGMA optimize;
`);

const TARIFFS_URL = "https://miroann.github.io/zdorovaya-osanka-darya/tarifs";
const POSTURE_GUIDE_URL = "https://www.dropbox.com/scl/fi/3xyvw111dp1pzsai69imt/.pdf?rlkey=pkezbjoe1bb0rg3ghphnu3tod&dl=0";
const WEBINAR_MESSAGE = `Здравствуйте!

Я зарегистрировал вас на вебинар – «<b>Почему упражнения не помогают?</b>» 21-ого сентября в 19.00, а также делюсь методичкой, как протестировать вашу осанку – правильная она или нет.

<a href="${POSTURE_GUIDE_URL}">Методичка</a>

Ссылку на вебинар пришлю за сутки до начала.

До встречи.`;

const SCENARIOS = [
  { key: "test", title: "Анкета «Здоровая спина»", startParam: "test", startEvent: "quiz_start" },
  { key: "vebinarspina", title: "Регистрация на вебинар", startParam: "vebinarspina", startEvent: "webinar_signup" },
];
const DEFAULT_SCENARIO_MESSAGES = [
  { key: "quiz_q1", scenario: "test", title: "Вопрос 1 из 4", message: '<b>Можно ли вам идти на курс «Здоровая спина» с Дарьей Кавуненко?</b>\nОтветьте на 4 вопроса и узнайте\n\n1/4\n<b>Есть ли у вас сейчас сильная, острая или быстро усиливающаяся боль в спине, шее или суставах?</b>', tag: "начал_анкету", color: "violet", order: 10 },
  { key: "quiz_q2", scenario: "test", title: "Вопрос 2 из 4", message: '2/4\n<b>Есть ли у вас онемение, выраженная слабость в руках или ногах, нарушение чувствительности или координации?</b>', tag: null, color: "violet", order: 20 },
  { key: "quiz_q3", scenario: "test", title: "Вопрос 3 из 4", message: '3/4\n<b>Были ли у вас за последние 3 месяца травмы, переломы или операции на позвоночнике, суставах или конечностях?</b>', tag: null, color: "violet", order: 30 },
  { key: "quiz_q4", scenario: "test", title: "Вопрос 4 из 4", message: '4/4\n<b>Есть ли у вас другие заболевания или состояния, при которых врач рекомендовал ограничить физическую активность (в том числе беременность)?</b>', tag: null, color: "violet", order: 40 },
  { key: "quiz_consultation", scenario: "test", title: "Результат: нужна консультация", message: '<b>Участие в курсе стоит обсудить с Дарьей</b>\n\nВы ответили «Да» минимум на один из вопросов, но, если хотите пойти на курс, пожалуйста, напишите сюда в бота подробности вашей ситуации и помощница Анна вместе с Дарьей обсудит ваше участие в курсе.', tag: "Нужна консультация", color: "amber", order: 50 },
  { key: "quiz_eligible", scenario: "test", title: "Результат: курс подходит", message: '<b>Вы можете идти на курс «Здоровая спина».</b>\n\nВыберите подходящий тариф и заберите памятку по регулярности упражнений.', tag: "Тест пройден", color: "mint", order: 60 },
  { key: "quiz_details_received", scenario: "test", title: "Подробности получены", message: "Спасибо! Мы сохранили подробности. Анна вместе с Дарьей обсудит вашу ситуацию и вернётся с ответом здесь, в боте.", tag: null, color: "violet", order: 70 },
  { key: "webinar_confirmation", scenario: "vebinarspina", title: "Подтверждение регистрации", message: WEBINAR_MESSAGE, tag: "Вебинар_спина", color: "violet", order: 10 },
];
const insertScenarioMessage = db.prepare("INSERT OR IGNORE INTO scenario_messages (message_key,scenario_key,title,message,tag_name,tag_color,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?)");
for (const item of DEFAULT_SCENARIO_MESSAGES) insertScenarioMessage.run(item.key, item.scenario, item.title, item.message, item.tag, item.color, item.order, now());
db.prepare("UPDATE scenario_messages SET tag_name='начал_анкету',tag_color='violet',updated_at=? WHERE message_key='quiz_q1' AND tag_name IS NULL").run(now());

function scenarioMessage(key) {
  const value = db.prepare("SELECT * FROM scenario_messages WHERE message_key=?").get(key);
  if (!value) throw new Error(`Scenario message not found: ${key}`);
  return value;
}

const sql = {
  record: db.prepare(`INSERT OR IGNORE INTO chat_messages (telegram_id, telegram_message_id, direction, kind, text, scenario, is_unread, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  customer: db.prepare(`INSERT INTO customers (telegram_id, username, first_name, last_name, phone, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name, phone=COALESCE(excluded.phone, customers.phone), avatar_url=COALESCE(excluded.avatar_url, customers.avatar_url), status='active', updated_at=excluded.updated_at`),
};

function now() { return new Date().toISOString(); }
function safeEqual(a, b) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function authorized(req) {
  const value = req.headers.authorization || "";
  if (!value.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const index = decoded.indexOf(":");
    return index >= 0 && decoded.slice(0, index) === "admin" && safeEqual(decoded.slice(index + 1), adminPassword);
  } catch { return false; }
}
function cors(req, extra = {}) {
  const origin = req.headers.origin;
  return {
    ...(origin === adminOrigin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    ...extra,
  };
}
function respond(req, res, status, data, extra = {}) {
  res.writeHead(status, cors(req, { "Content-Type": "application/json; charset=utf-8", ...extra }));
  res.end(JSON.stringify(data));
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw new Error("Request too large"); chunks.push(chunk); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function signAvatar(path) { return createHmac("sha256", adminPassword).update(path).digest("hex"); }
function publicAvatar(path) { return path && publicApiUrl ? `${publicApiUrl}/api/avatar?path=${encodeURIComponent(path)}&sig=${signAvatar(path)}` : path; }

async function telegram(method, payload = {}) {
  const retryableCodes = new Set(["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT", "ENETUNREACH", "EAI_AGAIN"]);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!result.ok) throw new Error(result.description || `Telegram ${response.status}`);
      return result.result;
    } catch (error) {
      const code = error?.cause?.code;
      if (!retryableCodes.has(code) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw new Error("Telegram unavailable");
}
function record({ telegramId, telegramMessageId = null, direction, kind = "text", text, scenario, unread = false }) {
  sql.record.run(String(telegramId), telegramMessageId, direction, kind, text, scenario, unread ? 1 : 0, now());
}
async function send(chatId, payload, scenario = "bot") {
  const result = await telegram("sendMessage", { chat_id: chatId, parse_mode: "HTML", ...payload });
  if (payload.text) record({ telegramId: chatId, telegramMessageId: result.message_id, direction: "outbound", text: payload.text.replace(/<[^>]*>/g, ""), scenario });
  return result;
}
async function avatarPath(userId) {
  try {
    const photos = await telegram("getUserProfilePhotos", { user_id: userId, limit: 1 });
    const sizes = photos.photos?.[0]; const fileId = sizes?.[sizes.length - 1]?.file_id;
    if (!fileId) return null;
    const file = await telegram("getFile", { file_id: fileId });
    return file.file_path || null;
  } catch { return null; }
}
async function upsertCustomer(user, phone = null) {
  const timestamp = now(); const avatar = await avatarPath(user.id);
  sql.customer.run(String(user.id), user.username || null, user.first_name, user.last_name || null, phone, avatar, timestamp, timestamp);
}
function tagCustomer(telegramId, name, color) {
  db.prepare("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)").run(name, color);
  db.prepare(`INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) SELECT c.id, t.id FROM customers c, tags t WHERE c.telegram_id=? AND t.name=?`).run(telegramId, name);
}
async function question(chatId, telegramId, step) {
  const item = scenarioMessage(`quiz_q${step}`);
  await send(chatId, { text: item.message, reply_markup: { inline_keyboard: [[{ text: "Да", callback_data: `quiz:${step}:yes` }, { text: "Нет", callback_data: `quiz:${step}:no` }]] } }, "quiz");
  if (item.tag_name) tagCustomer(telegramId, item.tag_name, item.tag_color);
}
async function startQuiz(chatId, telegramId) {
  const timestamp = now();
  db.prepare(`INSERT INTO quiz_sessions (telegram_id, answers_json, current_step, status, result, details, started_at, completed_at, updated_at) VALUES (?, '[]', 1, 'active', NULL, NULL, ?, NULL, ?) ON CONFLICT(telegram_id) DO UPDATE SET answers_json='[]', current_step=1, status='active', result=NULL, details=NULL, started_at=excluded.started_at, completed_at=NULL, updated_at=excluded.updated_at`).run(telegramId, timestamp, timestamp);
  await question(chatId, telegramId, 1);
}
async function quizAnswer(callbackId, chatId, messageId, telegramId, step, answer) {
  const session = db.prepare("SELECT answers_json, current_step, status FROM quiz_sessions WHERE telegram_id=?").get(telegramId);
  await telegram("answerCallbackQuery", { callback_query_id: callbackId });
  if (!session || session.status !== "active" || session.current_step !== step) return;
  await telegram("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
  const answers = JSON.parse(session.answers_json); answers.push(answer); const timestamp = now();
  record({ telegramId, direction: "inbound", text: answer ? "Да" : "Нет", scenario: "quiz_answer" });
  if (step < 4) {
    db.prepare("UPDATE quiz_sessions SET answers_json=?, current_step=?, updated_at=? WHERE telegram_id=?").run(JSON.stringify(answers), step + 1, timestamp, telegramId);
    await question(chatId, telegramId, step + 1); return;
  }
  const consultation = answers.some(Boolean);
  db.prepare("UPDATE quiz_sessions SET answers_json=?, status=?, result=?, completed_at=?, updated_at=? WHERE telegram_id=?").run(JSON.stringify(answers), consultation ? "awaiting_details" : "completed", consultation ? "consultation" : "eligible", timestamp, timestamp, telegramId);
  if (consultation) {
    const item = scenarioMessage("quiz_consultation");
    if (item.tag_name) tagCustomer(telegramId, item.tag_name, item.tag_color);
    await send(chatId, { text: item.message }, "quiz_result");
  } else {
    const item = scenarioMessage("quiz_eligible");
    if (item.tag_name) tagCustomer(telegramId, item.tag_name, item.tag_color);
    await send(chatId, { text: item.message, reply_markup: { inline_keyboard: [[{ text: "Посмотреть тарифы", url: TARIFFS_URL }]] } }, "quiz_result");
  }
}
async function handleUpdate(update) {
  const callback = update.callback_query; const message = update.message;
  const user = callback?.from || message?.from; const chatId = callback?.message?.chat?.id || message?.chat?.id;
  if (!user || !chatId) return;
  await upsertCustomer(user, message?.contact?.phone_number || null); const telegramId = String(user.id);
  if (callback?.data && callback.message) {
    const match = callback.data.match(/^quiz:(\d+):(yes|no)$/);
    if (match) await quizAnswer(callback.id, chatId, callback.message.message_id, telegramId, Number(match[1]), match[2] === "yes");
    return;
  }
  const text = message?.text?.trim() || message?.caption?.trim() || "";
  if (/^\/start(?:\s+|=)test$/i.test(text)) {
    record({ telegramId, telegramMessageId: message.message_id, direction: "inbound", text, scenario: "quiz_start" }); await startQuiz(chatId, telegramId);
  } else if (/^\/start(?:\s+|=)vebinarspina$/i.test(text)) {
    record({ telegramId, telegramMessageId: message.message_id, direction: "inbound", text, scenario: "webinar_signup" });
    const item = scenarioMessage("webinar_confirmation");
    if (item.tag_name) tagCustomer(telegramId, item.tag_name, item.tag_color);
    await send(chatId, { text: item.message, link_preview_options: { is_disabled: true } }, "webinar_signup");
  } else if (text === "/start") {
    record({ telegramId, telegramMessageId: message.message_id, direction: "inbound", text, scenario: "start" });
    await send(chatId, { text: `Здравствуйте, ${user.first_name}! Нажмите кнопку ниже, чтобы поделиться номером телефона.`, reply_markup: { keyboard: [[{ text: "Поделиться телефоном", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } }, "start");
  } else if (message?.contact) {
    record({ telegramId, telegramMessageId: message.message_id, direction: "inbound", kind: "contact", text: `Контакт: ${message.contact.phone_number}`, scenario: "contact" });
    await send(chatId, { text: "Спасибо! Контакт сохранён. Теперь отправьте email одним сообщением или нажмите «Пропустить».", reply_markup: { keyboard: [[{ text: "Пропустить" }]], resize_keyboard: true, one_time_keyboard: true } }, "contact");
  } else {
    const quiz = db.prepare("SELECT status FROM quiz_sessions WHERE telegram_id=?").get(telegramId);
    if (text && quiz?.status === "awaiting_details") {
      record({ telegramId, telegramMessageId: message.message_id, direction: "inbound", text, scenario: "quiz_details", unread: true });
      db.prepare("UPDATE quiz_sessions SET details=?, status='details_received', updated_at=? WHERE telegram_id=?").run(text, now(), telegramId);
      await send(chatId, { text: scenarioMessage("quiz_details_received").message }, "quiz_details");
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      record({ telegramId, telegramMessageId: message.message_id, direction: "inbound", text, scenario: "email" });
      db.prepare("UPDATE customers SET email=?, updated_at=? WHERE telegram_id=?").run(text.toLowerCase(), now(), telegramId);
      await send(chatId, { text: "Готово — данные сохранены.", reply_markup: { remove_keyboard: true } }, "email");
    } else if (text === "Пропустить") {
      record({ telegramId, telegramMessageId: message.message_id, direction: "inbound", text, scenario: "skip" });
      await send(chatId, { text: "Хорошо, можно добавить email позже.", reply_markup: { remove_keyboard: true } }, "skip");
    } else {
      const kind = message.photo ? "photo" : message.document ? "document" : message.voice ? "voice" : message.video ? "video" : message.sticker ? "sticker" : "text";
      const labels = { photo: "Фото", document: "Документ", voice: "Голосовое сообщение", video: "Видео", sticker: "Стикер", text: "Неподдерживаемое сообщение" };
      record({ telegramId, telegramMessageId: message.message_id, direction: "inbound", kind, text: text || labels[kind], scenario: "freeform", unread: true });
    }
  }
}

function dashboard() {
  const tags = db.prepare("SELECT * FROM tags ORDER BY name").all();
  const links = db.prepare("SELECT customer_id, tag_id FROM customer_tags").all();
  const quizzes = new Map(db.prepare("SELECT * FROM quiz_sessions").all().map(q => [String(q.telegram_id), q]));
  const tagsById = new Map(tags.map(t => [Number(t.id), t])); const grouped = new Map();
  for (const link of links) { const list = grouped.get(Number(link.customer_id)) || []; const tag = tagsById.get(Number(link.tag_id)); if (tag) list.push(tag); grouped.set(Number(link.customer_id), list); }
  const customers = db.prepare("SELECT * FROM customers ORDER BY is_demo ASC, datetime(created_at) DESC").all().map(c => ({ ...c, avatar_url: publicAvatar(c.avatar_url), tags: grouped.get(Number(c.id)) || [], quiz: quizzes.get(String(c.telegram_id)) || null }));
  const campaigns = db.prepare("SELECT * FROM campaigns ORDER BY datetime(created_at) DESC LIMIT 50").all();
  const messages = db.prepare("SELECT * FROM (SELECT * FROM chat_messages ORDER BY datetime(created_at) DESC, id DESC LIMIT 1000) ORDER BY datetime(created_at) ASC, id ASC").all();
  const scenarioRows = db.prepare("SELECT * FROM scenario_messages ORDER BY scenario_key, sort_order").all();
  const scenarioStarts = new Map(db.prepare("SELECT scenario,COUNT(DISTINCT telegram_id) AS joined_count FROM chat_messages WHERE scenario IN ('quiz_start','webinar_signup') GROUP BY scenario").all().map(item => [item.scenario, Number(item.joined_count)]));
  const scenarios = SCENARIOS.map(({ startEvent, ...item }) => ({ ...item, startLink: `https://t.me/daryakavunenkobot?start=${item.startParam}`, joinedCount: scenarioStarts.get(startEvent) || 0, messages: scenarioRows.filter(message => message.scenario_key === item.key) }));
  return { customers, tags, campaigns, messages, scenarios, stats: { customers: customers.filter(c => c.status === "active" && !c.is_demo).length, reachable: customers.filter(c => c.status === "active" && !c.is_demo).length, campaigns: campaigns.length, scheduled: campaigns.filter(c => c.status === "scheduled").length, unread: messages.filter(m => m.direction === "inbound" && m.is_unread).length } };
}
function ids(value) { return Array.isArray(value) ? value.map(Number).filter(id => Number.isInteger(id) && id > 0) : []; }
async function action(input) {
  const timestamp = now();
  if (input.action === "create-tag") {
    const name = String(input.name || "").trim(); if (!name) throw new Error("Введите название тега"); db.prepare("INSERT OR IGNORE INTO tags (name,color) VALUES (?,?)").run(name, String(input.color || "violet"));
  } else if (input.action === "set-customer-tags") {
    const customerId = Number(input.customerId); db.prepare("DELETE FROM customer_tags WHERE customer_id=?").run(customerId); for (const tagId of ids(input.tagIds)) db.prepare("INSERT OR IGNORE INTO customer_tags (customer_id,tag_id) VALUES (?,?)").run(customerId, tagId);
  } else if (input.action === "create-campaign") {
    const title = String(input.title || "").trim(); const message = String(input.message || "").trim(); if (!title || !message) throw new Error("Заполните название и текст"); const scheduledAt = input.sendNow ? timestamp : String(input.scheduledAt || ""); if (!scheduledAt) throw new Error("Выберите время отправки"); db.prepare("INSERT INTO campaigns (title,message,audience_mode,included_tag_ids,excluded_tag_ids,scheduled_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'scheduled',?,?)").run(title, message, String(input.audienceMode || "all"), JSON.stringify(ids(input.includedTagIds)), JSON.stringify(ids(input.excludedTagIds)), scheduledAt, timestamp, timestamp);
  } else if (input.action === "update-campaign") {
    const campaignId = Number(input.campaignId); const campaign = db.prepare("SELECT status FROM campaigns WHERE id=?").get(campaignId); if (!campaign) throw new Error("Рассылка не найдена"); if (campaign.status !== "scheduled") throw new Error("Можно редактировать только запланированную рассылку"); const title = String(input.title || "").trim(); const message = String(input.message || "").trim(); if (!title || !message) throw new Error("Заполните название и текст"); const scheduledAt = input.sendNow ? timestamp : String(input.scheduledAt || ""); if (!scheduledAt) throw new Error("Выберите время отправки"); const result = db.prepare("UPDATE campaigns SET title=?,message=?,audience_mode=?,included_tag_ids=?,excluded_tag_ids=?,scheduled_at=?,updated_at=? WHERE id=? AND status='scheduled'").run(title, message, String(input.audienceMode || "all"), JSON.stringify(ids(input.includedTagIds)), JSON.stringify(ids(input.excludedTagIds)), scheduledAt, timestamp, campaignId); if (!result.changes) throw new Error("Рассылка уже отправляется и больше не может быть изменена");
  } else if (input.action === "cancel-campaign") {
    db.prepare("UPDATE campaigns SET status='cancelled',updated_at=? WHERE id=? AND status='scheduled'").run(timestamp, Number(input.campaignId));
  } else if (input.action === "update-scenario-message") {
    const messageKey = String(input.messageKey || ""); const message = String(input.message || "").trim(); if (!messageKey || !message) throw new Error("Введите текст сообщения"); if (message.length > 4096) throw new Error("Сообщение Telegram не может быть длиннее 4096 символов"); const result = db.prepare("UPDATE scenario_messages SET message=?,updated_at=? WHERE message_key=?").run(message, timestamp, messageKey); if (!result.changes) throw new Error("Сообщение сценария не найдено");
  } else if (input.action === "mark-chat-read") {
    db.prepare("UPDATE chat_messages SET is_unread=0 WHERE telegram_id=? AND direction='inbound'").run(String(input.telegramId || ""));
  } else if (input.action === "send-chat-message") {
    const telegramId = String(input.telegramId || ""); const message = String(input.message || "").trim(); if (!telegramId || !message) throw new Error("Введите сообщение"); const customer = db.prepare("SELECT id FROM customers WHERE telegram_id=? AND is_demo=0").get(telegramId); if (!customer) throw new Error("Клиент не найден"); const result = await telegram("sendMessage", { chat_id: telegramId, text: message }); record({ telegramId, telegramMessageId: result.message_id, direction: "outbound", text: message, scenario: "admin_reply" }); db.prepare("UPDATE chat_messages SET is_unread=0 WHERE telegram_id=? AND direction='inbound'").run(telegramId);
  } else if (input.action === "clear-demo") {
    db.prepare("DELETE FROM customer_tags WHERE customer_id IN (SELECT id FROM customers WHERE is_demo=1)").run(); db.prepare("DELETE FROM customers WHERE is_demo=1").run();
  } else throw new Error("Неизвестное действие");
  return dashboard();
}
async function campaignTick() {
  const timestamp = now(); const campaign = db.prepare("SELECT * FROM campaigns WHERE status='scheduled' AND datetime(scheduled_at)<=datetime(?) ORDER BY datetime(scheduled_at) LIMIT 1").get(timestamp); if (!campaign) return;
  db.prepare("UPDATE campaigns SET status='sending',updated_at=? WHERE id=?").run(timestamp, campaign.id);
  const included = JSON.parse(campaign.included_tag_ids || "[]"); const excluded = JSON.parse(campaign.excluded_tag_ids || "[]"); let query = "SELECT DISTINCT c.id,c.telegram_id FROM customers c WHERE c.status='active' AND c.is_demo=0"; const values = [];
  if (campaign.audience_mode === "tags" && included.length) { query += ` AND EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id=c.id AND ct.tag_id IN (${included.map(()=>"?").join(",")}))`; values.push(...included); }
  if (excluded.length) { query += ` AND NOT EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id=c.id AND ct.tag_id IN (${excluded.map(()=>"?").join(",")}))`; values.push(...excluded); }
  let sent = 0; let failed = 0;
  for (const recipient of db.prepare(query).all(...values)) { try { const result = await telegram("sendMessage", { chat_id: recipient.telegram_id, text: campaign.message, parse_mode: "HTML" }); db.prepare("INSERT OR REPLACE INTO deliveries (campaign_id,customer_id,status,error,sent_at) VALUES (?,?,'sent',NULL,?)").run(campaign.id, recipient.id, timestamp); record({ telegramId: recipient.telegram_id, telegramMessageId: result.message_id, direction: "outbound", text: campaign.message.replace(/<[^>]*>/g, ""), scenario: "campaign" }); sent++; } catch (error) { failed++; db.prepare("INSERT OR REPLACE INTO deliveries (campaign_id,customer_id,status,error,sent_at) VALUES (?,?,'failed',?,?)").run(campaign.id, recipient.id, String(error.message || error), timestamp); } }
  db.prepare("UPDATE campaigns SET status='sent',sent_count=?,failed_count=?,updated_at=? WHERE id=?").run(sent, failed, now(), campaign.id);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "OPTIONS") { res.writeHead(204, cors(req)); return res.end(); }
    if (url.pathname === "/health") return respond(req, res, 200, { ok: true });
    if (url.pathname === "/api/avatar") {
      const path = url.searchParams.get("path") || ""; const sig = url.searchParams.get("sig") || "";
      if (!path || path.includes("..") || !safeEqual(signAvatar(path), sig)) return respond(req, res, 403, { error: "Forbidden" });
      const response = await fetch(`https://api.telegram.org/file/bot${token}/${path}`); res.writeHead(response.status, { "Content-Type": response.headers.get("content-type") || "application/octet-stream", "Cache-Control": "private, max-age=3600" }); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (url.pathname === "/api/dashboard") {
      if (!authorized(req)) return respond(req, res, 401, { error: "Неверный пароль" }, { "WWW-Authenticate": 'Basic realm="Pulse"' });
      if (req.method === "GET") return respond(req, res, 200, dashboard());
      if (req.method === "POST") return respond(req, res, 200, await action(await body(req)));
    }
    respond(req, res, 404, { error: "Not found" });
  } catch (error) { console.error(error); respond(req, res, 500, { error: error.message || "Internal error" }); }
});
server.listen(port, "0.0.0.0", () => console.log(`Pulse server listening on ${port}`));

let offset = 0;
async function poll() {
  let webhookCleared = false;
  while (true) {
    try {
      if (!webhookCleared) { await telegram("deleteWebhook", { drop_pending_updates: false }); webhookCleared = true; }
      const updates = await telegram("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
      for (const update of updates) { await handleUpdate(update); offset = update.update_id + 1; }
    } catch (error) { console.error("Telegram polling:", error.message || error); await new Promise(resolve => setTimeout(resolve, 2500)); }
  }
}
if (process.env.DISABLE_BOT !== "1") void poll();
setInterval(() => void campaignTick().catch(error => console.error("Campaign:", error)), 10_000);
