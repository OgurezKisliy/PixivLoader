import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Фронтенд по ТЗ работает на порту 3002.
// HMR-сокет закрепён за тем же портом: иначе при занятом 3000 клиент Vite
// теряет HMR-соединение и начинает циклически перезагружать страницу.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3002,
    strictPort: true,
    hmr: {
      port: 3002,
    },
    // Бэкенд пишет в SQLite (pixiv_loader.db + WAL-файл) после каждого действия —
    // без этого Vite воспринимает изменения .db-wal как повод для полной
    // перезагрузки страницы. Исключаем бэкенд, загрузки и venv из наблюдения.
    watch: {
      ignored: [
        "**/backend/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/.venv/**",
      ],
    },
  },
});
