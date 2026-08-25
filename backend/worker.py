# -*- coding: utf-8 -*-
"""Воркер очереди загрузок.

Правила очереди:
  * одновременно активна только одна задача, новые добавляются в конец;
  * статусы: queued → downloading → completed | error (paused — по запросу);
  * при ошибке файла — до 5 повторов, затем задача помечается «Ошибка»,
    но скачивание следующих файлов продолжается;
  * каждое изменение сразу пишется в БД (autocommit) — перезапуск
    продолжает задачу с места остановки (существующие файлы пропускаются,
    недокачанный файл докачивается по Range с .part-файла).
"""

import os
import re
import threading
import time
import traceback

import db
import pixiv_client as px

CHUNK = 262144


class DownloadWorker(threading.Thread):
    def __init__(self) -> None:
        super().__init__(daemon=True, name="pixiv-worker")
        self.shutdown_evt = threading.Event()
        self.pause_ids: set[int] = set()
        self.delete_ids: set[int] = set()
        self.idle = threading.Event()
        self.idle.set()
        self._lock = threading.Lock()

    # ---------------------------- управление ----------------------------

    def request_pause(self, task_id: int) -> None:
        with self._lock:
            self.pause_ids.add(task_id)

    def request_resume(self, task_id: int) -> None:
        with self._lock:
            self.pause_ids.discard(task_id)
            self.delete_ids.discard(task_id)

    def request_delete(self, task_id: int) -> None:
        with self._lock:
            self.delete_ids.add(task_id)
            self.pause_ids.discard(task_id)

    def stop_all_and_wait(self, timeout: float = 3.0) -> None:
        """Корректное завершение: активная задача ставится на паузу, состояние в БД."""
        for t in db.list_tasks():
            if t["status"] == "downloading":
                self.request_pause(t["id"])
        self.shutdown_evt.set()
        self.idle.wait(timeout)

    # ------------------------------- цикл -------------------------------

    def run(self) -> None:
        db.log("info", "Очередь задач запущена: одновременно активна одна задача")
        while not self.shutdown_evt.is_set():
            task = db.first_by_status("downloading") or db.first_by_status("queued")
            if task is None:
                time.sleep(0.5)
                continue
            self.idle.clear()
            try:
                self.run_task(task)
            except Exception as exc:  # noqa: BLE001
                db.log("error", f"Сбой задачи «{task['label']}»: {exc}")
                db.update_task(task["id"], status="error", speed=0,
                               error=f"Сбой при обработке: {exc}")
            finally:
                with self._lock:
                    self.pause_ids.discard(task["id"])
                    self.delete_ids.discard(task["id"])
                self.idle.set()
        db.log("warn", "Воркер остановлен")

    # ------------------------------ задача ------------------------------

    def run_task(self, task: dict) -> None:
        tid = task["id"]
        settings = db.get_settings()
        parsed = px.parse_url(task["url"])
        if parsed is None:
            db.update_task(tid, status="error", error="Не удалось разобрать ссылку")
            db.log("error", f"Некорректная ссылка: {task['url']}")
            return

        db.update_task(tid, status="downloading", speed=0, failed_files=0, error="")
        db.log("info", f"Задача начата: «{task['label']}» — получаю список иллюстраций…")

        client = px.PixivClient(proxy=settings.get("proxy", ""),
                                cookies_path=settings.get("cookies_path", ""))
        if client.cookies_loaded == -1:
            db.log("warn", f"cookies.txt не найден: {settings.get('cookies_path')} — продолжаю без авторизации")
        elif client.cookies_loaded > 0:
            db.log("info", f"Авторизация Pixiv: загружено cookie — {client.cookies_loaded} шт.")
        if client.proxy:
            db.log("info", f"Соединение через прокси {client.proxy}")

        illusts, author = client.resolve(parsed)
        if not illusts:
            db.update_task(tid, status="error", total_files=0,
                           error="Pixiv не вернул ни одной иллюстрации (проверьте cookies/тег)")
            db.log("error", f"Задача «{task['label']}»: иллюстрации не найдены")
            return

        # Нумерация строго от старых постов к новым: самый старый получает (1)
        illusts.sort(key=lambda x: (x[1], int(x[0])))

        # Имя папки: для авторов — «{Имя автора}_(pixiv_{ID})».
        # Имя узнаём при старте; после первого запуска оно уже сохранено в БД.
        folder_name = task["folder"] or parsed["folder"]
        if parsed["kind"] in ("user", "user_illustrations") and folder_name == f"pixiv_{parsed['user_id']}":
            if author:
                folder_name = f"{px.sanitize_folder(author)}_(pixiv_{parsed['user_id']})"
                db.update_task(tid, folder=folder_name, label=f"{author} · иллюстрации")
                db.log("info", f"Автор: {author} — папка загрузки: pixiv/{folder_name}/")
            else:
                db.log("warn", f"Имя автора {parsed['user_id']} получить не удалось — папка: pixiv/{folder_name}/")

        root = os.path.abspath(settings.get("download_root") or "./downloads")
        folder = os.path.join(root, "pixiv", folder_name)
        os.makedirs(folder, exist_ok=True)
        db.log("info", f"Найдено иллюстраций: {len(illusts)} · папка: {folder}")

        plan: list[tuple[int, str, int, str]] = []  # (номер_файла, illust_id, страница, url)
        for iid, _date in illusts:
            if tid in self.delete_ids or self.shutdown_evt.is_set():
                return
            try:
                urls = client.illust_pages(iid)
            except Exception as exc:  # noqa: BLE001
                db.log("warn", f"Не удалось получить страницы поста {iid}: {exc}")
                urls = []
            for page, url in enumerate(urls):
                # Номер уникален для каждого файла, а не для поста:
                # (1)_123_p0, (2)_123_p1, (3)_123_p2, (4)_456_p0, …
                # Посты идут от старых к новым — их файлы получают младшие номера.
                plan.append((len(plan) + 1, iid, page, url))

        db.update_task(tid, total_files=len(plan))
        db.log("info", f"Всего файлов к скачиванию: {len(plan)}")

        existing = set(os.listdir(folder))
        done = skipped = failed = 0

        for number, iid, page, url in plan:
            if tid in self.delete_ids:
                db.log("warn", f"Задача #{tid} удалена пользователем — обработка прервана")
                return
            if self.shutdown_evt.is_set():
                db.update_task(tid, status="paused", speed=0)
                db.log("warn", f"Остановка сервера: «{task['label']}» сохранена как «Пауза»")
                return
            if tid in self.pause_ids:
                db.update_task(tid, status="paused", speed=0)
                db.log("warn", f"Пауза: «{task['label']}» (обработано {done} из {len(plan)})")
                return

            ext = px.ext_from_url(url)
            name = f"({number})_{iid}_p{page}.{ext}"

            # Защита от дублей: файл с тем же {ID}_p{страница} уже есть — пропускаем
            dup_re = re.compile(rf"^\(\d+\)_{re.escape(iid)}_p{page}\.[A-Za-z0-9]+$")
            if any(dup_re.match(f) for f in existing):
                done += 1
                skipped += 1
                db.update_task(tid, done_files=done, skipped_files=skipped)
                db.add_history(tid, iid, page, name, "", "skipped", 0)
                db.log("warn", f"Пропущен {name} — файл уже существует (защита от дублей)")
                continue

            db.log("info", f"Скачивание {name}")
            result = self.download_file(client, tid, folder, name, url, settings)

            if result == "paused":
                db.update_task(tid, status="paused", speed=0)
                db.log("warn", f"Пауза: «{task['label']}» на файле {name}")
                return
            if result == "abort":
                return
            if result == "ok":
                done += 1
                size = os.path.getsize(os.path.join(folder, name))
                db.update_task(tid, done_files=done)
                db.add_history(tid, iid, page, name, os.path.join(folder, name), "downloaded", size)
                db.log("success", f"Сохранён {name} ({size // 1024} КБ)")
            else:  # fail
                failed += 1
                msg = (f"Файл {name} не скачан после {settings.get('max_retries', 5)} попыток")
                db.update_task(tid, failed_files=failed, status="error", error=msg)
                db.add_history(tid, iid, page, name, "", "error", 0)
                db.log("error", msg)
                db.log("error", f"Задача «{task['label']}» помечена как «Ошибка», продолжаю следующие файлы")

        status = "error" if failed else "completed"
        db.update_task(tid, status=status, speed=0, cur_file="", cur_bytes=0, cur_total=0)
        if status == "completed":
            note = f", пропущено {skipped} (уже на диске)" if skipped else ""
            db.log("success", f"Задача «{task['label']}» завершена: {done} файлов{note} → {folder}")
        else:
            db.log("error", f"Задача «{task['label']}» закончена с ошибками: {failed} из {len(plan)} файлов не скачано")

    # ------------------------------- файл --------------------------------

    def download_file(self, client: px.PixivClient, tid: int, folder: str,
                      name: str, url: str, settings: dict) -> str:
        """Возвращает 'ok' | 'fail' | 'paused' | 'abort'. Докачка через Range + .part."""
        final_path = os.path.join(folder, name)
        part_path = final_path + ".part"
        max_retries = int(settings.get("max_retries", 5) or 5)
        headers_base = {"Referer": "https://www.pixiv.net/", "User-Agent": px.UA}

        for attempt in range(1, max_retries + 1):
            if tid in self.delete_ids:
                return "abort"
            if tid in self.pause_ids or self.shutdown_evt.is_set():
                return "paused"
            try:
                start = os.path.getsize(part_path) if os.path.exists(part_path) else 0
                headers = dict(headers_base)
                if start > 0:
                    headers["Range"] = f"bytes={start}-"
                    db.log("info", f"Докачка {name} с {start // 1024} КБ (Range)")

                with client.session.get(url, headers=headers, stream=True, timeout=(15, 60)) as resp:
                    if resp.status_code == 416 and start > 0:
                        resp.close()
                        os.remove(part_path)
                        continue  # Range не принят — начнём заново
                    resp.raise_for_status()

                    resumed = resp.status_code == 206 and start > 0
                    if not resumed:
                        start = 0
                    total = int(resp.headers.get("Content-Length", 0) or 0) + start
                    db.update_task(tid, cur_file=name, cur_total=total, cur_bytes=start)

                    downloaded = start
                    speed = 0.0
                    last_commit = time.time()
                    last_t = time.time()
                    mode = "ab" if resumed else "wb"
                    with open(part_path, mode) as fh:
                        for chunk in resp.iter_content(chunk_size=CHUNK):
                            if not chunk:
                                continue
                            if tid in self.delete_ids:
                                return "abort"
                            if tid in self.pause_ids or self.shutdown_evt.is_set():
                                fh.flush()
                                db.update_task(tid, cur_bytes=downloaded, speed=0)
                                return "paused"
                            fh.write(chunk)
                            downloaded += len(chunk)
                            now = time.time()
                            inst = len(chunk) / max(now - last_t, 1e-6)
                            speed = speed * 0.7 + inst * 0.3 if speed else inst
                            last_t = now
                            if now - last_commit >= 0.3:  # прогресс текущего файла — сразу в БД
                                db.update_task(tid, cur_bytes=downloaded, speed=int(speed))
                                last_commit = now

                os.replace(part_path, final_path)
                db.update_task(tid, cur_bytes=total or downloaded, speed=int(speed))
                return "ok"
            except Exception as exc:  # noqa: BLE001
                db.log("warn", f"Ошибка файла {name} (попытка {attempt}/{max_retries}): {exc}")
                if attempt < max_retries:
                    time.sleep(min(1.5 * attempt, 6))
        return "fail"
