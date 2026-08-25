import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry, Settings, Task, Toast } from "./types";
import { DEFAULT_SETTINGS, STATUS_LABEL } from "./types";
import { api } from "./lib/api";
import { DemoEngine } from "./lib/demo";
import { formatSpeed } from "./lib/format";
import TopBar from "./components/TopBar";
import TaskCard from "./components/TaskCard";
import LogsPanel from "./components/LogsPanel";
import SettingsModal from "./components/SettingsModal";
import Toasts from "./components/Toasts";
import { IDownload, ISpinner } from "./components/icons";

const SAMPLE_LINKS = [
  "https://www.pixiv.net/en/tags/初音ミク/artworks",
  "https://www.pixiv.net/en/users/2033916/illustrations",
  "https://www.pixiv.net/search?q=猫&s_mode=tag&type=artwork&r=1",
];

const THEME_KEY = "pixiv-loader-theme";

/** Обновляем состояние только при реальном изменении данных, чтобы опрос
 *  сервера не вызывал лишних перерисовок (и не сбивал ввод в открытых окнах). */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function App() {
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem(THEME_KEY) as "dark" | "light" | null) || "dark",
  );
  const [toasts, setToasts] = useState<Toast[]>([]);

  const engineRef = useRef<DemoEngine | null>(null);
  if (!engineRef.current) engineRef.current = new DemoEngine();
  const engine = engineRef.current;

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const lastLogId = useRef(0);
  const toastId = useRef(1);

  /* ---------------- toasts ---------------- */
  const toast = (kind: Toast["kind"], text: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };

  /* ---------------- theme ---------------- */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  /* ---------------- demo engine ---------------- */
  useEffect(() => {
    engine.subscribe((s) => {
      if (modeRef.current !== "demo") return;
      setTasks((prev) => (sameJson(prev, s.tasks) ? prev : s.tasks));
      setLogs((prev) => (sameJson(prev, s.logs) ? prev : s.logs));
      setSettings((prev) => (sameJson(prev, s.settings) ? prev : s.settings));
    });
    engine.start();
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- server probing ---------------- */
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await api.probe();
        if (!cancelled && modeRef.current === "demo") {
          lastLogId.current = 0;
          setLogs([]);
          setMode("live");
          toast("success", "Подключено к серверу http://127.0.0.1:8002");
        }
      } catch {
        if (!cancelled && modeRef.current === "live") {
          setMode("demo");
          toast("warn", "Связь с сервером потеряна — включён демо-режим");
        }
      }
    };
    check();
    const t = window.setInterval(check, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- live polling ---------------- */
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const [st, lg] = await Promise.all([api.state(), api.logs(lastLogId.current)]);
        if (cancelled) return;
        setTasks((prev) => (sameJson(prev, st.tasks) ? prev : st.tasks));
        setSettings((prev) => (sameJson(prev, st.settings) ? prev : st.settings));
        if (lg.logs.length) {
          lastLogId.current = lg.logs[lg.logs.length - 1].id;
          // бэкенд отдаёт ts в unix-секундах — приводим к миллисекундам
          const norm = lg.logs.map((l) => ({ ...l, ts: l.ts < 1e12 ? l.ts * 1000 : l.ts }));
          setLogs((prev) => [...prev, ...norm].slice(-300));
        }
      } catch {
        /* обрыв обработает probing */
      }
    };
    refresh();
    const t = window.setInterval(refresh, 700);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [mode]);

  const refreshNow = async () => {
    try {
      const st = await api.state();
      setTasks(st.tasks);
      setSettings(st.settings);
    } catch {
      /* ignore */
    }
  };

  /* ---------------- actions ---------------- */
  const handleAdd = async () => {
    const u = url.trim();
    if (!u || adding) return;
    setAdding(true);
    try {
      if (mode === "live") {
        const r = await api.addTask(u);
        if (!r.ok) {
          toast("warn", r.error || "Задача не добавлена");
        } else {
          toast("success", `Добавлено в очередь: ${r.task?.label ?? u}`);
          setUrl("");
          await refreshNow();
        }
      } else {
        const r = engine.addTask(u);
        if (!r.ok) toast("warn", r.error || "Задача не добавлена");
        else {
          toast("success", `Добавлено в очередь: ${r.task?.label}`);
          setUrl("");
        }
      }
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Не удалось добавить задачу");
    } finally {
      setAdding(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        toast("info", "Ссылка вставлена из буфера обмена");
      } else {
        toast("warn", "Буфер обмена пуст");
      }
    } catch {
      toast("error", "Нет доступа к буферу обмена — вставьте ссылку вручную (Ctrl+V)");
    }
  };

  const act = async (live: () => Promise<unknown>, demo: () => void, okMsg?: string) => {
    try {
      if (mode === "live") {
        await live();
        await refreshNow();
      } else {
        demo();
      }
      if (okMsg) toast("success", okMsg);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Действие не выполнено");
    }
  };

  const onPause = (id: number) => act(() => api.pause(id), () => engine.pause(id));
  const onResume = (id: number) => act(() => api.resume(id), () => engine.resume(id));
  const onRestart = (id: number) => act(() => api.restart(id), () => engine.restart(id), "Задача перезапущена");
  const onRemove = (id: number) => act(() => api.remove(id), () => engine.remove(id), "Задача удалена");

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("success", "Ссылка скопирована в буфер обмена");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("success", "Ссылка скопирована в буфер обмена");
    }
  };

  const saveSettings = async (next: Settings): Promise<boolean> => {
    try {
      if (mode === "live") {
        const r = await api.saveSettings(next);
        setSettings(r.settings);
      } else {
        engine.updateSettings(next);
        setSettings(next);
      }
      toast("success", "Настройки сохранены в БД");
      return true;
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Не удалось сохранить настройки");
      return false;
    }
  };

  const testProxy = async (proxy: string) => {
    if (mode === "live") {
      const r = await api.testProxy(proxy);
      return { ok: r.ok, ms: r.ms };
    }
    return engine.testProxy(proxy);
  };

  const toggleShowCompleted = () => {
    void saveSettings({ ...settings, show_completed: !settings.show_completed });
  };

  const clearCompleted = () => {
    void act(() => api.clearCompleted(), () => engine.clearCompleted(), "Завершённые скрыты из интерфейса");
  };

  const handleExit = async () => {
    if (mode === "live") {
      try {
        await api.shutdown();
        toast("info", "Сервер останавливается: прогресс сохранён в БД");
      } catch {
        toast("error", "Сервер не ответил на команду остановки");
      }
    } else if (engine.stopped) {
      engine.restartServer();
      toast("info", "Демо-сервер запущен повторно");
    } else {
      engine.shutdown();
      toast("info", "Остановка: задачи на паузе, состояние сохранено");
    }
  };

  const clearLogs = () => {
    if (mode === "live") {
      api.clearLogs().then(() => setLogs([])).catch(() => setLogs([]));
    } else {
      engine.logs = [];
      setLogs([]);
    }
  };

  /* ---------------- derived ---------------- */
  const visibleTasks = useMemo(
    () => tasks.filter((t) => !t.hidden && (settings.show_completed || t.status !== "completed")),
    [tasks, settings.show_completed],
  );
  const completedVisible = useMemo(() => visibleTasks.filter((t) => t.status === "completed").length, [visibleTasks]);

  const stats = useMemo(() => {
    const by = (s: Task["status"]) => tasks.filter((t) => !t.hidden && t.status === s).length;
    const speed = tasks.reduce((acc, t) => acc + (t.status === "downloading" ? t.speed : 0), 0);
    const done = tasks.reduce((acc, t) => acc + t.done_files, 0);
    const total = tasks.reduce((acc, t) => acc + t.total_files, 0);
    return {
      queued: by("queued"),
      downloading: by("downloading"),
      paused: by("paused"),
      error: by("error"),
      completed: by("completed"),
      speed,
      done,
      total,
    };
  }, [tasks]);

  const activeTask = tasks.find((t) => t.status === "downloading");

  return (
    <div className="min-h-screen font-body text-[14px] text-ink dark:text-mist">
      <div className="app-bg">
        <div className="app-glow" style={{ width: 480, height: 480, left: "-8%", top: "-12%", background: "rgba(0,150,250,0.16)" }} />
        <div className="app-glow" style={{ width: 380, height: 380, right: "-6%", bottom: "-10%", background: "rgba(23,195,178,0.13)", animationDelay: "-8s" }} />
      </div>

      <Toasts toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
        onTestProxy={testProxy}
      />

      <div className="mx-auto max-w-[1440px] px-3 py-4 sm:px-5 sm:py-6">
        <TopBar
          url={url}
          onUrlChange={setUrl}
          onAdd={handleAdd}
          adding={adding}
          onPaste={handlePaste}
          mode={mode}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onOpenSettings={() => setSettingsOpen(true)}
          onExit={handleExit}
          showCompleted={settings.show_completed}
          onToggleShowCompleted={toggleShowCompleted}
          onClearCompleted={clearCompleted}
          completedVisible={completedVisible}
        />

        {/* queue stats strip */}
        <div className="panel rise-in mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5" style={{ animationDelay: "40ms" }}>
          <span className="font-display text-[11px] font-bold tracking-[0.14em] text-soft dark:text-faint">ОЧЕРЕДЬ</span>
          {(
            [
              ["queued", "text-faint", "bg-faint"],
              ["downloading", "text-pixiv", "bg-pixiv"],
              ["paused", "text-amberx", "bg-amberx"],
              ["error", "text-coral", "bg-coral"],
              ["completed", "text-mint", "bg-mint"],
            ] as Array<[Task["status"], string, string]>
          ).map(([s, text, dot]) => (
            <span key={s} className={`flex items-center gap-1.5 text-[12.5px] font-semibold ${text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dot} ${s === "downloading" ? "pulse-dot" : ""}`} />
              {STATUS_LABEL[s]} <span className="font-mono">{stats[s]}</span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-4 font-mono text-[12px] text-soft dark:text-dim">
            {activeTask && (
              <span className="flex items-center gap-1.5 text-teal">
                <IDownload size={13} />
                {formatSpeed(stats.speed)}
              </span>
            )}
            <span>
              {stats.done} / {stats.total} файлов
            </span>
          </span>
        </div>

        {/* main grid */}
        <main className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_370px]">
          <section className="flex min-w-0 flex-col gap-3">
            {visibleTasks.length === 0 && tasks.length === 0 && (
              <div className="panel rise-in flex flex-col items-center px-6 py-14 text-center">
                <svg width="120" height="90" viewBox="0 0 120 90" fill="none" aria-hidden="true">
                  <rect x="18" y="52" width="84" height="26" rx="6" fill="rgba(0,150,250,0.12)" stroke="#0096fa" strokeWidth="2" />
                  <path d="M30 52v-6a4 4 0 0 1 4-4h52a4 4 0 0 1 4 4v6" stroke="#0096fa" strokeWidth="2" strokeLinecap="round" />
                  <path d="M60 10v26m0 0-9-9m9 9 9-9" stroke="#0096fa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="16" cy="20" r="3" fill="#17c3b2" />
                  <circle cx="104" cy="14" r="2.4" fill="#ffb224" />
                  <circle cx="100" cy="34" r="1.8" fill="#0096fa" />
                  <circle cx="22" cy="38" r="1.8" fill="#ff5470" />
                </svg>
                <h2 className="font-display mt-5 text-xl font-bold text-ink dark:text-mist">Очередь пуста</h2>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed text-soft dark:text-dim">
                  Вставьте ссылку на тег, профиль автора или отдельный пост Pixiv — файлы скачаются в{" "}
                  <span className="font-mono text-[12px]">pixiv/{"{тег}"}/</span> с нумерацией от старых постов к новым.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SAMPLE_LINKS.map((s) => (
                    <button
                      key={s}
                      className="btn !py-1 !text-[11.5px] !font-mono"
                      onClick={() => {
                        setUrl(s);
                        toast("info", "Пример подставлен в поле — нажмите «Добавить»");
                      }}
                    >
                      {s.length > 52 ? s.slice(0, 52) + "…" : s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {visibleTasks.length === 0 && tasks.length > 0 && (
              <div className="panel rise-in flex items-center gap-3 px-5 py-8 text-[13px] font-semibold text-soft dark:text-dim">
                <ISpinner size={15} className="opacity-60" />
                Все задачи скрыты фильтрами — включите «Показывать завершённые» или добавьте новую ссылку.
              </div>
            )}

            {visibleTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                downloadRoot={settings.download_root || "./downloads"}
                onPause={onPause}
                onResume={onResume}
                onRestart={onRestart}
                onRemove={onRemove}
                onCopy={onCopy}
              />
            ))}
          </section>

          <div className="flex min-h-[340px] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:min-h-0">
            <LogsPanel logs={logs} onClear={clearLogs} />
          </div>
        </main>

        <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 pb-4 font-mono text-[11px] text-soft dark:text-faint">
          <span>Pixiv Loader v1.2.0</span>
          <span>·</span>
          <span>FastAPI :8002</span>
          <span>·</span>
          <span>SQLite: задачи, настройки, история</span>
          <span>·</span>
          <span>одна активная задача · автоповтор ×{settings.max_retries} · возобновление с места остановки</span>
        </footer>
      </div>
    </div>
  );
}
