# -*- coding: utf-8 -*-
"""Конвертация ugoira (zip с кадрами + тайминги из ugoira_meta) в MP4.

Используется ffmpeg: системный бинарь, если он есть в PATH, иначе —
бинарь из пакета imageio-ffmpeg (ставится вместе с requirements.txt,
системная установка ffmpeg не обязательна).
"""

import os
import shutil
import subprocess
import tempfile
import zipfile


def get_ffmpeg_exe() -> str | None:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # noqa: PLC0415
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return None


def zip_to_mp4(zip_path: str, mp4_path: str, frames: list | None = None,
               timeout: int = 900) -> tuple[int, int]:
    """Распаковывает кадры и кодирует MP4 (libx264, yuv420p).

    frames — элементы {"file": "000000.jpg", "delay": 33} из ugoira_meta.
    Возвращает (число кадров, размер MP4 в байтах).
    """
    exe = get_ffmpeg_exe()
    if exe is None:
        raise RuntimeError(
            "ffmpeg не найден. Установите системный ffmpeg или выполните "
            "«pip install imageio-ffmpeg» — в пакете уже есть готовый бинарь."
        )

    tmpdir = tempfile.mkdtemp(prefix="ugoira_")
    try:
        with zipfile.ZipFile(zip_path) as zf:
            names = [m for m in zf.namelist() if not m.endswith("/")]
            zf.extractall(tmpdir)
        if not names:
            raise RuntimeError("в архиве ugoira нет кадров")
        present = set(names)

        # Порядок и длительности кадров — из метаданных;
        # запасной вариант — алфавитный порядок с шагом 33 мс.
        order: list[tuple[str, int]] = []
        for f in frames or []:
            name = (f or {}).get("file") or ""
            if name in present:
                order.append((name, max(10, int((f or {}).get("delay") or 33))))
        if not order:
            order = [(n, 33) for n in sorted(names)]

        # concat-список ffmpeg: длительность у каждого кадра.
        # Последний кадр дублируется, иначе ffmpeg обрежет его длительность.
        list_path = os.path.join(tmpdir, "_concat.txt")
        with open(list_path, "w", encoding="utf-8") as fh:
            for name, delay in order:
                fh.write(f"file '{name}'\nduration {delay / 1000:.3f}\n")
            fh.write(f"file '{order[-1][0]}'\n")

        cmd = [
            exe, "-y", "-f", "concat", "-safe", "0", "-i", list_path,
            # чётные размеры — обязательны для yuv420p
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-pix_fmt", "yuv420p", "-c:v", "libx264",
            "-preset", "medium", "-crf", "16",
            "-movflags", "+faststart", mp4_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if proc.returncode != 0:
            tail = (proc.stderr or "").strip().splitlines()[-3:]
            raise RuntimeError("ffmpeg: " + (" | ".join(tail) or f"код {proc.returncode}"))
        return len(order), os.path.getsize(mp4_path)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
