export type TaskStatus = "queued" | "downloading" | "paused" | "completed" | "error";

export type TaskKind = "tag" | "user" | "user_illustrations" | "illust";

export interface Task {
  id: number;
  site: "pixiv";
  kind: TaskKind | string;
  url: string;
  label: string;
  folder: string;
  status: TaskStatus;
  total_files: number;
  done_files: number;
  skipped_files: number;
  failed_files: number;
  cur_file: string;
  cur_bytes: number;
  cur_total: number;
  speed: number; // bytes per second
  error: string;
  hidden: number;
  created_at: number;
}

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  message: string;
}

export interface Settings {
  download_root: string;
  proxy: string;
  cookies_path: string;
  show_completed: boolean;
  max_retries: number;
}

export interface ParsedLink {
  kind: TaskKind;
  label: string;
  folder: string;
  key: string;
}

export interface Toast {
  id: number;
  kind: "success" | "error" | "info" | "warn";
  text: string;
}

export const DEFAULT_SETTINGS: Settings = {
  download_root: "./downloads",
  proxy: "",
  cookies_path: "",
  show_completed: true,
  max_retries: 5,
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "В очереди",
  downloading: "Скачивание",
  paused: "Пауза",
  completed: "Завершено",
  error: "Ошибка",
};

export const KIND_LABEL: Record<string, string> = {
  tag: "Поиск по тегу",
  user: "Профиль автора",
  user_illustrations: "Иллюстрации автора",
  illust: "Отдельный пост",
};
