import { useEffect, useState } from "react";
import type { Settings } from "../types";
import { IFolder, ILink, ISpinner, ICheck, IAlert, IX, IBolt } from "./icons";

interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => Promise<boolean>;
  onTestProxy: (proxy: string) => Promise<{ ok: boolean; ms: number }>;
}

const PROXY_RE = /^(socks5h?|https?):\/\//i;

export default function SettingsModal({ open, settings, onClose, onSave, onTestProxy }: Props) {
  const [form, setForm] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [proxyErr, setProxyErr] = useState("");
  const [test, setTest] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  const [testMs, setTestMs] = useState(0);

  useEffect(() => {
    if (open) {
      setForm(settings);
      setProxyErr("");
      setTest("idle");
    }
  }, [open, settings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (form.proxy && !PROXY_RE.test(form.proxy)) {
      setProxyErr("Формат: socks5://host:port или http://host:port");
      return;
    }
    setProxyErr("");
    setSaving(true);
    const ok = await onSave({ ...form, max_retries: Math.min(10, Math.max(1, form.max_retries)) });
    setSaving(false);
    if (ok) onClose();
  };

  const runTest = async () => {
    if (!form.proxy) return;
    if (!PROXY_RE.test(form.proxy)) {
      setProxyErr("Формат: socks5://host:port или http://host:port");
      return;
    }
    setProxyErr("");
    setTest("busy");
    const r = await onTestProxy(form.proxy);
    setTest(r.ok ? "ok" : "fail");
    setTestMs(r.ms);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/55 backdrop-blur-[3px] dark:bg-black/65" onClick={onClose} />
      <div className="modal-in panel nice-scroll relative max-h-[90vh] w-full max-w-xl overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink dark:text-mist">Настройки</h2>
            <p className="mt-0.5 text-xs text-soft dark:text-dim">Сохраняются в SQLite и переживают перезапуск приложения</p>
          </div>
          <button className="btn !px-2" onClick={onClose} aria-label="Закрыть">
            <IX size={14} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* root folder */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-ink uppercase dark:text-mist">
              <IFolder size={13} className="text-pixiv" /> Корневая папка загрузок
            </label>
            <input
              className="input font-mono !text-[13px]"
              value={form.download_root}
              onChange={(e) => set("download_root", e.target.value)}
              placeholder="D:\Pixiv\downloads или ./downloads"
              spellCheck={false}
            />
            <p className="mt-1 text-[11.5px] text-soft dark:text-faint">
              Файлы складываются в <span className="font-mono">{"{папка}/pixiv/{тег из ссылки}/"}</span>
            </p>
          </div>

          {/* proxy */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-ink uppercase dark:text-mist">
              <ILink size={13} className="text-pixiv" /> Прокси
            </label>
            <div className="flex gap-2">
              <input
                className={`input flex-1 font-mono !text-[13px] ${proxyErr ? "!border-coral focus:!ring-coral/25" : ""}`}
                value={form.proxy}
                onChange={(e) => set("proxy", e.target.value.trim())}
                placeholder="socks5://127.0.0.1:1080 · http://user:pass@host:3128"
                spellCheck={false}
              />
              <button className="btn shrink-0" onClick={runTest} disabled={!form.proxy || test === "busy"}>
                {test === "busy" ? <ISpinner size={13} /> : <IBolt size={13} />}
                Тест
              </button>
            </div>
            {proxyErr && <p className="mt-1 text-[11.5px] font-semibold text-coral">{proxyErr}</p>}
            {test === "ok" && (
              <p className="mt-1 flex items-center gap-1 text-[11.5px] font-semibold text-mint">
                <ICheck size={12} /> Прокси отвечает за {testMs} мс — скорость будет считаться корректно
              </p>
            )}
            {test === "fail" && (
              <p className="mt-1 flex items-center gap-1 text-[11.5px] font-semibold text-coral">
                <IAlert size={12} /> Не удалось подключиться через прокси
              </p>
            )}
          </div>

          {/* cookies */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-ink uppercase dark:text-mist">
              <IFolder size={13} className="text-pixiv" /> Авторизация Pixiv — cookies.txt
            </label>
            <input
              className="input font-mono !text-[13px]"
              value={form.cookies_path}
              onChange={(e) => set("cookies_path", e.target.value)}
              placeholder="C:\pixiv\cookies.txt (формат Netscape)"
              spellCheck={false}
            />
            <p className="mt-1 text-[11.5px] leading-relaxed text-soft dark:text-faint">
              Экспорт из браузера (расширение «Get cookies.txt LOCALLY»). Без cookies поиск и профили могут быть недоступны.
            </p>
          </div>

          {/* retries + show completed */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-bold tracking-wide text-ink uppercase dark:text-mist">
                Повторы при ошибке файла
              </label>
              <div className="flex items-center gap-2">
                <button className="btn !px-3" onClick={() => set("max_retries", Math.max(1, form.max_retries - 1))}>
                  −
                </button>
                <span className="w-10 text-center font-mono text-sm font-bold text-ink dark:text-mist">{form.max_retries}</span>
                <button className="btn !px-3" onClick={() => set("max_retries", Math.min(10, form.max_retries + 1))}>
                  +
                </button>
                <span className="text-[11.5px] text-soft dark:text-faint">по умолчанию 5</span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-bold tracking-wide text-ink uppercase dark:text-mist">
                Завершённые задачи
              </label>
              <label className="flex cursor-pointer items-center gap-2 pt-1 select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.show_completed}
                  data-on={form.show_completed}
                  onClick={() => set("show_completed", !form.show_completed)}
                  className={`switch ${
                    form.show_completed
                      ? "border-pixivdim bg-pixiv"
                      : "border-linehi bg-card2 dark:border-edgehi dark:bg-deep"
                  }`}
                />
                <span className="text-[13px] font-semibold text-ink dark:text-mist">Показывать в списке</span>
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4 dark:border-edge">
          <button className="btn" onClick={onClose}>
            <IX size={13} /> Отмена
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <ISpinner size={13} /> : <ICheck size={13} />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
