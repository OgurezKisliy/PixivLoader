# -*- coding: utf-8 -*-
"""Запуск бэкенда Pixiv Loader на порту 8002:  python run.py"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8002, log_level="info")
