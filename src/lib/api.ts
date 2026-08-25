import type { LogEntry, Settings, Task } from "../types";

export const API_BASE = "http://127.0.0.1:8002";

export interface ApiState {
  tasks: Task[];
  settings: Settings;
  active_id: number | null;
  server: string;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  probe(): Promise<{ ok: boolean; version: string }> {
    return request("/api/health", undefined, 1500);
  },

  state(): Promise<ApiState> {
    return request("/api/state");
  },

  logs(since: number): Promise<{ logs: LogEntry[] }> {
    return request(`/api/logs?since=${since}`);
  },

  clearLogs(): Promise<{ ok: boolean }> {
    return request("/api/logs/clear", { method: "POST" });
  },

  addTask(url: string): Promise<{ ok: boolean; task?: Task; error?: string; existing?: Task }> {
    return request("/api/tasks", { method: "POST", body: JSON.stringify({ url }) });
  },

  pause(id: number): Promise<{ ok: boolean }> {
    return request(`/api/tasks/${id}/pause`, { method: "POST" });
  },

  resume(id: number): Promise<{ ok: boolean }> {
    return request(`/api/tasks/${id}/resume`, { method: "POST" });
  },

  restart(id: number): Promise<{ ok: boolean }> {
    return request(`/api/tasks/${id}/restart`, { method: "POST" });
  },

  remove(id: number): Promise<{ ok: boolean }> {
    return request(`/api/tasks/${id}`, { method: "DELETE" });
  },

  clearCompleted(): Promise<{ ok: boolean; hidden: number }> {
    return request("/api/tasks/clear-completed", { method: "POST" });
  },

  getSettings(): Promise<Settings> {
    return request("/api/settings");
  },

  saveSettings(s: Settings): Promise<{ ok: boolean; settings: Settings }> {
    return request("/api/settings", { method: "PUT", body: JSON.stringify(s) });
  },

  testProxy(proxy: string): Promise<{ ok: boolean; ms: number; status?: number }> {
    return request("/api/test-proxy", { method: "POST", body: JSON.stringify({ proxy }) }, 12000);
  },

  shutdown(): Promise<{ ok: boolean }> {
    return request("/api/shutdown", { method: "POST" });
  },
};
