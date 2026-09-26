import { FormEvent, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminDashboard } from "../app/AdminDashboard";
import "../app/globals.css";

declare global { interface Window { PULSE_API_URL?: string; PULSE_ADMIN_TITLE?: string } }

function PagesApp() {
  const storageKey = `pulse-admin-password:${window.PULSE_API_URL || "local"}`;
  const [password, setPassword] = useState(() => sessionStorage.getItem(storageKey) || "");
  const [draft, setDraft] = useState("");
  const clearPassword = useCallback(() => { sessionStorage.removeItem(storageKey); setPassword(""); }, [storageKey]);
  if (password) return <AdminDashboard apiBase={window.PULSE_API_URL || ""} authPassword={password} onUnauthorized={clearPassword} />;
  function submit(event: FormEvent) { event.preventDefault(); const value = draft.trim(); if (!value) return; sessionStorage.setItem(storageKey, value); setPassword(value); }
  return <main className="login-shell"><form className="login-card" onSubmit={submit}><span className="brand-mark">P</span><h1>{window.PULSE_ADMIN_TITLE || "Вход в Pulse"}</h1><p>Админка содержит персональные данные подписчиков. Введите пароль администратора.</p><label><span>Пароль администратора</span><input type="password" autoComplete="current-password" required value={draft} onChange={(event) => setDraft(event.target.value)} /></label><button className="primary-button">Войти</button></form></main>;
}

createRoot(document.getElementById("root")!).render(<PagesApp />);
