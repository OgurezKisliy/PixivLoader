import React from "react";

type P = { size?: number; className?: string; strokeWidth?: number };

function base(
  { size = 16, className = "", strokeWidth = 1.9 }: P,
  children: React.ReactNode,
  viewBox = "0 0 24 24",
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IPlus = (p: P) => base(p, <path d="M12 5v14M5 12h14" />);
export const IClipboard = (p: P) =>
  base(
    p,
    <>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 12h6M9 16h4" />
    </>,
  );
export const IGear = (p: P) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12a7 7 0 0 0-.15-1.44l2.03-1.58-2-3.46-2.4.97a7 7 0 0 0-2.48-1.44L13.6 2.5h-3.2L10 5.05a7 7 0 0 0-2.48 1.44l-2.4-.97-2 3.46 2.03 1.58A7 7 0 0 0 5 12c0 .49.05.97.15 1.44l-2.03 1.58 2 3.46 2.4-.97a7 7 0 0 0 2.48 1.44l.4 2.55h3.2l.4-2.55a7 7 0 0 0 2.48-1.44l2.4.97 2-3.46-2.03-1.58c.1-.47.15-.95.15-1.44Z" />
    </>,
  );
export const ISun = (p: P) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
  );
export const IMoon = (p: P) =>
  base(p, <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />);
export const IPower = (p: P) =>
  base(
    p,
    <>
      <path d="M12 3v8" />
      <path d="M6.6 6.6a8 8 0 1 0 10.8 0" />
    </>,
  );
export const IPlay = (p: P) => base(p, <path d="M7 4.8v14.4L19 12 7 4.8Z" />);
export const IPause = (p: P) => base(p, <path d="M8 5v14M16 5v14" />);
export const IRestart = (p: P) =>
  base(
    p,
    <>
      <path d="M3.5 8.5A9 9 0 0 1 20 12" />
      <path d="M20.5 15.5A9 9 0 0 1 4 12" />
      <path d="M20 4v4.5h-4.5M4 20v-4.5h4.5" />
    </>,
  );
export const ICopy = (p: P) =>
  base(
    p,
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
  );
export const ITrash = (p: P) =>
  base(
    p,
    <>
      <path d="M3.5 6.5h17M8.5 6V4.5A1.5 1.5 0 0 1 10 3h4a1.5 1.5 0 0 1 1.5 1.5V6" />
      <path d="M5.5 6.5 6.4 19a2 2 0 0 0 2 1.9h7.2a2 2 0 0 0 2-1.9l.9-12.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>,
  );
export const IX = (p: P) => base(p, <path d="M6 6l12 12M18 6 6 18" />);
export const ITag = (p: P) =>
  base(
    p,
    <>
      <path d="M3 10V4a1 1 0 0 1 1-1h6l11 11-7 7L3 10Z" />
      <circle cx="8" cy="8" r="1.4" />
    </>,
  );
export const IUser = (p: P) =>
  base(
    p,
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-3.5 4-5.5 7.5-5.5s6.3 2 7.5 5.5" />
    </>,
  );
export const ICheck = (p: P) => base(p, <path d="m4.5 12.5 5 5L19.5 7" />);
export const IAlert = (p: P) =>
  base(
    p,
    <>
      <path d="M12 3.5 22 20H2L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </>,
  );
export const IInfo = (p: P) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.1" />
    </>,
  );
export const ILink = (p: P) =>
  base(
    p,
    <>
      <path d="M10 14a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5.93" />
      <path d="M14 10a5 5 0 0 0-7.07 0L4.8 12.12a5 5 0 0 0 7.07 7.07L13 18.07" />
    </>,
  );
export const IDownload = (p: P) =>
  base(
    p,
    <>
      <path d="M12 3.5V15m0 0 4.5-4.5M12 15l-4.5-4.5" />
      <path d="M4 16.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2.5" />
    </>,
  );
export const IFolder = (p: P) =>
  base(p, <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z" />);
export const IWifi = (p: P) =>
  base(
    p,
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.5 16a5.5 5.5 0 0 1 7 0" />
      <path d="M12 19.5v.1" />
    </>,
  );
export const IWifiOff = (p: P) =>
  base(
    p,
    <>
      <path d="m3.5 3.5 17 17" />
      <path d="M8.5 16a5.5 5.5 0 0 1 5-1.4M5.5 12.5a10 10 0 0 1 3.4-2.1m7.5.4c1 .5 2 1.1 2.9 1.7M2.5 9a14 14 0 0 1 4-2.6m9.9-.3A14 14 0 0 1 21.5 9" />
      <path d="M12 19.5v.1" />
    </>,
  );
export const ISpinner = ({ size = 16, className = "" }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.4" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
export const IImage = (p: P) =>
  base(
    p,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 18 5-5 3 3 3.5-3.5 3.5 3.5" />
    </>,
  );
export const IBolt = (p: P) => base(p, <path d="M13 2.5 4.5 13.5H11l-1 8L18.5 10H12l1-7.5Z" />);
export const IChevronDown = (p: P) => base(p, <path d="m6 9.5 6 6 6-6" />);

/** Логотип: стрелка загрузки в лоток, фирменный голубой Pixiv. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="41" height="41" rx="11" fill="#0096fa" />
      <rect x="1.5" y="1.5" width="41" height="41" rx="11" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
      <path
        d="M22 10v14m0 0-6-6m6 6 6-6M12 31.5h20"
        stroke="white"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="35.5" cy="9.5" r="2.1" fill="#7fe0ff" />
    </svg>
  );
}
