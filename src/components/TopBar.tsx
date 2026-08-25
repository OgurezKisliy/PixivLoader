import { useState } from "react";
import {
  IClipboard,
  IGear,
  IMoon,
  IPlus,
  IPower,
  ISpinner,
  ISun,
  ITrash,
  IWifi,
  IWifiOff,
  IX,
  Logo,
} from "./icons";

interface Props {
  url: string;
  onUrlChange: (v: string) => void;
  onAdd: () => void;
  adding: boolean;
  onPaste: () => void;
  mode: "demo" | "live";
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onExit: () => void;
  showCompleted: boolean;
  onToggleShowCompleted: () => void;
  onClearCompleted: () => void;
  completedVisible: number;
}

export default function TopBar(p: Props) {
  const [confirmExit, setConfirmExit] = useState(false);

  return (
    <header className="panel rise-in relative z-20 px-4 py-3.5 sm:px-5">
      {/* row 1: brand + system controls */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-3">
          <Logo size={38} />
          <div className="leading-tight">
            <div className="font-display text-[15px] font-bold tracking-wide text-ink dark:text-mist">
              PIXIV<span className="text-pixiv"> LOADER</span>
            </div>
            <div className="font-mono text-[10.5px] text-soft dark:text-faint">
              локальная очередь загрузок · localhost:8002
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* connection chip */}
          {p.mode === "live" ? (
            <span className="chip border-mint/40 bg-mint/10 text-mint">
              <IWifi size={12} /> сервер подключён
            </span>
          ) : (
            <span className="chip border-amberx/40 bg-amberx/10 text-amberx" title="Бэкенд на 127.0.0.1:8002 не отвечает — интерфейс работает в демо-режиме">
              <IWifiOff size={12} /> демо-режим
            </span>
          )}

          <button className="btn !px-2.5" title="Сменить тему" onClick={p.onToggleTheme}>
            {p.theme === "dark" ? <ISun size={15} /> : <IMoon size={15} />}
          </button>
          <button className="btn !px-2.5" title="Настройки" onClick={p.onOpenSettings}>
            <IGear size={15} />
            <span className="hidden sm:inline">Настройки</span>
          </button>

          <div className="relative">
            <button
              className="btn !px-2.5 !text-coral hover:!border-coral/40 hover:!bg-coral/10"
              title="Выход — корректное завершение процессов"
              onClick={() => setConfirmExit((v) => !v)}
            >
              <IPower size={15} />
              <span className="hidden sm:inline">Выход</span>
            </button>
            {confirmExit && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setConfirmExit(false)} />
                <div className="panel toast-in absolute right-0 top-[calc(100%+8px)] z-40 w-64 p-3">
                  <div className="text-[13px] font-bold text-ink dark:text-mist">Завершить работу?</div>
                  <p className="mt-1 text-xs leading-relaxed text-soft dark:text-dim">
                    Активные загрузки будут остановлены, прогресс сохранён в БД — можно продолжить после перезапуска.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      className="btn-primary flex-1 justify-center !bg-coral !border-coral hover:!bg-coral/85"
                      onClick={() => {
                        setConfirmExit(false);
                        p.onExit();
                      }}
                    >
                      <IPower size={13} /> Выйти
                    </button>
                    <button className="btn flex-1 justify-center" onClick={() => setConfirmExit(false)}>
                      <IX size={13} /> Отмена
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* row 2: command line */}
      <div className="mt-3.5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            className="input !py-2.5 pl-3 font-mono !text-[13px]"
            placeholder="https://www.pixiv.net/en/tags/…/artworks · /users/123/illustrations · /search?q=…"
            value={p.url}
            onChange={(e) => p.onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") p.onAdd();
            }}
            spellCheck={false}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn !py-2.5" onClick={p.onPaste} title="Вставить ссылку из буфера обмена">
            <IClipboard size={15} />
            <span className="hidden md:inline">Из буфера</span>
          </button>
          <button className="btn-primary !py-2.5" onClick={p.onAdd} disabled={p.adding || !p.url.trim()}>
            {p.adding ? <ISpinner size={15} /> : <IPlus size={15} />}
            Добавить
          </button>
        </div>
      </div>

      {/* row 3: filters */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 dark:border-edge">
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <button
            type="button"
            role="switch"
            aria-checked={p.showCompleted}
            data-on={p.showCompleted}
            onClick={p.onToggleShowCompleted}
            className={`switch ${
              p.showCompleted
                ? "border-pixivdim bg-pixiv"
                : "border-linehi bg-card2 dark:border-edgehi dark:bg-deep"
            }`}
          />
          <span className="text-[13px] font-semibold text-ink dark:text-mist">Показывать завершённые</span>
        </label>

        <button
          className="btn !py-1 !text-xs"
          onClick={p.onClearCompleted}
          disabled={p.completedVisible === 0}
          title="Убрать завершённые из интерфейса (записи в БД сохранятся)"
        >
          <ITrash size={13} />
          Очистить завершённые{p.completedVisible > 0 ? ` (${p.completedVisible})` : ""}
        </button>

        <span className="ml-auto hidden font-mono text-[11px] text-soft dark:text-faint lg:inline">
          очередь: одна задача одновременно · дубликаты отклоняются
        </span>
      </div>
    </header>
  );
}
