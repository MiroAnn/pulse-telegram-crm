"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";

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
  scheduled_at: string | null;
  status: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
};
type Dashboard = {
  customers: Customer[];
  tags: Tag[];
  campaigns: Campaign[];
  stats: { customers: number; reachable: number; campaigns: number; scheduled: number };
};

const emptyDashboard: Dashboard = {
  customers: [],
  tags: [],
  campaigns: [],
  stats: { customers: 0, reachable: 0, campaigns: 0, scheduled: 0 },
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
    return <span className={className}><Image src={`/api/telegram/avatar?path=${encodeURIComponent(customer.avatar_url)}`} alt="" width={size} height={size} unoptimized /></span>;
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

export function AdminDashboard() {
  const [data, setData] = useState<Dashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"customers" | "segments" | "campaigns">("customers");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<number | "all">("all");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [composer, setComposer] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить данные");
        return response.json() as Promise<Dashboard>;
      })
      .then((result) => { if (active) setData(result); })
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : "Ошибка загрузки");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function action(payload: Record<string, unknown>) {
    const response = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
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
          <button className={view === "segments" ? "nav-item active" : "nav-item"} onClick={() => setView("segments")}>
            <span className="nav-icon">◇</span> Сегменты
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
          <label className="global-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по клиентам" /></label>
          <button className="primary-button" onClick={() => setComposer(true)}><span>＋</span> Создать рассылку</button>
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
          {view === "campaigns" && <Campaigns data={data} onCompose={() => setComposer(true)} action={action} />}
        </div>
      </section>

      {selected && <CustomerPanel customer={selected} tags={data.tags} onClose={() => setSelected(null)} onSave={async (tagIds) => { await action({ action: "set-customer-tags", customerId: selected.id, tagIds }); setNotice("Теги клиента обновлены"); }} />}
      {composer && <Composer tags={data.tags} onClose={() => setComposer(false)} onCreate={async (payload) => { await action({ action: "create-campaign", ...payload }); setComposer(false); setView("campaigns"); setNotice("Рассылка добавлена в очередь"); }} />}
    </main>
  );
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

function Campaigns({ data, onCompose, action }: { data: Dashboard; onCompose: () => void; action: (payload: Record<string, unknown>) => Promise<Dashboard> }) {
  return <>
    <div className="page-heading"><div><span className="eyebrow">Коммуникации</span><h1>Рассылки</h1><p>Моментальные и отложенные сообщения вашей аудитории.</p></div><button className="primary-button desktop-only" onClick={onCompose}>＋ Новая рассылка</button></div>
    <div className="campaign-list">{data.campaigns.length === 0 ? <div className="empty-state tall"><span className="empty-mark">↗</span><h3>Здесь появятся рассылки</h3><p>Создайте первое сообщение и выберите аудиторию.</p><button className="primary-button" onClick={onCompose}>Создать рассылку</button></div> : data.campaigns.map((campaign) => <article className="campaign-card" key={campaign.id}><div className={`campaign-status status-${campaign.status}`}>{statusLabels[campaign.status] ?? campaign.status}</div><div className="campaign-main"><strong>{campaign.title}</strong><p>{campaign.message}</p><small>{campaign.status === "scheduled" ? `Отправка ${niceDate(campaign.scheduled_at)}` : `Создана ${niceDate(campaign.created_at)}`}</small></div><div className="campaign-stats"><strong>{campaign.sent_count}</strong><small>отправлено</small>{campaign.failed_count > 0 && <em>{campaign.failed_count} ошибок</em>}</div>{campaign.status === "scheduled" && <button className="more-button" aria-label="Отменить рассылку" onClick={() => void action({ action: "cancel-campaign", campaignId: campaign.id })}>×</button>}</article>)}</div>
  </>;
}

function CustomerPanel({ customer, tags, onClose, onSave }: { customer: Customer; tags: Tag[]; onClose: () => void; onSave: (tagIds: number[]) => Promise<void> }) {
  const [selectedTags, setSelectedTags] = useState(customer.tags.map((tag) => tag.id));
  return <div className="overlay"><aside className="detail-panel"><button className="close-button" onClick={onClose} aria-label="Закрыть">×</button><Avatar customer={customer} large/><h2>{customer.first_name} {customer.last_name}</h2><a href={`https://t.me/${customer.username}`} target="_blank" rel="noreferrer">@{customer.username ?? "без_username"}</a><div className="detail-grid"><div><small>Телефон</small><strong>{customer.phone ?? "Не указан"}</strong></div><div><small>Email</small><strong>{customer.email ?? "Не указан"}</strong></div><div><small>Telegram ID</small><strong>{customer.telegram_id}</strong></div><div><small>В базе с</small><strong>{niceDate(customer.created_at)}</strong></div></div>{customer.quiz && <div className={`quiz-result quiz-result-${customer.quiz.result ?? "active"}`}><small>Анкета «Здоровая спина»</small><strong>{customer.quiz.result === "eligible" ? "Курс подходит" : customer.quiz.result === "consultation" ? "Нужна консультация" : "Анкета не завершена"}</strong>{customer.quiz.details && <p><b>Комментарий клиента:</b><br/>{customer.quiz.details}</p>}</div>}<div className="tag-editor"><h3>Теги клиента</h3>{tags.length === 0 ? <p>Сначала создайте тег в разделе «Сегменты».</p> : tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={() => setSelectedTags((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}/><span className={`tag tag-${tag.color}`}>{tag.name}</span></label>)}</div><button className="primary-button full" onClick={() => void onSave(selectedTags)}>Сохранить изменения</button></aside></div>;
}

function Composer({ tags, onClose, onCreate }: { tags: Tag[]; onClose: () => void; onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [message, setMessage] = useState(""); const [audienceMode, setAudienceMode] = useState("all"); const [included, setIncluded] = useState<number[]>([]); const [excluded, setExcluded] = useState<number[]>([]); const [timing, setTiming] = useState("now"); const [scheduledAt, setScheduledAt] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  function toggle(list: number[], setList: (ids: number[]) => void, id: number) { setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await onCreate({ title, message, audienceMode, includedTagIds: included, excludedTagIds: excluded, sendNow: timing === "now", scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null }); } catch (err) { setError(err instanceof Error ? err.message : "Не удалось создать рассылку"); setBusy(false); } }
  return <div className="overlay composer-overlay"><form className="composer" onSubmit={submit}><header><div><span className="eyebrow">Новое сообщение</span><h2>Создать рассылку</h2></div><button type="button" className="close-button static" onClick={onClose}>×</button></header><div className="composer-body"><label className="field"><span>Название рассылки</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, напоминание о вебинаре" /></label><label className="field"><span>Сообщение</span><textarea required rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Напишите текст, который получат клиенты…"/><small>{message.length} символов</small></label><fieldset><legend>Кому отправить</legend><div className="choice-grid"><label className={audienceMode === "all" ? "choice active" : "choice"}><input type="radio" name="audience" checked={audienceMode === "all"} onChange={() => setAudienceMode("all")}/><strong>Вся база</strong><small>Все активные клиенты</small></label><label className={audienceMode === "tags" ? "choice active" : "choice"}><input type="radio" name="audience" checked={audienceMode === "tags"} onChange={() => setAudienceMode("tags")}/><strong>По тегам</strong><small>Только выбранные группы</small></label></div>{audienceMode === "tags" && <div className="tag-choice"><span>Включить теги</span>{tags.map((tag) => <button type="button" className={included.includes(tag.id) ? `tag tag-${tag.color} selected` : "tag"} key={tag.id} onClick={() => toggle(included, setIncluded, tag.id)}>{tag.name}</button>)}</div>}<div className="tag-choice"><span>Исключить теги <small>(необязательно)</small></span>{tags.length ? tags.map((tag) => <button type="button" className={excluded.includes(tag.id) ? "tag excluded selected" : "tag"} key={tag.id} onClick={() => toggle(excluded, setExcluded, tag.id)}>{tag.name}</button>) : <small>Тегов пока нет</small>}</div></fieldset><fieldset><legend>Когда отправить</legend><div className="timing-row"><label><input type="radio" name="timing" checked={timing === "now"} onChange={() => setTiming("now")}/> Сразу</label><label><input type="radio" name="timing" checked={timing === "later"} onChange={() => setTiming("later")}/> По расписанию</label></div>{timing === "later" && <input className="date-input" type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />}</fieldset>{error && <p className="form-error">{error}</p>}</div><footer><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" disabled={busy}>{busy ? "Сохраняем…" : timing === "now" ? "Отправить сейчас" : "Запланировать"}</button></footer></form></div>;
}
