const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = (process.env.LOCAL_APP_URL || "http://localhost:3001").replace(/\/$/, "");
const adminKey = process.env.LOCAL_ADMIN_KEY || "";

if (!token) {
  console.error("Не найден TELEGRAM_BOT_TOKEN. Скопируйте .env.example в .dev.vars и добавьте токен.");
  process.exit(1);
}

let offset = 0;
let stopped = false;

async function api(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || `Telegram API: ${response.status}`);
  return result.result;
}

async function forward(update) {
  const response = await fetch(`${appUrl}/api/telegram/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error(`Админка вернула ${response.status}`);
}

async function tick() {
  try {
    const response = await fetch(`${appUrl}/api/worker/tick`, {
      method: "POST",
      headers: adminKey ? { "x-admin-key": adminKey } : {},
    });
    const result = await response.json();
    if (result.processed) console.log(`Рассылка обработана: отправлено ${result.sent}, ошибок ${result.failed}`);
  } catch (error) {
    console.error("Планировщик:", error.message);
  }
}

async function poll() {
  console.log(`Бот запущен. Админка: ${appUrl}`);
  await api("deleteWebhook", { drop_pending_updates: false });
  let lastTick = 0;

  while (!stopped) {
    try {
      const updates = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
      for (const update of updates) {
        offset = update.update_id + 1;
        await forward(update);
      }
      if (Date.now() - lastTick > 10000) {
        await tick();
        lastTick = Date.now();
      }
    } catch (error) {
      console.error("Повторное подключение:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
await poll();
