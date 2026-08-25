import { useState } from "react";
import type { Task } from "../types";
import { KIND_LABEL, STATUS_LABEL } from "../types";
import { formatBytes, formatEta, formatPercent, formatSpeed } from "../lib/format";
import {
  IAlert,
  ICheck,
  ICopy,
  IImage,
  ILink,
  IPause,
  IPlay,
  IRestart,
  ISpinner,
  ITag,
  ITrash,
  IUser,
  IX,
} from "./icons";

interface Props {
  task: Task;
  downloadRoot: string;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onRestart: (id: number) => void;
  onRemove: (id: number) => void;
  onCopy: (url: string) => void;
}

const STATUS_STYLE: Record<Task["status"], { badge: string; dot: string; accent: string }> = {
  queued: {
    badge: "border-linehi bg-card2 text-soft dark:border-edgehi dark:bg-deep dark:text-dim",
    dot: "bg-faint",
    accent: "border-l-faint",
  },
  downloading: {
    badge: "border-pixiv/45 bg-pixiv/10 text-pixiv",
    dot: "bg-pixiv pulse-dot",
    accent: "border-l-pixiv",
  },
  paused: {
    badge: "border-amberx/45 bg-amberx/10 text-amberx",
    dot: "bg-amberx",
    accent: "border-l-amberx",
  },
  completed: {
    badge: "border-mint/45 bg-mint/10 text-mint",
    dot: "bg-mint",
    accent: "border-l-mint",
  },
  error: {
    badge: "border-coral/45 bg-coral/10 text-coral",
    dot: "bg-coral",
    accent: "border-l-coral",
  },
};

function KindIcon({ kind }: { kind: string }) {
  if (kind === "tag") return <ITag size={13} />;
  if (kind === "illust") return <IImage size={13} />;
  return <IUser size={13} />;
}

export default function TaskCard(p: Props) {
  const { task: t } = p;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const s = STATUS_STYLE[t.status];
  const active = t.status === "downloading";
  const filesPct = formatPercent(t.done_files, t.total_files);
  const filePct = t.cur_total > 0 ? Math.min(100, (t.cur_bytes / t.cur_total) * 100) : 0;

  return (
    <article
      className={`panel rise-in relative border-l-[3px] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-lg ${s.accent} ${
        active ? "dark:bg-panel2" : ""
      }`}
    >
      {/* header */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="mt-0.5 inline-flex items-center rounded px-2 py-[3px] font-display text-[10px] font-bold tracking-[0.14em] text-white" style={{ backgroundColor: "#0096fa" }}>
          PIXIV
        </span>
        <span className="chip mt-0.5 border-line text-soft dark:border-edge dark:text-dim">
          <KindIcon kind={t.kind} />
          {KIND_LABEL[t.kind] || t.kind}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[16px] font-bold leading-snug text-ink dark:text-mist">{t.label}</h3>
          <a
            href={t.url}
            target="_blank"
            rel="noreferrer"
            className="group mt-0.5 flex max-w-full items-center gap-1.5 font-mono text-[11.5px] text-soft transition-colors hover:text-pixiv dark:text-faint dark:hover:text-pixivhi"
            title={t.url}
          >
            <ILink size={11} className="shrink-0" />
            <span className="truncate">{t.url}</span>
          </a>
        </div>

        <span className={`chip ${s.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {STATUS_LABEL[t.status]}
        </span>
      </div>

      {/* progress: файлы задачи */}
      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold tracking-[0.08em] text-soft uppercase dark:text-faint">
            Прогресс задачи
          </span>
          <span className="font-mono text-[12px] font-semibold text-ink dark:text-mist">
            {t.done_files} / {t.total_files || "…"}{" "}
            <span className="text-soft dark:text-faint">файлов · {filesPct}%</span>
            {t.skipped_files > 0 && (
              <span className="ml-1.5 text-amberx" title="Пропущено — файлы уже существовали на диске">
                · пропущено {t.skipped_files}
              </span>
            )}
          </span>
        </div>
        <div className="bar-track">
          <div
            className={`bar-fill ${active ? "striped" : ""}`}
            style={{
              width: `${filesPct}%`,
              background:
                t.status === "completed"
                  ? "linear-gradient(90deg,#2fd47f,#5ee6a0)"
                  : t.status === "error"
                    ? "linear-gradient(90deg,#ff5470,#ff8095)"
                    : "linear-gradient(90deg,#0077cc,#0096fa)",
            }}
          />
        </div>
      </div>

      {/* progress: текущий файл */}
      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-soft uppercase dark:text-faint">
            Текущий файл
            {active && (
              <span className="truncate font-mono text-[11px] font-medium normal-case tracking-normal text-pixiv dark:text-pixivhi">
                {t.cur_file}
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-[12px] font-semibold text-ink dark:text-mist">
            {active || t.status === "paused" ? (
              <>
                {formatBytes(t.cur_bytes)} / {formatBytes(t.cur_total)}
                <span className="ml-1.5 text-teal">· {formatSpeed(t.speed)}</span>
              </>
            ) : t.status === "completed" ? (
              <span className="text-mint">все файлы сохранены</span>
            ) : t.status === "error" ? (
              <span className="text-coral">остановлен</span>
            ) : (
              <span className="text-soft dark:text-faint">ожидает очереди</span>
            )}
          </span>
        </div>
        <div className="bar-track !h-[6px]">
          <div
            className={`bar-fill ${active ? "striped" : ""}`}
            style={{
              width: `${t.status === "completed" ? 100 : filePct}%`,
              background: "linear-gradient(90deg,#17c3b2,#54e0cf)",
            }}
          />
        </div>
        {active && t.cur_total > 0 && (
          <div className="mt-1 text-right font-mono text-[10.5px] text-soft dark:text-faint">
            осталось {formatBytes(Math.max(0, t.cur_total - t.cur_bytes))} · ≈ {formatEta(t.cur_total - t.cur_bytes, t.speed)}
          </div>
        )}
      </div>

      {/* error note */}
      {t.status === "error" && t.error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-coral/35 bg-coral/8 px-3 py-2 dark:bg-coral/10">
          <IAlert size={14} className="mt-0.5 shrink-0 text-coral" />
          <p className="font-mono text-[11.5px] leading-relaxed text-coral">{t.error}</p>
        </div>
      )}

      {/* footer / controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 dark:border-edge">
        {t.status === "downloading" && (
          <button className="btn-primary" onClick={() => p.onPause(t.id)}>
            <IPause size={13} /> Пауза
          </button>
        )}
        {(t.status === "paused" || t.status === "error") && (
          <button className="btn-primary" onClick={() => p.onResume(t.id)}>
            <IPlay size={13} /> Старт
          </button>
        )}
        {t.status === "queued" && (
          <span className="btn !cursor-default !opacity-70" aria-disabled>
            <ISpinner size={13} className="opacity-70" /> В очереди
          </span>
        )}
        {t.status === "completed" && (
          <span className="chip border-mint/40 bg-mint/10 !py-1.5 text-mint">
            <ICheck size={12} /> скачано в {p.downloadRoot.replace(/\/+$/, "")}/pixiv/{t.folder}/
          </span>
        )}

        <button className="btn" onClick={() => p.onRestart(t.id)} title="Перезапустить задачу (существующие файлы будут пропущены)">
          <IRestart size={13} /> Перезапустить
        </button>
        <button className="btn" onClick={() => p.onCopy(t.url)} title="Копировать ссылку">
          <ICopy size={13} /> Копировать ссылку
        </button>

        <div className="relative ml-auto">
          <button className="btn-danger" onClick={() => setConfirmDelete((v) => !v)}>
            <ITrash size={13} /> Удалить
          </button>
          {confirmDelete && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setConfirmDelete(false)} />
              <div className="panel toast-in absolute bottom-[calc(100%+8px)] right-0 z-40 w-64 p-3">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink dark:text-mist">
                  <ITrash size={13} className="text-coral" /> Удалить задачу?
                </div>
                <p className="mt-1 text-xs leading-relaxed text-soft dark:text-dim">
                  Задача «{t.label}» будет убрана из очереди. Уже скачанные файлы останутся на диске.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    className="btn-primary flex-1 justify-center !border-coral !bg-coral hover:!bg-coral/85"
                    onClick={() => {
                      setConfirmDelete(false);
                      p.onRemove(t.id);
                    }}
                  >
                    Удалить
                  </button>
                  <button className="btn flex-1 justify-center" onClick={() => setConfirmDelete(false)}>
                    <IX size={13} /> Отмена
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
