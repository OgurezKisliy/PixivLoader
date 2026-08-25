import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry, LogLevel } from "../types";
import { formatClock } from "../lib/format";
import { IBolt, ITrash } from "./icons";

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

type Filter = "all" | "info" | "warn" | "error";

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: "text-pixiv dark:text-pixivhi",
  success: "text-mint",
  warn: "text-amberx",
  error: "text-coral",
};

const LEVEL_TAG: Record<LogLevel, string> = {
  info: "INFO",
  success: "OK",
  warn: "WARN",
  error: "ERR",
};

export default function LogsPanel({ logs, onClear }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const boxRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const filtered = useMemo(() => {
    if (filter === "all") return logs;
    if (filter === "info") return logs.filter((l) => l.level === "info" || l.level === "success");
    if (filter === "warn") return logs.filter((l) => l.level === "warn");
    return logs.filter((l) => l.level === "error");
  }, [logs, filter]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  const counts = useMemo(
    () => ({
      all: logs.length,
      info: logs.filter((l) => l.level === "info" || l.level === "success").length,
      warn: logs.filter((l) => l.level === "warn").length,
      error: logs.filter((l) => l.level === "error").length,
    }),
    [logs],
  );

  return (
    <aside className="panel rise-in flex min-h-0 flex-col overflow-hidden" style={{ animationDelay: "60ms" }}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 dark:border-edge">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
        </span>
        <h2 className="font-display text-[13px] font-bold tracking-wide text-ink dark:text-mist">Журнал событий</h2>
        <span className="font-mono text-[11px] text-soft dark:text-faint">{logs.length}</span>
        <button className="btn ml-auto !px-2 !py-1 !text-[11px]" onClick={onClear} title="Очистить журнал">
          <ITrash size={12} />
        </button>
      </div>

      <div className="flex gap-1.5 border-b border-line px-3 py-2 dark:border-edge">
        {(
          [
            ["all", "Все"],
            ["info", "Инфо"],
            ["warn", "Предупр."],
            ["error", "Ошибки"],
          ] as Array<[Filter, string]>
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
              filter === f
                ? "border-pixiv/50 bg-pixiv/10 text-pixiv"
                : "border-line text-soft hover:border-linehi dark:border-edge dark:text-faint dark:hover:text-dim"
            }`}
          >
            {label} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="nice-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed"
      >
        {filtered.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <IBolt size={22} className="text-soft dark:text-faint" />
            <p className="text-[12px] text-soft dark:text-faint">Событий этого типа пока нет</p>
          </div>
        )}
        {filtered.map((l) => (
          <div key={l.id} className="log-in flex gap-2 border-b border-line/60 py-[3px] last:border-0 dark:border-edge/60">
            <span className="shrink-0 text-[10.5px] text-soft/80 dark:text-faint/80">{formatClock(l.ts)}</span>
            <span className={`w-9 shrink-0 font-bold ${LEVEL_STYLE[l.level]}`}>{LEVEL_TAG[l.level]}</span>
            <span className="min-w-0 break-words text-ink/90 dark:text-mist/85">{l.message}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
