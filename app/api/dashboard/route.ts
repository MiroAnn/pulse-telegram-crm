import { ensureDatabase, getEnv, json, parseIds } from "../../../lib/database";

type ActionBody = Record<string, unknown> & { action?: string };

const POSTURE_GUIDE_URL = "https://www.dropbox.com/scl/fi/3xyvw111dp1pzsai69imt/.pdf?rlkey=pkezbjoe1bb0rg3ghphnu3tod&dl=0";
const scenarioDefinitions = [
  { key: "test", title: "Анкета «Здоровая спина»", startParam: "test" },
  { key: "vebinarspina", title: "Регистрация на вебинар", startParam: "vebinarspina" },
];
const defaultScenarioMessages = [
  { key: "quiz_q1", scenario: "test", title: "Вопрос 1 из 4", message: '<b>Можно ли вам идти на курс «Здоровая спина» с Дарьей Кавуненко?</b>\nОтветьте на 4 вопроса и узнайте\n\n1/4\n<b>Есть ли у вас сейчас сильная, острая или быстро усиливающаяся боль в спине, шее или суставах?</b>', tag: null, color: "violet", order: 10 },
  { key: "quiz_q2", scenario: "test", title: "Вопрос 2 из 4", message: '2/4\n<b>Есть ли у вас онемение, выраженная слабость в руках или ногах, нарушение чувствительности или координации?</b>', tag: null, color: "violet", order: 20 },
  { key: "quiz_q3", scenario: "test", title: "Вопрос 3 из 4", message: '3/4\n<b>Были ли у вас за последние 3 месяца травмы, переломы или операции на позвоночнике, суставах или конечностях?</b>', tag: null, color: "violet", order: 30 },
  { key: "quiz_q4", scenario: "test", title: "Вопрос 4 из 4", message: '4/4\n<b>Есть ли у вас другие заболевания или состояния, при которых врач рекомендовал ограничить физическую активность (в том числе беременность)?</b>', tag: null, color: "violet", order: 40 },
  { key: "quiz_consultation", scenario: "test", title: "Результат: нужна консультация", message: '<b>Участие в курсе стоит обсудить с Дарьей</b>\n\nВы ответили «Да» минимум на один из вопросов, но, если хотите пойти на курс, пожалуйста, напишите сюда в бота подробности вашей ситуации и помощница Анна вместе с Дарьей обсудит ваше участие в курсе.', tag: "Нужна консультация", color: "amber", order: 50 },
  { key: "quiz_eligible", scenario: "test", title: "Результат: курс подходит", message: '<b>Вы можете идти на курс «Здоровая спина».</b>\n\nВыберите подходящий тариф и заберите памятку по регулярности упражнений.', tag: "Тест пройден", color: "mint", order: 60 },
  { key: "quiz_details_received", scenario: "test", title: "Подробности получены", message: "Спасибо! Мы сохранили подробности. Анна вместе с Дарьей обсудит вашу ситуацию и вернётся с ответом здесь, в боте.", tag: null, color: "violet", order: 70 },
  { key: "webinar_confirmation", scenario: "vebinarspina", title: "Подтверждение регистрации", message: `Здравствуйте!\n\nЯ зарегистрировал вас на вебинар – «<b>Почему упражнения не помогают?</b>» 21-ого сентября в 19.00, а также делюсь методичкой, как протестировать вашу осанку – правильная она или нет.\n\n<a href="${POSTURE_GUIDE_URL}">Методичка</a>\n\nСсылку на вебинар пришлю за сутки до начала.\n\nДо встречи.`, tag: "Вебинар_спина", color: "violet", order: 10 },
];

async function ensureScenarioMessages(DB: D1Database, now: string) {
  await DB.batch(defaultScenarioMessages.map((item) => DB.prepare(
    "INSERT OR IGNORE INTO scenario_messages (message_key, scenario_key, title, message, tag_name, tag_color, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(item.key, item.scenario, item.title, item.message, item.tag, item.color, item.order, now)));
}

async function dashboardState() {
  const DB = await ensureDatabase();
  await ensureScenarioMessages(DB, new Date().toISOString());
  const [customersResult, tagsResult, linksResult, campaignsResult, quizzesResult, messagesResult, scenarioMessagesResult] = await DB.batch([
    DB.prepare("SELECT * FROM customers ORDER BY is_demo ASC, datetime(created_at) DESC"),
    DB.prepare("SELECT * FROM tags ORDER BY name"),
    DB.prepare("SELECT customer_id, tag_id FROM customer_tags"),
    DB.prepare("SELECT * FROM campaigns ORDER BY datetime(created_at) DESC LIMIT 50"),
    DB.prepare("SELECT * FROM quiz_sessions"),
    DB.prepare("SELECT * FROM (SELECT * FROM chat_messages ORDER BY datetime(created_at) DESC, id DESC LIMIT 1000) ORDER BY datetime(created_at) ASC, id ASC"),
    DB.prepare("SELECT * FROM scenario_messages ORDER BY scenario_key, sort_order"),
  ]);

  const tags = tagsResult.results as Array<Record<string, unknown>>;
  const links = linksResult.results as Array<{ customer_id: number; tag_id: number }>;
  const tagsById = new Map(tags.map((tag) => [Number(tag.id), tag]));
  const customerTags = new Map<number, Array<Record<string, unknown>>>();
  const quizzes = new Map(
    (quizzesResult.results as Array<Record<string, unknown>>).map((quiz) => [String(quiz.telegram_id), quiz]),
  );
  for (const link of links) {
    const values = customerTags.get(link.customer_id) ?? [];
    const tag = tagsById.get(link.tag_id);
    if (tag) values.push(tag);
    customerTags.set(link.customer_id, values);
  }

  const customers = (customersResult.results as Array<Record<string, unknown>>).map(
    (customer) => ({
      ...customer,
      tags: customerTags.get(Number(customer.id)) ?? [],
      quiz: quizzes.get(String(customer.telegram_id)) ?? null,
    }),
  );
  const scenarioRows = scenarioMessagesResult.results as Array<Record<string, unknown>>;
  const scenarios = scenarioDefinitions.map((item) => ({
    ...item,
    startLink: `https://t.me/daryakavunenkobot?start=${item.startParam}`,
    messages: scenarioRows.filter((message) => message.scenario_key === item.key),
  }));

  return {
    customers,
    tags,
    campaigns: campaignsResult.results,
    messages: messagesResult.results,
    scenarios,
    stats: {
      customers: customers.filter((item) => item.status === "active" && !item.is_demo).length,
      reachable: customers.filter((item) => item.status === "active" && !item.is_demo).length,
      campaigns: campaignsResult.results.length,
      scheduled: (campaignsResult.results as Array<Record<string, unknown>>).filter(
        (item) => item.status === "scheduled",
      ).length,
      unread: (messagesResult.results as Array<Record<string, unknown>>).filter(
        (item) => item.direction === "inbound" && Boolean(item.is_unread),
      ).length,
    },
  };
}

export async function GET() {
  return json(await dashboardState());
}

export async function POST(request: Request) {
  const DB = await ensureDatabase();
  const body = (await request.json()) as ActionBody;
  const now = new Date().toISOString();
  await ensureScenarioMessages(DB, now);

  if (body.action === "seed-demo") {
    const count = await DB.prepare("SELECT COUNT(*) AS total FROM customers WHERE is_demo = 1").first<{ total: number }>();
    if (!count?.total) {
      const demo = [
        ["demo-1001", "anna_fit", "Анна", "Волкова", "+7 999 123-45-67", "anna@example.com"],
        ["demo-1002", "maria_move", "Мария", "Соколова", "+7 916 555-18-20", "maria@example.com"],
        ["demo-1003", "dmitry_pro", "Дмитрий", "Орлов", null, "dmitry@example.com"],
      ];
      for (const row of demo) {
        await DB.prepare(
          "INSERT OR IGNORE INTO customers (telegram_id, username, first_name, last_name, phone, email, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
        ).bind(...row, now, now).run();
      }
    }
  } else if (body.action === "clear-demo") {
    await DB.prepare("DELETE FROM customer_tags WHERE customer_id IN (SELECT id FROM customers WHERE is_demo = 1)").run();
    await DB.prepare("DELETE FROM customers WHERE is_demo = 1").run();
  } else if (body.action === "create-tag") {
    const name = String(body.name ?? "").trim();
    if (!name) return json({ error: "Введите название тега" }, 400);
    await DB.prepare("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)")
      .bind(name, String(body.color ?? "violet"))
      .run();
  } else if (body.action === "set-customer-tags") {
    const customerId = Number(body.customerId);
    const tagIds = parseIds(body.tagIds);
    await DB.prepare("DELETE FROM customer_tags WHERE customer_id = ?").bind(customerId).run();
    if (tagIds.length) {
      await DB.batch(
        tagIds.map((tagId) =>
          DB.prepare("INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)").bind(customerId, tagId),
        ),
      );
    }
  } else if (body.action === "create-campaign") {
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!title || !message) return json({ error: "Заполните название и текст" }, 400);
    const sendNow = Boolean(body.sendNow);
    const scheduledAt = sendNow ? now : String(body.scheduledAt ?? "");
    if (!sendNow && !scheduledAt) return json({ error: "Выберите время отправки" }, 400);
    await DB.prepare(
      "INSERT INTO campaigns (title, message, audience_mode, included_tag_ids, excluded_tag_ids, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)",
    )
      .bind(
        title,
        message,
        String(body.audienceMode ?? "all"),
        JSON.stringify(parseIds(body.includedTagIds)),
        JSON.stringify(parseIds(body.excludedTagIds)),
        scheduledAt,
        now,
        now,
      )
      .run();
  } else if (body.action === "update-campaign") {
    const campaignId = Number(body.campaignId);
    const campaign = await DB.prepare("SELECT status FROM campaigns WHERE id = ?")
      .bind(campaignId)
      .first<{ status: string }>();
    if (!campaign) return json({ error: "Рассылка не найдена" }, 404);
    if (campaign.status !== "scheduled") return json({ error: "Можно редактировать только запланированную рассылку" }, 409);
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!title || !message) return json({ error: "Заполните название и текст" }, 400);
    const sendNow = Boolean(body.sendNow);
    const scheduledAt = sendNow ? now : String(body.scheduledAt ?? "");
    if (!sendNow && !scheduledAt) return json({ error: "Выберите время отправки" }, 400);
    await DB.prepare(
      "UPDATE campaigns SET title = ?, message = ?, audience_mode = ?, included_tag_ids = ?, excluded_tag_ids = ?, scheduled_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'",
    )
      .bind(
        title,
        message,
        String(body.audienceMode ?? "all"),
        JSON.stringify(parseIds(body.includedTagIds)),
        JSON.stringify(parseIds(body.excludedTagIds)),
        scheduledAt,
        now,
        campaignId,
      )
      .run();
  } else if (body.action === "cancel-campaign") {
    await DB.prepare("UPDATE campaigns SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled'")
      .bind(now, Number(body.campaignId))
      .run();
  } else if (body.action === "update-scenario-message") {
    const messageKey = String(body.messageKey ?? "");
    const message = String(body.message ?? "").trim();
    if (!messageKey || !message) return json({ error: "Введите текст сообщения" }, 400);
    if (message.length > 4096) return json({ error: "Сообщение Telegram не может быть длиннее 4096 символов" }, 400);
    const existing = await DB.prepare("SELECT id FROM scenario_messages WHERE message_key = ?")
      .bind(messageKey)
      .first<{ id: number }>();
    if (!existing) return json({ error: "Сообщение сценария не найдено" }, 404);
    await DB.prepare("UPDATE scenario_messages SET message = ?, updated_at = ? WHERE message_key = ?")
      .bind(message, now, messageKey)
      .run();
  } else if (body.action === "mark-chat-read") {
    const telegramId = String(body.telegramId ?? "");
    await DB.prepare(
      "UPDATE chat_messages SET is_unread = 0 WHERE telegram_id = ? AND direction = 'inbound'",
    ).bind(telegramId).run();
  } else if (body.action === "send-chat-message") {
    const telegramId = String(body.telegramId ?? "");
    const message = String(body.message ?? "").trim();
    if (!telegramId || !message) return json({ error: "Введите сообщение" }, 400);
    const customer = await DB.prepare(
      "SELECT id FROM customers WHERE telegram_id = ? AND is_demo = 0",
    ).bind(telegramId).first<{ id: number }>();
    if (!customer) return json({ error: "Клиент не найден" }, 404);
    const token = getEnv().TELEGRAM_BOT_TOKEN;
    if (!token) return json({ error: "Бот ещё не подключён" }, 503);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text: message }),
    });
    const result = await response.json() as {
      ok: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!result.ok) return json({ error: result.description ?? "Telegram не отправил сообщение" }, 502);
    await DB.prepare(
      `INSERT INTO chat_messages
       (telegram_id, telegram_message_id, direction, kind, text, scenario, is_unread, created_at)
       VALUES (?, ?, 'outbound', 'text', ?, 'admin_reply', 0, ?)`,
    ).bind(telegramId, result.result?.message_id ?? null, message, now).run();
    await DB.prepare(
      "UPDATE chat_messages SET is_unread = 0 WHERE telegram_id = ? AND direction = 'inbound'",
    ).bind(telegramId).run();
  } else {
    return json({ error: "Неизвестное действие" }, 400);
  }

  return json(await dashboardState());
}
