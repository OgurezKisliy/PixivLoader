export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) bytes = 0;
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(digits)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(digits)} МБ`;
  return `${(mb / 1024).toFixed(2)} ГБ`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "0 Б/с";
  return `${formatBytes(bps)}/с`;
}

export function formatPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export function formatEta(remainingBytes: number, bps: number): string {
  if (bps <= 0 || remainingBytes <= 0) return "—";
  const sec = Math.round(remainingBytes / bps);
  if (sec < 60) return `${sec} с`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min < 60) return `${min} м ${rest.toString().padStart(2, "0")} с`;
  return `${Math.floor(min / 60)} ч ${min % 60} м`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function pluralFiles(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "файл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "файла";
  return "файлов";
}
