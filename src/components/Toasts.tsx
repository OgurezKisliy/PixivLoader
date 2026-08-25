import type { Toast } from "../types";
import { IAlert, ICheck, IInfo, IX } from "./icons";

interface Props {
  toasts: Toast[];
  onClose: (id: number) => void;
}

const STYLE: Record<Toast["kind"], { border: string; icon: JSX.Element }> = {
  success: { border: "border-l-mint", icon: <ICheck size={14} className="text-mint" /> },
  error: { border: "border-l-coral", icon: <IAlert size={14} className="text-coral" /> },
  warn: { border: "border-l-amberx", icon: <IAlert size={14} className="text-amberx" /> },
  info: { border: "border-l-pixiv", icon: <IInfo size={14} className="text-pixiv" /> },
};

export default function Toasts({ toasts, onClose }: Props) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in pointer-events-auto flex items-start gap-2.5 rounded-md border border-line border-l-4 bg-card px-3 py-2.5 shadow-lg dark:border-edge dark:bg-panel2 ${STYLE[t.kind].border}`}
        >
          <span className="mt-0.5 shrink-0">{STYLE[t.kind].icon}</span>
          <p className="flex-1 text-[13px] font-semibold leading-snug text-ink dark:text-mist">{t.text}</p>
          <button
            className="shrink-0 cursor-pointer text-soft transition-colors hover:text-ink dark:text-faint dark:hover:text-mist"
            onClick={() => onClose(t.id)}
            aria-label="Закрыть уведомление"
          >
            <IX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
