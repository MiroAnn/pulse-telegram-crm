import { ensureDatabase, getEnv, json } from "../../../../lib/database";

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    from?: { id: number; username?: string; first_name: string; last_name?: string };
    contact?: { phone_number: string; user_id?: number };
    text?: string;
  };
};

async function send(chatId: number, payload: Record<string, unknown>) {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, ...payload }),
  });
}

export async function POST(request: Request) {
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  const user = message?.from;
  if (!message || !user) return json({ ok: true });

  const DB = await ensureDatabase();
  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO customers (telegram_id, username, first_name, last_name, phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       phone = COALESCE(excluded.phone, customers.phone),
       status = 'active',
       updated_at = excluded.updated_at`,
  )
    .bind(
      String(user.id),
      user.username ?? null,
      user.first_name,
      user.last_name ?? null,
      message.contact?.phone_number ?? null,
      now,
      now,
    )
    .run();

  if (message.text === "/start") {
    await send(message.chat.id, {
      text: `Здравствуйте, ${user.first_name}! Нажмите кнопку ниже, чтобы поделиться номером телефона.`,
      reply_markup: {
        keyboard: [[{ text: "Поделиться телефоном", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  } else if (message.contact) {
    await send(message.chat.id, {
      text: "Спасибо! Контакт сохранён. Теперь отправьте email одним сообщением или нажмите «Пропустить».",
      reply_markup: {
        keyboard: [[{ text: "Пропустить" }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  } else if (message.text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.text)) {
    await DB.prepare("UPDATE customers SET email = ?, updated_at = ? WHERE telegram_id = ?")
      .bind(message.text.trim().toLowerCase(), now, String(user.id))
      .run();
    await send(message.chat.id, { text: "Готово — данные сохранены.", reply_markup: { remove_keyboard: true } });
  } else if (message.text === "Пропустить") {
    await send(message.chat.id, { text: "Хорошо, можно добавить email позже.", reply_markup: { remove_keyboard: true } });
  }

  return json({ ok: true });
}
