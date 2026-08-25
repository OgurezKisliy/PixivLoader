# -*- coding: utf-8 -*-
"""Pixiv Loader — FastAPI-бэкенд (http://127.0.0.1:8002).

Очередь задач с одной активной загрузкой, SQLite-хранилище (задачи,
настройки, история, логи), прокси socks5/http, cookies.txt, повтор
с места остановки после перезапуска.
"""

import os
import re
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db
import pixiv_client as px
from worker import DownloadWorker

VERSION = "1.2.0"
worker = DownloadWorker()

PROXY_RE = re.compile(r"^(socks5h?|https?)://", re.IGNORECASE)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    worker.start()
    yield
    worker.stop_all_and_wait(3.0)


app = FastAPI(title="Pixiv Loader API", version=VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # локальное приложение: фронтенд на localhost:3002
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------- модели ---------------------------------

class TaskIn(BaseModel):
    url: str


class SettingsIn(BaseModel):
    download_root: str = ""
    proxy: str = ""
    cookies_path: str = ""
    show_completed: bool = True
    max_retries: int = 5


class ProxyIn(BaseModel):
    proxy: str


# --------------------------------- маршруты -------------------------------

@app.get("/api/health")
def health():
    return {"ok": True, "version": VERSION, "port": 8002}


@app.get("/api/state")
def state():
    tasks = db.list_tasks()
    active = next((t for t in tasks if t["status"] == "downloading"), None)
    return {
        "tasks": tasks,
        "settings": db.get_settings(),
        "active_id": active["id"] if active else None,
        "server": f"Pixiv Loader v{VERSION}",
    }


@app.get("/api/logs")
def logs(since: int = 0):
    return {"logs": db.get_logs(since)}


@app.post("/api/logs/clear")
def logs_clear():
    db.clear_logs()
    return {"ok": True}


@app.post("/api/tasks")
def add_task(body: TaskIn):
    url = body.url.strip()
    parsed = px.parse_url(url)
    if parsed is None:
        return {"ok": False, "error": "Не удалось распознать ссылку Pixiv "
                                      "(поддерживаются: /tags/…/artworks, /search?q=…, /users/N/illustrations, /artworks/N)"}

    dup = db.find_duplicate(url, parsed["label"])
    if dup is not None:
        state_name = {"completed": "уже скачана", "queued": "в очереди",
                      "downloading": "скачивается", "paused": "на паузе",
                      "error": "с ошибкой"}.get(dup["status"], "существует")
        db.log("warn", f"Дубликат отклонён: «{parsed['label']}» — задача #{dup['id']} {state_name}")
        return {"ok": False, "error": f"Дубликат: «{parsed['label']}» {state_name} (задача #{dup['id']})",
                "existing": dup}

    task = db.add_task(parsed["kind"], url, parsed["label"], parsed["folder"])
    db.log("info", f"Добавлена задача #{task['id']}: {parsed['label']} (в конец очереди)")
    return {"ok": True, "task": task}


@app.post("/api/tasks/{task_id}/pause")
def pause_task(task_id: int):
    task = db.get_task(task_id)
    if task is None:
        return {"ok": False, "error": "Задача не найдена"}
    if task["status"] == "queued":
        db.update_task(task_id, status="paused")
        db.log("warn", f"Задача «{task['label']}» снята с очереди (пауза)")
    elif task["status"] == "downloading":
        worker.request_pause(task_id)
    return {"ok": True}


@app.post("/api/tasks/{task_id}/resume")
def resume_task(task_id: int):
    task = db.get_task(task_id)
    if task is None:
        return {"ok": False, "error": "Задача не найдена"}
    if task["status"] in ("paused", "error"):
        db.update_task(task_id, status="queued", error="")
        worker.request_resume(task_id)
        db.log("info", f"«{task['label']}» возвращена в очередь — продолжение с места остановки")
    return {"ok": True}


@app.post("/api/tasks/{task_id}/restart")
def restart_task(task_id: int):
    task = db.get_task(task_id)
    if task is None:
        return {"ok": False, "error": "Задача не найдена"}
    db.clear_history(task_id)
    db.update_task(task_id, status="queued", done_files=0, skipped_files=0, failed_files=0,
                   cur_file="", cur_bytes=0, cur_total=0, speed=0, error="")
    worker.request_resume(task_id)
    db.log("info", f"Перезапуск задачи «{task['label']}» — существующие файлы будут пропущены")
    return {"ok": True}


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int):
    task = db.get_task(task_id)
    if task is None:
        return {"ok": True}
    worker.request_delete(task_id)
    db.delete_task(task_id)
    db.log("warn", f"Задача «{task['label']}» удалена (файлы на диске сохранены)")
    return {"ok": True}


@app.post("/api/tasks/clear-completed")
def clear_completed():
    hidden = 0
    for t in db.list_tasks():
        if t["status"] == "completed" and not t["hidden"]:
            db.update_task(t["id"], hidden=1)
            hidden += 1
    if hidden:
        db.log("info", f"Завершённые задачи скрыты из интерфейса ({hidden} шт.), записи в БД сохранены")
    return {"ok": True, "hidden": hidden}


@app.get("/api/settings")
def get_settings():
    return db.get_settings()


@app.put("/api/settings")
def save_settings(body: SettingsIn):
    data = body.model_dump()
    if data["proxy"] and not PROXY_RE.match(data["proxy"]):
        return {"ok": False, "error": "Прокси должен начинаться с socks5:// или http://"}
    data["max_retries"] = max(1, min(10, int(data["max_retries"])))
    saved = db.save_settings(data)
    if saved.get("download_root"):
        try:
            os.makedirs(os.path.join(saved["download_root"], "pixiv"), exist_ok=True)
        except OSError:
            pass
    db.log("success", "Настройки применены и сохранены в БД")
    if saved.get("proxy"):
        db.log("info", f"Прокси активен: {saved['proxy']}")
    if saved.get("cookies_path"):
        db.log("info", f"Cookies Pixiv: {saved['cookies_path']}")
    return {"ok": True, "settings": saved}


@app.post("/api/test-proxy")
def test_proxy(body: ProxyIn):
    proxy = body.proxy.strip()
    if not PROXY_RE.match(proxy):
        return {"ok": False, "ms": 0, "error": "Формат: socks5://… или http://…"}
    started = time.time()
    try:
        resp = requests.get("https://www.pixiv.net/", proxies={"http": proxy, "https": proxy},
                            timeout=10, headers={"User-Agent": px.UA})
        ms = int((time.time() - started) * 1000)
        ok = resp.status_code < 500
        db.log("success" if ok else "error",
               f"Тест прокси {proxy}: HTTP {resp.status_code} за {ms} мс")
        return {"ok": ok, "ms": ms, "status": resp.status_code}
    except requests.RequestException as exc:
        db.log("error", f"Тест прокси {proxy} не удался: {exc}")
        return {"ok": False, "ms": 0, "error": str(exc)}


@app.post("/api/shutdown")
def shutdown():
    db.log("warn", "Выход по запросу пользователя: активные загрузки останавливаются, состояние сохраняется…")
    worker.stop_all_and_wait(3.0)

    def _exit():
        time.sleep(0.4)
        os._exit(0)

    threading.Thread(target=_exit, daemon=True).start()
    return {"ok": True}


# -------------------- раздача собранного фронтенда -----------------------
# Если фронтенд собран (npm run build) в ../dist, бэкенд отдаёт его сам —
# всё приложение работает на одном порту 8002.

DIST = Path(__file__).resolve().parent.parent / "dist"

if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

if (DIST / "index.html").is_file():
    @app.get("/", include_in_schema=False)
    def spa_index():
        return FileResponse(DIST / "index.html")
