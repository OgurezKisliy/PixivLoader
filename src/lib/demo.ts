import type { LogEntry, LogLevel, Settings, Task, TaskStatus } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { formatBytes } from "./format";
import { parsePixivUrl, normalizeUrl } from "./pixiv";

const SETTINGS_KEY = "pixiv-loader-demo-settings";

const DEMO_TAGS = ["初音ミク", "原神", "Fate/GrandOrder", "Blue Archive", "呪術廻戦", "崩壊：スターレイル"];
const DEMO_ARTISTS = ["shiratama", "Aono", "Karasu", "Yumeji", "Hoshino", "Mikan", "Shigure", "Tsukimi", "Nagi", "Kobato"];
const EXT = ["jpg", "jpg", "jpg", "png"];

/** Детерминированное «имя автора» для демо по ID. */
function demoArtistName(uid: string): string {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DEMO_ARTISTS[h % DEMO_ARTISTS.length];
}

function rid(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface EngineSnapshot {
  tasks: Task[];
  logs: LogEntry[];
  settings: Settings;
}

/**
 * Локальный симулятор бэкенда: одна активная задача, очередь,
 * пропуск существующих файлов, повторные попытки, живые логи.
 */
export class DemoEngine {
  tasks: Task[] = [];
  logs: LogEntry[] = [];
  settings: Settings = DEFAULT_SETTINGS;
  private nextTaskId = 1;
  private nextLogId = 1;
  private timer: number | null = null;
  private onUpdate: ((s: EngineSnapshot) => void) | null = null;
  private speeds = new Map<number, number>();
  stopped = false;

  constructor() {
    this.loadSettings();
    this.seed();
  }

  subscribe(cb: (s: EngineSnapshot) => void) {
    this.onUpdate = cb;
    cb(this.snapshot());
  }

  start() {
    if (this.timer != null) return;
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  stop() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private snapshot(): EngineSnapshot {
    return { tasks: [...this.tasks], logs: [...this.logs], settings: { ...this.settings } };
  }

  private emit() {
    this.onUpdate?.(this.snapshot());
  }

  log(level: LogLevel, message: string) {
    this.logs.push({ id: this.nextLogId++, ts: Date.now(), level, message });
    if (this.logs.length > 300) this.logs.splice(0, this.logs.length - 300);
  }

  /* ---------------- наполнение при старте ---------------- */

  private mkTask(partial: Partial<Task> & { url: string; label: string; kind: string; folder: string }): Task {
    return {
      id: this.nextTaskId++,
      site: "pixiv",
      status: "queued",
      total_files: 0,
      done_files: 0,
      skipped_files: 0,
      failed_files: 0,
      cur_file: "",
      cur_bytes: 0,
      cur_total: 0,
      speed: 0,
      error: "",
      hidden: 0,
      created_at: Date.now(),
      ...partial,
    } as Task;
  }

  private seed() {
    const ago = (min: number) => Date.now() - min * 60_000;
    this.logs = [];
    this.nextLogId = 1;
    const boot: Array<[number, LogLevel, string]> = [
      [9, "info", "Pixiv Loader v1.2.0 — сервер запущен на http://127.0.0.1:8002"],
      [9, "info", "База данных SQLite открыта: pixiv_loader.db"],
      [8, "success", "Настройки загружены из БД (корневая папка, прокси, cookies)"],
      [8, "info", "Возобновление после перезапуска: активных задач не найдено"],
      [6, "info", "Добавлена задача: #Fate/GrandOrder (128 файлов в очереди)"],
      [4, "success", "Задача «#Fate/GrandOrder» завершена: 128 файлов, пропущено 12 (уже на диске)"],
      [3, "info", "Добавлена задача: #Blue Archive"],
      [2, "error", "HTTP 429 Too Many Requests — файл (7)_118020966_p0.jpg, попытка 5 из 5"],
      [2, "error", "Задача «#Blue Archive» помечена как «Ошибка», продолжаю следующие файлы"],
    ];
    for (const [min, level, message] of boot) {
      this.logs.push({ id: this.nextLogId++, ts: ago(min), level, message });
    }

    this.tasks = [
      this.mkTask({
        url: "https://www.pixiv.net/en/tags/Fate%2FGrandOrder/artworks",
        label: "#Fate/GrandOrder",
        kind: "tag",
        folder: "Fate_GrandOrder",
        status: "completed",
        total_files: 128,
        done_files: 128,
        skipped_files: 12,
        created_at: ago(6),
      }),
      this.mkTask({
        url: "https://www.pixiv.net/en/tags/Blue%20Archive/artworks?s_mode=s_tag&type=artwork",
        label: "#Blue Archive",
        kind: "tag",
        folder: "Blue Archive",
        status: "error",
        total_files: 24,
        done_files: 17,
        failed_files: 1,
        error: "HTTP 429 Too Many Requests — (7)_118020966_p0.jpg не скачан после 5 попыток",
        created_at: ago(3),
      }),
    ];

    this.addTask("https://www.pixiv.net/en/tags/" + encodeURIComponent("初音ミク") + "/artworks", true);
    this.addTask("https://www.pixiv.net/users/2033916/illustrations", true);
    const active = this.tasks.find((t) => t.status === "queued");
    if (active) this.startTask(active, 17, 46);
  }

  /* ---------------- очередь ---------------- */

  private startTask(task: Task, doneFiles?: number, total?: number) {
    task.status = "downloading";
    task.error = "";
    task.failed_files = 0;
    task.total_files = total ?? Math.round(rand(24, 80));
    task.done_files = doneFiles ?? 0;
    this.speeds.set(task.id, rand(1.8, 5.4) * 1024 * 1024);
    this.log("info", `Задача начата: «${task.label}» — получаю список иллюстраций с Pixiv…`);
    // для ссылок на автора подставляем имя: папка «{Имя}_(pixiv_{ID})»
    if (task.kind === "user" || task.kind === "user_illustrations") {
      const uid = task.folder.match(/\d+/)?.[0];
      if (uid && task.folder === `pixiv_${uid}`) {
        const name = demoArtistName(uid);
        task.folder = `${name}_(pixiv_${uid})`;
        task.label = `${name} · иллюстрации`;
        this.log("info", `Автор: ${name} — папка загрузки: ${this.settings.download_root}/pixiv/${task.folder}/`);
      }
    }
    this.log("info", `Найдено ${task.total_files} файлов · папка: ${this.settings.download_root}/pixiv/${task.folder}/`);
    if (this.settings.proxy) this.log("info", `Соединение через прокси ${this.settings.proxy}`);
    this.nextFile(task, true);
  }

  private nextFile(task: Task, first = false) {
    if (task.done_files >= task.total_files) {
      this.completeTask(task);
      return;
    }
    // иногда файл уже существует на диске — пропускаем (защита от дублей)
    if (!first && Math.random() < 0.08) {
      task.done_files += 1;
      task.skipped_files += 1;
      const name = `(${task.done_files})_${rid(8)}_p0.${pick(EXT)}`;
      this.log("warn", `Пропущен ${name} — файл уже существует (защита от дублей)`);
      this.nextFile(task);
      return;
    }
    const n = task.done_files + 1;
    task.cur_file = `(${n})_${rid(8)}_p0.${pick(EXT)}`;
    task.cur_total = Math.round(rand(1.1, 7.6) * 1024 * 1024);
    task.cur_bytes = 0;
    if (!first) this.log("info", `Скачивание ${task.cur_file} (${formatBytes(task.cur_total)})`);
  }

  private completeTask(task: Task) {
    const hasFailed = task.failed_files > 0;
    task.status = hasFailed ? "error" : "completed";
    task.speed = 0;
    task.cur_file = "";
    task.cur_bytes = 0;
    task.cur_total = 0;
    this.speeds.delete(task.id);
    if (hasFailed) {
      this.log(
        "error",
        `Задача «${task.label}» закончена с ошибками: ${task.failed_files} из ${task.total_files} файлов не скачано`,
      );
    } else {
      this.log(
        "success",
        `Задача «${task.label}» завершена: ${task.done_files} файлов` +
          (task.skipped_files ? `, пропущено ${task.skipped_files} (уже на диске)` : "") +
          ` → ${this.settings.download_root}/pixiv/${task.folder}/`,
      );
    }
  }

  private tick() {
    if (this.stopped) return;
    // задача со статусом «Ошибка» продолжает докачивать оставшиеся файлы (по ТЗ)
    let active = this.tasks.find(
      (t) =>
        t.status === "downloading" ||
        (t.status === "error" && t.cur_file !== "" && t.total_files > 0 && t.done_files < t.total_files),
    );
    if (!active) {
      const next = this.tasks.filter((t) => t.status === "queued").sort((a, b) => a.id - b.id)[0];
      if (next) {
        this.startTask(next);
        active = next;
      } else {
        return;
      }
    }

    const base = this.speeds.get(active.id) ?? 3 * 1024 * 1024;
    const speed = base * rand(0.72, 1.24);
    active.speed = speed;
    active.cur_bytes = Math.min(active.cur_total, active.cur_bytes + speed * 0.25);

    if (active.cur_bytes >= active.cur_total) {
      this.log("success", `Сохранён ${active.cur_file} (${formatBytes(active.cur_total)})`);
      active.done_files += 1;
      // редкая ошибка файла: 5 попыток — и файл не скачан, но задача продолжается
      if (Math.random() < 0.012 && active.done_files < active.total_files) {
        active.failed_files += 1;
        active.status = "error";
        active.error = `HTTP 500 Internal Server Error — ${active.cur_file} не скачан после ${this.settings.max_retries} попыток`;
        this.log("error", `Ошибка: ${active.error}`);
        this.log("error", `Задача «${active.label}» помечена как «Ошибка», продолжаю следующие файлы`);
        // задача продолжается, статус останется error до конца
      }
      this.nextFile(active);
    }
    this.emit();
  }

  /* ---------------- публичные действия (зеркало API) ---------------- */

  addTask(rawUrl: string, silent = false): { ok: boolean; error?: string; task?: Task } {
    const parsed = parsePixivUrl(rawUrl);
    if (!parsed) {
      return { ok: false, error: "Не удалось распознать ссылку Pixiv (тег, автор или пост)" };
    }
    const url = normalizeUrl(rawUrl);
    const dup = this.tasks.find((t) => normalizeUrl(t.url) === url || t.label === parsed.label);
    if (dup) {
      return { ok: false, error: `Дубликат: «${dup.label}» уже ${dup.status === "completed" ? "скачана" : "в очереди"}` };
    }
    const task = this.mkTask({
      url,
      label: parsed.label,
      kind: parsed.kind,
      folder: parsed.folder,
      created_at: Date.now(),
    });
    this.tasks.push(task);
    if (!silent) this.log("info", `Добавлена задача: ${parsed.label} (в конец очереди)`);
    this.emit();
    return { ok: true, task };
  }

  pause(id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.status !== "downloading") return;
    t.status = "paused";
    t.speed = 0;
    this.log("warn", `Пауза: «${t.label}» на файле ${t.cur_file || "—"}`);
    this.emit();
  }

  resume(id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || (t.status !== "paused" && t.status !== "error")) return;
    t.status = "queued";
    t.error = "";
    this.log("info", `«${t.label}» возвращена в очередь (продолжение с места остановки)`);
    this.emit();
  }

  restart(id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.status = "queued";
    t.done_files = 0;
    t.skipped_files = 0;
    t.failed_files = 0;
    t.cur_file = "";
    t.cur_bytes = 0;
    t.cur_total = 0;
    t.speed = 0;
    t.error = "";
    this.log("info", `Перезапуск задачи «${t.label}» — существующие файлы будут пропущены`);
    this.emit();
  }

  remove(id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    this.tasks = this.tasks.filter((x) => x.id !== id);
    this.speeds.delete(id);
    this.log("warn", `Задача «${t.label}» удалена из очереди (файлы на диске сохранены)`);
    this.emit();
  }

  clearCompleted() {
    let n = 0;
    for (const t of this.tasks) {
      if (t.status === "completed" && !t.hidden) {
        t.hidden = 1;
        n++;
      }
    }
    if (n) this.log("info", `Завершённые задачи скрыты из интерфейса (${n} шт.), записи в БД сохранены`);
    this.emit();
  }

  updateSettings(next: Settings) {
    this.settings = { ...next };
    this.saveSettings();
    this.log("success", "Настройки применены и сохранены в БД");
    if (next.proxy) this.log("info", `Прокси активен: ${next.proxy}`);
    this.emit();
  }

  shutdown() {
    for (const t of this.tasks) {
      if (t.status === "downloading") {
        t.status = "paused";
        t.speed = 0;
      }
    }
    this.stopped = true;
    this.log("warn", "Остановка по запросу пользователя: состояние сохранено, задачи на паузе");
    this.emit();
  }

  restartServer() {
    this.stopped = false;
    this.log("info", "Сервер запущен повторно, очередь возобновлена");
    this.emit();
  }

  async testProxy(proxy: string): Promise<{ ok: boolean; ms: number }> {
    await new Promise((r) => setTimeout(r, 900));
    if (!/^(socks5|http)/i.test(proxy)) return { ok: false, ms: 0 };
    return { ok: true, ms: Math.round(rand(60, 240)) };
  }

  /* ---------------- персистентность настроек ---------------- */

  private loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
  }
  private saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }
}

export type { TaskStatus };
