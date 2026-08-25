# -*- coding: utf-8 -*-
"""SQLite-слой: задачи, настройки, история скачиваний, логи.

Все записи выполняются в режиме autocommit (isolation_level=None) —
каждое действие сразу фиксируется в БД (commit after each action),
чтобы при перезапуске приложение продолжало с места остановки.
"""

import json
import os
import sqlite3
import threading
import time

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pixiv_loader.db")

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

TASK_FIELDS = {
    "site", "kind", "url", "label", "folder", "status", "total_files", "done_files",
    "skipped_files", "failed_files", "cur_file", "cur_bytes", "cur_total", "speed",
    "error", "hidden", "created_at", "updated_at",
}

DEFAULT_SETTINGS = {
    "download_root": os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads"),
    "proxy": "",
    "cookies_path": "",
    "show_completed": True,
    "max_retries": 5,
}


def _conn_get() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
    return _conn


def q(sql: str, params: tuple = ()) -> sqlite3.Cursor:
    with _lock:
        return _conn_get().execute(sql, params)


def init_db() -> None:
    q(
        """CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site TEXT NOT NULL DEFAULT 'pixiv',
            kind TEXT NOT NULL DEFAULT 'tag',
            url TEXT NOT NULL,
            label TEXT NOT NULL,
            folder TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'queued',
            total_files INTEGER NOT NULL DEFAULT 0,
            done_files INTEGER NOT NULL DEFAULT 0,
            skipped_files INTEGER NOT NULL DEFAULT 0,
            failed_files INTEGER NOT NULL DEFAULT 0,
            cur_file TEXT NOT NULL DEFAULT '',
            cur_bytes INTEGER NOT NULL DEFAULT 0,
            cur_total INTEGER NOT NULL DEFAULT 0,
            speed INTEGER NOT NULL DEFAULT 0,
            error TEXT NOT NULL DEFAULT '',
            hidden INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    q("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    q(
        """CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            illust_id TEXT NOT NULL,
            page INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            path TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            bytes INTEGER NOT NULL DEFAULT 0,
            ts REAL NOT NULL
        )"""
    )
    q(
        """CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts REAL NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL
        )"""
    )
    # Перезапуск приложения: незавершённые скачивания возвращаются в очередь,
    # обработка продолжится с места остановки (существующие файлы будут пропущены).
    cur = q("UPDATE tasks SET status='queued', speed=0 WHERE status='downloading'")
    resumed = cur.rowcount

    for key, value in DEFAULT_SETTINGS.items():
        q("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value)))

    log("info", "Pixiv Loader — сервер запущен, база данных открыта: pixiv_loader.db")
    if resumed:
        log("info", f"Возобновление после перезапуска: {resumed} задач(и) возвращены в очередь")


# ------------------------------- настройки -------------------------------

def get_settings() -> dict:
    rows = q("SELECT key, value FROM settings").fetchall()
    result = dict(DEFAULT_SETTINGS)
    for row in rows:
        try:
            result[row["key"]] = json.loads(row["value"])
        except (ValueError, TypeError):
            result[row["key"]] = row["value"]
    return result


def save_settings(data: dict) -> dict:
    current = get_settings()
    for key in DEFAULT_SETTINGS:
        if key in data:
            current[key] = data[key]
            q("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              (key, json.dumps(current[key])))
    return current


# --------------------------------- задачи --------------------------------

def _row_to_task(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def list_tasks() -> list[dict]:
    rows = q("SELECT * FROM tasks ORDER BY id ASC").fetchall()
    return [_row_to_task(r) for r in rows]


def get_task(task_id: int) -> dict | None:
    row = q("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    return _row_to_task(row) if row else None


def first_by_status(status: str) -> dict | None:
    row = q("SELECT * FROM tasks WHERE status=? ORDER BY id ASC LIMIT 1", (status,)).fetchone()
    return _row_to_task(row) if row else None


def find_duplicate(url: str, label: str) -> dict | None:
    row = q("SELECT * FROM tasks WHERE url=? OR label=? LIMIT 1", (url, label)).fetchone()
    return _row_to_task(row) if row else None


def add_task(kind: str, url: str, label: str, folder: str) -> dict:
    now = time.time()
    cur = q(
        "INSERT INTO tasks (kind, url, label, folder, status, created_at, updated_at) VALUES (?,?,?,?, 'queued', ?, ?)",
        (kind, url, label, folder, now, now),
    )
    return get_task(cur.lastrowid)


def update_task(task_id: int, **fields) -> None:
    allowed = {k: v for k, v in fields.items() if k in TASK_FIELDS}
    if not allowed:
        return
    allowed["updated_at"] = time.time()
    sets = ", ".join(f"{k}=?" for k in allowed)
    q(f"UPDATE tasks SET {sets} WHERE id=?", (*allowed.values(), task_id))


def delete_task(task_id: int) -> None:
    q("DELETE FROM history WHERE task_id=?", (task_id,))
    q("DELETE FROM tasks WHERE id=?", (task_id,))


def clear_history(task_id: int) -> None:
    q("DELETE FROM history WHERE task_id=?", (task_id,))


def add_history(task_id: int, illust_id: str, page: int, file_name: str, path: str, status: str, size: int) -> None:
    q(
        "INSERT INTO history (task_id, illust_id, page, file_name, path, status, bytes, ts) VALUES (?,?,?,?,?,?,?,?)",
        (task_id, str(illust_id), page, file_name, path, status, size, time.time()),
    )


# ---------------------------------- логи ---------------------------------

def log(level: str, message: str) -> None:
    q("INSERT INTO logs (ts, level, message) VALUES (?,?,?)", (time.time(), level, message))
    q("DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 1000)")


def get_logs(since_id: int = 0, limit: int = 300) -> list[dict]:
    rows = q("SELECT * FROM logs WHERE id>? ORDER BY id ASC LIMIT ?", (since_id, limit)).fetchall()
    return [dict(r) for r in rows]


def clear_logs() -> None:
    q("DELETE FROM logs")
