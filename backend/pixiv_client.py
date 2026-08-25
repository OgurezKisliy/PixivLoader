# -*- coding: utf-8 -*-
"""Клиент Pixiv: разбор ссылок, cookies (Netscape), прокси, веб-API (ajax)."""

import os
import re
from urllib.parse import quote, unquote, urlparse, parse_qs

import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
BASE = "https://www.pixiv.net"


def sanitize_folder(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\r\n\t]', "_", name or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()[:80]
    return cleaned or "без_тега"


def parse_url(raw: str) -> dict | None:
    """Распознаёт ссылки: /tags/…/artworks, /search?q=…, /users/N[/illustrations], /artworks/N."""
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        u = urlparse(raw if "://" in raw else "https://" + raw)
    except ValueError:
        return None
    host = (u.hostname or "").lower()
    if host != "pixiv.net" and not host.endswith(".pixiv.net"):
        return None

    seg = [s for s in u.path.split("/") if s]
    if seg and seg[0] in ("en", "ja"):
        seg = seg[1:]

    if seg and seg[0] == "tags" and len(seg) > 1:
        tag = unquote(seg[1])
        return {"kind": "tag", "tag": tag, "key": f"tag:{tag}",
                "label": f"#{tag}", "folder": sanitize_folder(tag)}

    if seg and seg[0] == "search":
        params = parse_qs(u.query)
        tag = (params.get("q") or [None])[0]
        if not tag:
            return None
        return {"kind": "tag", "tag": tag, "key": f"tag:{tag}",
                "label": f"#{tag}", "folder": sanitize_folder(tag)}

    if seg and seg[0] == "users" and len(seg) > 1 and seg[1].isdigit():
        uid = seg[1]
        illus = len(seg) > 2 and seg[2] in ("illustrations", "artworks")
        return {"kind": "user_illustrations" if illus else "user", "user_id": uid,
                "key": f"user:{uid}", "label": f"Автор {uid} · иллюстрации", "folder": f"user_{uid}"}

    if seg and seg[0] == "artworks" and len(seg) > 1 and seg[1].isdigit():
        iid = seg[1]
        return {"kind": "illust", "illust_id": iid, "key": f"illust:{iid}",
                "label": f"Пост {iid}", "folder": f"illust_{iid}"}

    if seg and seg[0] == "member_illust.php":
        params = parse_qs(u.query)
        iid = (params.get("illust_id") or [None])[0]
        if iid and iid.isdigit():
            return {"kind": "illust", "illust_id": iid, "key": f"illust:{iid}",
                    "label": f"Пост {iid}", "folder": f"illust_{iid}"}

    return None


def load_cookies(session: requests.Session, path: str) -> int:
    """Загружает Netscape cookies.txt; возвращает число загруженных cookie."""
    if not path:
        return 0
    path = os.path.expanduser(path)
    if not os.path.isfile(path):
        return -1  # файл не найден
    count = 0
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 7:
                domain, _flag, cpath, _secure, _expires, name, value = parts[:7]
                session.cookies.set(name, value, domain=domain.lstrip("."), path=cpath or "/")
                count += 1
    return count


class PixivClient:
    """Обёртка над веб-API Pixiv с поддержкой прокси (http/socks5) и cookies."""

    def __init__(self, proxy: str = "", cookies_path: str = ""):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": UA,
            "Referer": f"{BASE}/",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
        })
        self.proxy = (proxy or "").strip()
        if self.proxy:
            self.session.proxies.update({"http": self.proxy, "https": self.proxy})
        self.cookies_loaded = load_cookies(self.session, cookies_path)

    # ------------------------------ запросы ------------------------------

    def _json(self, url: str, params: dict | None = None) -> dict:
        resp = self.session.get(url, params=params, timeout=(15, 60))
        resp.raise_for_status()
        return resp.json()

    def search_illusts(self, tag: str, max_pages: int = 60) -> list[tuple[str, str]]:
        """Поиск по тегу, все страницы. Возвращает [(illust_id, createDate), …]."""
        result: list[tuple[str, str]] = []
        seen: set[str] = set()
        for page in range(1, max_pages + 1):
            data = self._json(
                f"{BASE}/ajax/search/artworks/{quote(tag)}",
                params={"word": tag, "order": "date_d", "mode": "all",
                        "p": page, "s_mode": "s_tag", "type": "all", "lang": "en"},
            )
            items = (data.get("body") or {}).get("illust", {}).get("data") or []
            if not items:
                break
            for it in items:
                iid = str(it.get("id"))
                if iid and iid not in seen:
                    seen.add(iid)
                    result.append((iid, it.get("createDate") or ""))
            if len(items) < 48:
                break
        return result

    def user_illusts(self, user_id: str) -> list[tuple[str, str]]:
        """Все иллюстрации пользователя: profile/all + пакетные запросы деталей."""
        profile = self._json(f"{BASE}/ajax/user/{user_id}/profile/all")
        body = profile.get("body") or {}
        ids = list((body.get("illusts") or {}).keys())
        result: list[tuple[str, str]] = []
        for i in range(0, len(ids), 48):
            chunk = ids[i:i + 48]
            query = "".join(f"ids[]={x}&" for x in chunk)
            data = self._json(f"{BASE}/ajax/user/{user_id}/illusts?{query}type=illust&lang=en")
            works = data.get("body") or {}
            for iid, work in works.items():
                result.append((str(iid), (work or {}).get("createDate") or ""))
        return result

    def illust_pages(self, illust_id: str) -> list[str]:
        """Список original-URL всех страниц поста."""
        data = self._json(f"{BASE}/ajax/illust/{illust_id}/pages")
        urls = []
        for page in data.get("body") or []:
            original = ((page or {}).get("urls") or {}).get("original")
            if original:
                urls.append(original)
        return urls

    # ----------------------------- разрешение ----------------------------

    def resolve(self, parsed: dict) -> list[tuple[str, str]]:
        kind = parsed["kind"]
        if kind == "tag":
            return self.search_illusts(parsed["tag"])
        if kind in ("user", "user_illustrations"):
            return self.user_illusts(parsed["user_id"])
        if kind == "illust":
            iid = parsed["illust_id"]
            return [(iid, "")]
        raise ValueError(f"Неподдерживаемый тип ссылки: {kind}")


def ext_from_url(url: str) -> str:
    name = url.rsplit("/", 1)[-1].split("?")[0]
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else "jpg"
    return ext if ext in ("jpg", "jpeg", "png", "gif", "webp") else "jpg"
