"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Tag = { id: number; name: string; color: string };
type Customer = {
  id: number;
  telegram_id: string;
  username: string | null;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  status: string;
  is_demo: number;
  created_at: string;
  tags: Tag[];
  quiz: {
    status: string;
    result: "eligible" | "consultation" | null;
    details: string | null;
    answers_json: string;
    completed_at: string | null;
  } | null;
};
type Campaign = {
  id: number;
  title: string;
  message: string;
  audience_mode: string;
  included_tag_ids: string | number[];
  excluded_tag_ids: string | number[];
  scheduled_at: string | null;
  status: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
};
type ChatMessage = {
  id: number;
  telegram_id: string;
  telegram_message_id: number | null;
  direction: "inbound" | "outbound";
  kind: string;
  text: string;
  scenario: string;
  is_unread: number;
  created_at: string;
};
type ScenarioMessage = {
  id: number;
  message_key: string;
  scenario_key: string;
  title: string;
  message: string;
  tag_name: string | null;
  tag_color: string;
  sort_order: number;
  updated_at: string;
};
type Scenario = {
  key: string;
  title: string;
  startParam: string;
  startLink: string;
  messages: ScenarioMessage[];
};
type Dashboard = {
  customers: Customer[];
  tags: Tag[];
  campaigns: Campaign[];
  messages: ChatMessage[];
  scenarios: Scenario[];
  stats: { customers: number; reachable: number; campaigns: number; scheduled: number; unread: number };
};

const emptyDashboard: Dashboard = {
  customers: [],
  tags: [],
  campaigns: [],
  messages: [],
  scenarios: [],
  stats: { customers: 0, reachable: 0, campaigns: 0, scheduled: 0, unread: 0 },
};

const statusLabels: Record<string, string> = {
  scheduled: "Запланирована",
  sending: "Отправляется",
  sent: "Завершена",
  cancelled: "Отменена",
  draft: "Черновик",
};

function initials(customer: Customer) {
  return `${customer.first_name[0] ?? ""}${customer.last_name?.[0] ?? ""}`.toUpperCase();
}

function Avatar({ customer, large = false }: { customer: Customer; large?: boolean }) {
  const className = large ? `profile-avatar avatar-${customer.id % 4}` : `avatar avatar-${customer.id % 4}`;
  if (customer.avatar_url) {
    const size = large ? 72 : 37;
    const src = customer.avatar_url.startsWith("http") ? customer.avatar_url : `/api/telegram/avatar?path=${encodeURIComponent(customer.avatar_url)}`;
    // The same component is also bundled as a static GitHub Pages app, where next/image is unavailable.
    // eslint-disable-next-line @next/next/no-img-element
    return <span className={className}><img src={src} alt="" width={size} height={size} /></span>;
  }
  return <span className={className}>{initials(customer)}</span>;
}

function niceDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function campaignTagIds(value: string | number[] | null | undefined) {
  if (Array.isArray(value)) return value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
}

function datetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AdminDashboard({ apiBase = "", authPassword = "", onUnauthorized }: { apiBase?: string; authPassword?: string; onUnauthorized?: () => void } = {}) {
  const [data, setData] = useState<Dashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"customers" | "chats" | "segments" | "scenarios" | "campaigns">("customers");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<number | "all">("all");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [composer, setComposer] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const apiUrl = useCallback((path: string) => `${apiBase.replace(/\/$/, "")}${path}`, [apiBase]);
  const authHeaders = useMemo<Record<string, string>>(() => authPassword ? { Authorization: `Basic ${btoa(`admin:${authPassword}`)}` } : {}, [authPassword]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch(apiUrl("/api/dashboard"), { cache: "no-store", headers: authHeaders });
        if (response.status === 401) { onUnauthorized?.(); throw new Error("Неверный пароль"); }
        if (!response.ok) throw new Error("Не удалось загрузить данные");
        const result = await response.json() as Dashboard;
        if (active) setData(result);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "Ошибка загрузки");
      } finally {
        if (active) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [apiUrl, authHeaders, onUnauthorized]);

  async function action(payload: Record<string, unknown>) {
    const response = await fetch(apiUrl("/api/dashboard"), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) onUnauthorized?.();
    const result = (await response.json()) as Dashboard & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить");
    setData(result);
    if (selected) {
      setSelected(result.customers.find((item) => item.id === selected.id) ?? null);
    }
    return result;
  }

  const visibleCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.customers.filter((customer) => {
      const haystack = [customer.first_name, customer.last_name, customer.username, customer.phone, customer.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (!needle || haystack.includes(needle)) &&
        (tagFilter === "all" || customer.tags.some((tag) => tag.id === tagFilter));
    });
  }, [data.customers, query, tagFilter]);

  const hasDemo = data.customers.some((customer) => Boolean(customer.is_demo));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">P</span><span>Pulse</span></div>
        <nav className="nav-list" aria-label="Основная навигация">
          <button className={view === "customers" ? "nav-item active" : "nav-item"} onClick={() => setView("customers")}>
            <span className="nav-icon">◎</span> Клиенты <b>{data.stats.customers}</b>
          </button>
          <button className={view === "chats" ? "nav-item active" : "nav-item"} onClick={() => setView("chats")}>
            <span className="nav-icon">◌</span> Чаты <b>{data.stats.unread || ""}</b>
          </button>
          <button className={view === "segments" ? "nav-item active" : "nav-item"} onClick={() => setView("segments")}>
            <span className="nav-icon">◇</span> Сегменты
          </button>
          <button className={view === "scenarios" ? "nav-item active" : "nav-item"} onClick={() => setView("scenarios")}>
            <span className="nav-icon">⌘</span> Сценарии
          </button>
          <button className={view === "campaigns" ? "nav-item active" : "nav-item"} onClick={() => setView("campaigns")}>
            <span className="nav-icon">↗</span> Рассылки <b>{data.stats.scheduled || ""}</b>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="bot-state"><span className="state-dot"/><div><strong>Telegram-бот</strong><small>Ожидает подключения</small></div></div>
          <button className="settings-row"><span>⚙</span> Настройки</button>
          <div className="admin-row"><span className="admin-avatar">Д</span><div><strong>Даша</strong><small>Администратор</small></div></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">P</span> Pulse</div>
          <label className="global-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "chats" ? "Поиск по чатам" : "Поиск по клиентам"} /></label>
          <button className="primary-button" onClick={() => { setEditingCampaign(null); setComposer(true); }}><span>＋</span> Создать рассылку</button>
        </header>

        <div className="content">
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
          {hasDemo && <div className="demo-banner"><span><b>Демонстрационные клиенты</b> помогают посмотреть интерфейс до подключения бота.</span><button onClick={() => void action({ action: "clear-demo" })}>Удалить демо</button></div>}

          {view === "customers" && (
            <>
              <div className="page-heading">
                <div><span className="eyebrow">База аудитории</span><h1>Клиенты</h1><p>Все, кто начал диалог с вашим Telegram-ботом.</p></div>
                {!hasDemo && data.customers.length === 0 && <button className="secondary-button" onClick={() => void action({ action: "seed-demo" })}>Показать демо-данные</button>}
              </div>
              <div className="metrics-grid">
                <article><span className="metric-icon purple">◎</span><div><small>Всего клиентов</small><strong>{data.stats.customers}</strong><em>реальных контактов</em></div></article>
                <article><span className="metric-icon mint">✓</span><div><small>Доступны для связи</small><strong>{data.stats.reachable}</strong><em>бот не заблокирован</em></div></article>
                <article><span className="metric-icon amber">↗</span><div><small>Рассылок</small><strong>{data.stats.campaigns}</strong><em>{data.stats.scheduled} запланировано</em></div></article>
              </div>
              <div className="table-card">
                <div className="table-tools">
                  <div className="filter-pills">
                    <button className={tagFilter === "all" ? "pill active" : "pill"} onClick={() => setTagFilter("all")}>Все</button>
                    {data.tags.map((tag) => <button className={tagFilter === tag.id ? "pill active" : "pill"} key={tag.id} onClick={() => setTagFilter(tag.id)}>{tag.name}</button>)}
                  </div>
                  <span className="count-label">{visibleCustomers.length} контактов</span>
                </div>
                <div className="customer-table">
                  <div className="table-row table-header"><span>Клиент</span><span>Контакты</span><span>Теги</span><span>Добавлен</span><span></span></div>
                  {loading ? <div className="empty-state">Загружаем базу…</div> : visibleCustomers.length === 0 ? (
                    <div className="empty-state"><span className="empty-mark">◎</span><h3>Клиентов пока нет</h3><p>Подключите бота или откройте демо-данные.</p></div>
                  ) : visibleCustomers.map((customer) => (
                    <button className="table-row customer-row" key={customer.id} onClick={() => setSelected(customer)}>
                      <span className="person-cell"><Avatar customer={customer}/><span><strong>{customer.first_name} {customer.last_name}</strong><small>@{customer.username ?? "без_username"}{customer.is_demo ? " · демо" : ""}</small></span></span>
                      <span className="contact-cell"><strong>{customer.phone ?? "Телефон не указан"}</strong><small>{customer.email ?? "Email не указан"}</small></span>
                      <span className="tags-cell">{customer.tags.length ? customer.tags.map((tag) => <i className={`tag tag-${tag.color}`} key={tag.id}>{tag.name}</i>) : <small>Без тегов</small>}</span>
                      <span className="date-cell">{niceDate(customer.created_at)}</span><span className="chevron">›</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {view === "segments" && <Segments data={data} action={action} />}
          {view === "scenarios" && <Scenarios data={data} action={action} onNotice={setNotice} />}
          {view === "campaigns" && <Campaigns data={data} onCompose={() => { setEditingCampaign(null); setComposer(true); }} onEdit={(campaign) => { setEditingCampaign(campaign); setComposer(true); }} action={action} />}
          {view === "chats" && <Chats data={data} query={query} selectedChat={selectedChat} onSelect={async (telegramId) => { setSelectedChat(telegramId); await action({ action: "mark-chat-read", telegramId }); }} onSend={async (telegramId, message) => { await action({ action: "send-chat-message", telegramId, message }); setNotice("Сообщение отправлено"); }} />}
        </div>
      </section>

      {selected && <CustomerPanel customer={selected} tags={data.tags} onClose={() => setSelected(null)} onSave={async (tagIds) => { await action({ action: "set-customer-tags", customerId: selected.id, tagIds }); setNotice("Теги клиента обновлены"); }} />}
      {composer && <Composer key={editingCampaign?.id ?? "new"} tags={data.tags} campaign={editingCampaign} onClose={() => { setComposer(false); setEditingCampaign(null); }} onSave={async (payload) => { await action({ action: editingCampaign ? "update-campaign" : "create-campaign", campaignId: editingCampaign?.id, ...payload }); setComposer(false); setEditingCampaign(null); setView("campaigns"); setNotice(editingCampaign ? "Рассылка обновлена" : "Рассылка добавлена в очередь"); }} />}
    </main>
  );
}

function scenarioPreview(message: string) {
  return message.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}

function Scenarios({ data, action, onNotice }: { data: Dashboard; action: (payload: Record<string, unknown>) => Promise<Dashboard>; onNotice: (message: string) => void }) {
  const [editing, setEditing] = useState<ScenarioMessage | null>(null);
  const [copied, setCopied] = useState("");

  async function copyLink(scenario: Scenario) {
    try {
      await navigator.clipboard.writeText(scenario.startLink);
      setCopied(scenario.key);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      onNotice("Не удалось скопировать ссылку — её можно выделить вручную");
    }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">Автоматизация бота</span><h1>Сценарии</h1><p>Стартовые ссылки, сообщения и теги, которые бот назначает клиентам.</p></div></div>
    <div className="scenario-list">
      {data.scenarios.map((scenario) => <section className="scenario-card" key={scenario.key}>
        <header className="scenario-header"><div><span className="scenario-mark">⌘</span><div><h2>{scenario.title}</h2><span>{scenario.messages.length} сообщений</span></div></div><div className="scenario-link"><code>/start={scenario.startParam}</code><a href={scenario.startLink} target="_blank" rel="noreferrer">Открыть</a><button type="button" onClick={() => void copyLink(scenario)}>{copied === scenario.key ? "Скопировано" : "Копировать"}</button></div></header>
        <div className="scenario-flow">{scenario.messages.map((item, index) => <article className="scenario-message" key={item.message_key}><span className="scenario-step">{index + 1}</span><div className="scenario-message-body"><div className="scenario-message-title"><strong>{item.title}</strong>{item.tag_name && <i className={`tag tag-${item.tag_color}`}>＋ {item.tag_name}</i>}</div><p>{scenarioPreview(item.message)}</p><small>{item.message_key.startsWith("quiz_q") ? "Кнопки «Да» и «Нет» добавляются автоматически" : item.message_key === "quiz_eligible" ? "Кнопка перехода к тарифам добавляется автоматически" : item.tag_name ? "Тег назначается после отправки этого сообщения" : "Сообщение отправляется автоматически"}</small></div><button className="edit-button" onClick={() => setEditing(item)}>Редактировать</button></article>)}</div>
      </section>)}
    </div>
    {editing && <ScenarioMessageEditor message={editing} onClose={() => setEditing(null)} onSave={async (message) => { await action({ action: "update-scenario-message", messageKey: editing.message_key, message }); setEditing(null); onNotice("Текст сообщения обновлён"); }} />}
  </>;
}

function ScenarioMessageEditor({ message, onClose, onSave }: { message: ScenarioMessage; onClose: () => void; onSave: (message: string) => Promise<void> }) {
  const [text, setText] = useState(message.message);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await onSave(text); } catch (err) { setError(err instanceof Error ? err.message : "Не удалось сохранить текст"); setBusy(false); } }
  return <div className="overlay composer-overlay"><form className="composer scenario-editor" onSubmit={submit}><header><div><span className="eyebrow">Сообщение сценария</span><h2>{message.title}</h2></div><button type="button" className="close-button static" onClick={onClose}>×</button></header><div className="composer-body"><label className="field"><span>Текст сообщения</span><textarea required rows={12} maxLength={4096} value={text} onChange={(event) => setText(event.target.value)}/><small>{text.length} / 4096</small></label>{message.tag_name && <div className="scenario-tag-note"><span>После сообщения назначается тег</span><i className={`tag tag-${message.tag_color}`}>{message.tag_name}</i></div>}<p className="editor-hint">Можно использовать форматирование Telegram: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt; и &lt;a href=&quot;ссылка&quot;&gt;текст ссылки&lt;/a&gt;. Кнопки сценария сохранятся автоматически.</p>{error && <p className="form-error">{error}</p>}</div><footer><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" disabled={busy || !text.trim()}>{busy ? "Сохраняем…" : "Сохранить текст"}</button></footer></form></div>;
}

function Chats({ data, query, selectedChat, onSelect, onSend }: {
  data: Dashboard;
  query: string;
  selectedChat: string | null;
  onSelect: (telegramId: string) => Promise<void>;
  onSend: (telegramId: string, message: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conversations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.customers
      .map((customer) => {
        const messages = data.messages.filter((message) => message.telegram_id === customer.telegram_id);
        const last = messages[messages.length - 1];
        const unread = messages.filter((message) => message.direction === "inbound" && Boolean(message.is_unread)).length;
        return { customer, messages, last, unread };
      })
      .filter((chat) => chat.last && (!needle || [chat.customer.first_name, chat.customer.last_name, chat.customer.username, chat.last.text].filter(Boolean).join(" ").toLowerCase().includes(needle)))
      .sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime());
  }, [data.customers, data.messages, query]);
  const activeId = selectedChat ?? conversations[0]?.customer.telegram_id ?? null;
  const active = conversations.find((chat) => chat.customer.telegram_id === activeId) ?? null;

  useEffect(() => {
    if (!selectedChat && conversations[0]) void onSelect(conversations[0].customer.telegram_id);
  }, [conversations, onSelect, selectedChat]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!active || !draft.trim()) return;
    setBusy(true); setError("");
    try { await onSend(active.customer.telegram_id, draft.trim()); setDraft(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Не удалось отправить"); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">Входящие сообщения</span><h1>Чаты</h1><p>Здесь появляются вопросы и сообщения, которые требуют вашего ответа.</p></div></div>
    {conversations.length === 0 ? <div className="empty-state tall"><span className="empty-mark">◌</span><h3>Новых диалогов пока нет</h3><p>Когда клиент напишет боту вне сценария, сообщение появится здесь.</p></div> : <div className="chat-layout">
      <aside className="chat-list" aria-label="Список чатов">
        {conversations.map((chat) => <button key={chat.customer.telegram_id} className={activeId === chat.customer.telegram_id ? "chat-list-item active" : "chat-list-item"} onClick={() => void onSelect(chat.customer.telegram_id)}>
          <Avatar customer={chat.customer}/><span className="chat-list-copy"><strong>{chat.customer.first_name} {chat.customer.last_name}</strong><small>{chat.last.text}</small></span><span className="chat-list-meta"><time>{niceDate(chat.last.created_at)}</time>{chat.unread > 0 && <b>{chat.unread}</b>}</span>
        </button>)}
      </aside>
      {active && <section className="chat-window">
        <header><Avatar customer={active.customer}/><div><strong>{active.customer.first_name} {active.customer.last_name}</strong><small>@{active.customer.username ?? "без_username"}</small></div></header>
        <div className="message-stream">
          {active.messages.map((message) => <div key={message.id} className={message.direction === "outbound" ? "message-row outbound" : "message-row inbound"}><div className="message-bubble"><p>{message.text}</p><small>{message.kind !== "text" ? `${message.kind} · ` : ""}{niceDate(message.created_at)}</small></div></div>)}
        </div>
        <form className="chat-reply" onSubmit={submit}><textarea aria-label="Ответ клиенту" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Напишите ответ…"/><button className="primary-button" disabled={busy || !draft.trim()}>{busy ? "Отправляем…" : "Отправить"}</button>{error && <p className="form-error">{error}</p>}</form>
      </section>}
    </div>}
  </>;
}

function Segments({ data, action }: { data: Dashboard; action: (payload: Record<string, unknown>) => Promise<Dashboard> }) {
  const [name, setName] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if (!name.trim()) return; await action({ action: "create-tag", name, color: ["violet", "mint", "amber"][data.tags.length % 3] }); setName(""); }
  return <>
    <div className="page-heading"><div><span className="eyebrow">Умные группы</span><h1>Сегменты</h1><p>Теги помогают направлять сообщения только нужным клиентам.</p></div></div>
    <div className="segment-layout">
      <form className="create-tag-card" onSubmit={submit}><span className="metric-icon purple">＋</span><h3>Новый тег</h3><p>Например: «Курс осанки», «VIP» или «Не отправлять акции».</p><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Название тега" /><button className="primary-button">Создать тег</button></form>
      <div className="segments-list">{data.tags.length === 0 ? <div className="empty-state"><h3>Тегов пока нет</h3></div> : data.tags.map((tag) => { const count = data.customers.filter((customer) => customer.tags.some((item) => item.id === tag.id)).length; return <article key={tag.id}><i className={`tag-dot tag-${tag.color}`}/><div><strong>{tag.name}</strong><small>{count} {count === 1 ? "клиент" : "клиентов"}</small></div><span>›</span></article>; })}</div>
    </div>
  </>;
}

function Campaigns({ data, onCompose, onEdit, action }: { data: Dashboard; onCompose: () => void; onEdit: (campaign: Campaign) => void; action: (payload: Record<string, unknown>) => Promise<Dashboard> }) {
  return <>
    <div className="page-heading"><div><span className="eyebrow">Коммуникации</span><h1>Рассылки</h1><p>Моментальные и отложенные сообщения вашей аудитории.</p></div><button className="primary-button desktop-only" onClick={onCompose}>＋ Новая рассылка</button></div>
    <div className="campaign-list">{data.campaigns.length === 0 ? <div className="empty-state tall"><span className="empty-mark">↗</span><h3>Здесь появятся рассылки</h3><p>Создайте первое сообщение и выберите аудиторию.</p><button className="primary-button" onClick={onCompose}>Создать рассылку</button></div> : data.campaigns.map((campaign) => <article className="campaign-card" key={campaign.id}><div className={`campaign-status status-${campaign.status}`}>{statusLabels[campaign.status] ?? campaign.status}</div><div className="campaign-main"><strong>{campaign.title}</strong><p>{campaign.message}</p><small>{campaign.status === "scheduled" ? `Отправка ${niceDate(campaign.scheduled_at)}` : `Создана ${niceDate(campaign.created_at)}`}</small></div><div className="campaign-stats"><strong>{campaign.sent_count}</strong><small>отправлено</small>{campaign.failed_count > 0 && <em>{campaign.failed_count} ошибок</em>}</div>{campaign.status === "scheduled" && <div className="campaign-actions"><button className="edit-button" onClick={() => onEdit(campaign)}>Редактировать</button><button className="more-button" aria-label="Отменить рассылку" title="Отменить рассылку" onClick={() => void action({ action: "cancel-campaign", campaignId: campaign.id })}>×</button></div>}</article>)}</div>
  </>;
}

function CustomerPanel({ customer, tags, onClose, onSave }: { customer: Customer; tags: Tag[]; onClose: () => void; onSave: (tagIds: number[]) => Promise<void> }) {
  const [selectedTags, setSelectedTags] = useState(customer.tags.map((tag) => tag.id));
  return <div className="overlay"><aside className="detail-panel"><button className="close-button" onClick={onClose} aria-label="Закрыть">×</button><Avatar customer={customer} large/><h2>{customer.first_name} {customer.last_name}</h2><a href={`https://t.me/${customer.username}`} target="_blank" rel="noreferrer">@{customer.username ?? "без_username"}</a><div className="detail-grid"><div><small>Телефон</small><strong>{customer.phone ?? "Не указан"}</strong></div><div><small>Email</small><strong>{customer.email ?? "Не указан"}</strong></div><div><small>Telegram ID</small><strong>{customer.telegram_id}</strong></div><div><small>В базе с</small><strong>{niceDate(customer.created_at)}</strong></div></div>{customer.quiz && <div className={`quiz-result quiz-result-${customer.quiz.result ?? "active"}`}><small>Анкета «Здоровая спина»</small><strong>{customer.quiz.result === "eligible" ? "Курс подходит" : customer.quiz.result === "consultation" ? "Нужна консультация" : "Анкета не завершена"}</strong>{customer.quiz.details && <p><b>Комментарий клиента:</b><br/>{customer.quiz.details}</p>}</div>}<div className="tag-editor"><h3>Теги клиента</h3>{tags.length === 0 ? <p>Сначала создайте тег в разделе «Сегменты».</p> : tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={() => setSelectedTags((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}/><span className={`tag tag-${tag.color}`}>{tag.name}</span></label>)}</div><button className="primary-button full" onClick={() => void onSave(selectedTags)}>Сохранить изменения</button></aside></div>;
}

function Composer({ tags, campaign, onClose, onSave }: { tags: Tag[]; campaign: Campaign | null; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [title, setTitle] = useState(campaign?.title ?? ""); const [message, setMessage] = useState(campaign?.message ?? ""); const [audienceMode, setAudienceMode] = useState(campaign?.audience_mode ?? "all"); const [included, setIncluded] = useState<number[]>(campaignTagIds(campaign?.included_tag_ids)); const [excluded, setExcluded] = useState<number[]>(campaignTagIds(campaign?.excluded_tag_ids)); const [timing, setTiming] = useState(campaign ? "later" : "now"); const [scheduledAt, setScheduledAt] = useState(datetimeLocal(campaign?.scheduled_at ?? null)); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  function toggle(list: number[], setList: (ids: number[]) => void, id: number) { setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await onSave({ title, message, audienceMode, includedTagIds: included, excludedTagIds: excluded, sendNow: timing === "now", scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null }); } catch (err) { setError(err instanceof Error ? err.message : "Не удалось сохранить рассылку"); setBusy(false); } }
  return <div className="overlay composer-overlay"><form className="composer" onSubmit={submit}><header><div><span className="eyebrow">{campaign ? "Запланированное сообщение" : "Новое сообщение"}</span><h2>{campaign ? "Редактировать рассылку" : "Создать рассылку"}</h2></div><button type="button" className="close-button static" onClick={onClose}>×</button></header><div className="composer-body"><label className="field"><span>Название рассылки</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, напоминание о вебинаре" /></label><label className="field"><span>Сообщение</span><textarea required rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Напишите текст, который получат клиенты…"/><small>{message.length} символов</small></label><fieldset><legend>Кому отправить</legend><div className="choice-grid"><label className={audienceMode === "all" ? "choice active" : "choice"}><input type="radio" name="audience" checked={audienceMode === "all"} onChange={() => setAudienceMode("all")}/><strong>Вся база</strong><small>Все активные клиенты</small></label><label className={audienceMode === "tags" ? "choice active" : "choice"}><input type="radio" name="audience" checked={audienceMode === "tags"} onChange={() => setAudienceMode("tags")}/><strong>По тегам</strong><small>Только выбранные группы</small></label></div>{audienceMode === "tags" && <div className="tag-choice"><span>Включить теги</span>{tags.map((tag) => <button type="button" className={included.includes(tag.id) ? `tag tag-${tag.color} selected` : "tag"} key={tag.id} onClick={() => toggle(included, setIncluded, tag.id)}>{tag.name}</button>)}</div>}<div className="tag-choice"><span>Исключить теги <small>(необязательно)</small></span>{tags.length ? tags.map((tag) => <button type="button" className={excluded.includes(tag.id) ? "tag excluded selected" : "tag"} key={tag.id} onClick={() => toggle(excluded, setExcluded, tag.id)}>{tag.name}</button>) : <small>Тегов пока нет</small>}</div></fieldset><fieldset><legend>Когда отправить</legend><div className="timing-row"><label><input type="radio" name="timing" checked={timing === "now"} onChange={() => setTiming("now")}/> Сразу</label><label><input type="radio" name="timing" checked={timing === "later"} onChange={() => setTiming("later")}/> По расписанию</label></div>{timing === "later" && <input className="date-input" type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />}</fieldset>{error && <p className="form-error">{error}</p>}</div><footer><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" disabled={busy}>{busy ? "Сохраняем…" : campaign ? (timing === "now" ? "Сохранить и отправить" : "Сохранить изменения") : (timing === "now" ? "Отправить сейчас" : "Запланировать")}</button></footer></form></div>;
}
