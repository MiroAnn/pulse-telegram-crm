import { ensureDatabase, getEnv, json } from "../../../../lib/database";

type TelegramUser = { id: number; username?: string; first_name: string; last_name?: string };
type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  from?: TelegramUser;
  contact?: { phone_number: string; user_id?: number };
  text?: string;
};
type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
};

const TARIFFS_URL = "https://miroann.github.io/zdorovaya-osanka-darya/tarifs";
const QUESTIONS = [
  "Есть ли у вас сейчас сильная, острая или быстро усиливающаяся боль в спине, шее или суставах?",
  "Есть ли у вас онемение, выраженная слабость в руках или ногах, нарушение чувствительности или координации?",
  "Были ли у вас за последние 3 месяца травмы, переломы или операции на позвоночнике, суставах или конечностях?",
  "Есть ли у вас другие заболевания или состояния, при которых врач рекомендовал ограничить физическую активность (в том числе беременность)?",
];

async function telegram(method: string, payload: Record<string, unknown>) {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function send(chatId: number, payload: Record<string, unknown>) {
  return telegram("sendMessage", { chat_id: chatId, parse_mode: "HTML", ...payload });
}

async function sendQuestion(chatId: number, step: number, withIntro = false) {
  const intro = withIntro
    ? '<b>Можно ли вам идти на курс «Здоровая спина» с Дарьей Кавуненко?</b>\nОтветьте на 4 вопроса и узнайте\n\n'
    : "";
  await send(chatId, {
    text: `${intro}${step}/4\n<b>${QUESTIONS[step - 1]}</b>`,
    reply_markup: {
      inline_keyboard: [[
        { text: "Да", callback_data: `quiz:${step}:yes` },
        { text: "Нет", callback_data: `quiz:${step}:no` },
      ]],
    },
  });
}

async function getAvatarPath(userId: number) {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const photosResponse = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`,
    );
    const photos = (await photosResponse.json()) as {
      ok: boolean;
      result?: { photos?: Array<Array<{ file_id: string }>> };
    };
    const sizes = photos.result?.photos?.[0];
    const fileId = sizes?.[sizes.length - 1]?.file_id;
    if (!photos.ok || !fileId) return null;
    const fileResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const file = (await fileResponse.json()) as { ok: boolean; result?: { file_path?: string } };
    return file.ok ? file.result?.file_path ?? null : null;
  } catch {
    return null;
  }
}

async function upsertCustomer(user: TelegramUser, phone: string | null) {
  const DB = await ensureDatabase();
  const now = new Date().toISOString();
  const avatarPath = await getAvatarPath(user.id);
  await DB.prepare(
    `INSERT INTO customers (telegram_id, username, first_name, last_name, phone, avatar_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       phone = COALESCE(excluded.phone, customers.phone),
       avatar_url = COALESCE(excluded.avatar_url, customers.avatar_url),
       status = 'active',
       updated_at = excluded.updated_at`,
  )
    .bind(
      String(user.id), user.username ?? null, user.first_name, user.last_name ?? null,
      phone, avatarPath, now, now,
    )
    .run();
}

async function tagCustomer(telegramId: string, name: string, color: string) {
  const DB = await ensureDatabase();
  await DB.prepare("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)").bind(name, color).run();
  await DB.prepare(
    `INSERT OR IGNORE INTO customer_tags (customer_id, tag_id)
     SELECT c.id, t.id FROM customers c, tags t WHERE c.telegram_id = ? AND t.name = ?`,
  ).bind(telegramId, name).run();
}

async function startQuiz(chatId: number, telegramId: string) {
  const DB = await ensureDatabase();
  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO quiz_sessions (telegram_id, answers_json, current_step, status, result, details, started_at, completed_at, updated_at)
     VALUES (?, '[]', 1, 'active', NULL, NULL, ?, NULL, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
       answers_json = '[]', current_step = 1, status = 'active', result = NULL,
       details = NULL, started_at = excluded.started_at, completed_at = NULL, updated_at = excluded.updated_at`,
  ).bind(telegramId, now, now).run();
  await sendQuestion(chatId, 1, true);
}

async function handleQuizAnswer(
  callbackId: string,
  chatId: number,
  messageId: number,
  telegramId: string,
  step: number,
  answer: boolean,
) {
  const DB = await ensureDatabase();
  const session = await DB.prepare(
    "SELECT answers_json, current_step, status FROM quiz_sessions WHERE telegram_id = ?",
  ).bind(telegramId).first<{ answers_json: string; current_step: number; status: string }>();

  await telegram("answerCallbackQuery", { callback_query_id: callbackId });
  if (!session || session.status !== "active" || session.current_step !== step) return;

  await telegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
  const answers = JSON.parse(session.answers_json) as boolean[];
  answers.push(answer);
  const now = new Date().toISOString();

  if (step < QUESTIONS.length) {
    await DB.prepare(
      "UPDATE quiz_sessions SET answers_json = ?, current_step = ?, updated_at = ? WHERE telegram_id = ?",
    ).bind(JSON.stringify(answers), step + 1, now, telegramId).run();
    await sendQuestion(chatId, step + 1);
    return;
  }

  const needsConsultation = answers.some(Boolean);
  await DB.prepare(
    "UPDATE quiz_sessions SET answers_json = ?, status = ?, result = ?, completed_at = ?, updated_at = ? WHERE telegram_id = ?",
  ).bind(
    JSON.stringify(answers), needsConsultation ? "awaiting_details" : "completed",
    needsConsultation ? "consultation" : "eligible", now, now, telegramId,
  ).run();

  if (needsConsultation) {
    await tagCustomer(telegramId, "Нужна консультация", "amber");
    await send(chatId, {
      text: '<b>Участие в курсе стоит обсудить с Дарьей</b>\n\nВы ответили «Да» минимум на один из вопросов, но, если хотите пойти на курс, пожалуйста, напишите сюда в бота подробности вашей ситуации и помощница Анна вместе с Дарьей обсудит ваше участие в курсе.',
    });
  } else {
    await tagCustomer(telegramId, "Тест пройден", "mint");
    await send(chatId, {
      text: '<b>Вы можете идти на курс «Здоровая спина».</b>\n\nВыберите подходящий тариф и заберите памятку по регулярности упражнений.',
      reply_markup: { inline_keyboard: [[{ text: "Посмотреть тарифы", url: TARIFFS_URL }]] },
    });
  }
}

export async function POST(request: Request) {
  const update = (await request.json()) as TelegramUpdate;
  const callback = update.callback_query;
  const message = update.message;
  const user = callback?.from ?? message?.from;
  const chatId = callback?.message?.chat.id ?? message?.chat.id;
  if (!user || !chatId) return json({ ok: true });

  await upsertCustomer(user, message?.contact?.phone_number ?? null);
  const telegramId = String(user.id);

  if (callback?.data && callback.message) {
    const match = callback.data.match(/^quiz:(\d+):(yes|no)$/);
    if (match) {
      await handleQuizAnswer(
        callback.id, chatId, callback.message.message_id, telegramId,
        Number(match[1]), match[2] === "yes",
      );
    }
    return json({ ok: true });
  }

  const text = message?.text?.trim() ?? "";
  if (/^\/start(?:\s+|=)test$/i.test(text)) {
    await startQuiz(chatId, telegramId);
  } else if (text === "/start") {
    await send(chatId, {
      text: `Здравствуйте, ${user.first_name}! Нажмите кнопку ниже, чтобы поделиться номером телефона.`,
      reply_markup: {
        keyboard: [[{ text: "Поделиться телефоном", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  } else if (message?.contact) {
    await send(chatId, {
      text: "Спасибо! Контакт сохранён. Теперь отправьте email одним сообщением или нажмите «Пропустить».",
      reply_markup: { keyboard: [[{ text: "Пропустить" }]], resize_keyboard: true, one_time_keyboard: true },
    });
  } else {
    const DB = await ensureDatabase();
    const quiz = await DB.prepare(
      "SELECT status FROM quiz_sessions WHERE telegram_id = ?",
    ).bind(telegramId).first<{ status: string }>();
    if (text && quiz?.status === "awaiting_details") {
      const now = new Date().toISOString();
      await DB.prepare(
        "UPDATE quiz_sessions SET details = ?, status = 'details_received', updated_at = ? WHERE telegram_id = ?",
      ).bind(text, now, telegramId).run();
      await send(chatId, {
        text: "Спасибо! Мы сохранили подробности. Анна вместе с Дарьей обсудит вашу ситуацию и вернётся с ответом здесь, в боте.",
      });
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      await DB.prepare("UPDATE customers SET email = ?, updated_at = ? WHERE telegram_id = ?")
        .bind(text.toLowerCase(), new Date().toISOString(), telegramId).run();
      await send(chatId, { text: "Готово — данные сохранены.", reply_markup: { remove_keyboard: true } });
    } else if (text === "Пропустить") {
      await send(chatId, { text: "Хорошо, можно добавить email позже.", reply_markup: { remove_keyboard: true } });
    }
  }

  return json({ ok: true });
}
