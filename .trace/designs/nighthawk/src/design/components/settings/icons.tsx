import type { SVGAttributes } from "react";

const PATHS: Record<string, React.ReactNode> = {
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 19.8c.4-3.4 3-5.4 6.2-5.4s5.8 2 6.2 5.4" />
      <circle cx="17" cy="9.2" r="2.5" />
      <path d="M17.8 14.6c2.3.5 3.6 2.2 3.9 4.6" />
    </>
  ),
  gitBranch: (
    <>
      <circle cx="6.5" cy="6" r="2.4" />
      <circle cx="6.5" cy="18" r="2.4" />
      <circle cx="17.5" cy="6" r="2.4" />
      <path d="M6.5 8.4v7.2" />
      <path d="M17.5 8.4c0 4.6-6 5.2-8.8 6.6" />
    </>
  ),
  cloud: (
    <path d="M7 18.5a4.2 4.2 0 0 1-.5-8.37A5.6 5.6 0 0 1 17.4 9.3a4 4 0 0 1 .1 9.2H7Z" />
  ),
  key: (
    <>
      <circle cx="7.3" cy="15.7" r="3.4" />
      <path d="M9.8 13.2 20 3" />
      <path d="M15.2 7.8 18 10.6" />
    </>
  ),
  plug: (
    <>
      <path d="M9 7V3.5M15 7V3.5" />
      <path d="M6.8 7h10.4v3.6a5.2 5.2 0 0 1-10.4 0V7Z" />
      <path d="M12 16v4.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="14.5" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="17" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  laptop: (
    <>
      <rect x="4.5" y="5" width="15" height="10" rx="1.5" />
      <path d="M2.5 18.5h19" />
    </>
  ),
  smartphone: (
    <>
      <rect x="8" y="3" width="8" height="18" rx="2" />
      <path d="M11.2 17.8h1.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m15.6 15.6 4.4 4.4" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="m6.5 7 .9 13h9.2l.9-13" />
    </>
  ),
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  pencil: <path d="M4 20l1.1-4.1L16.6 4.4a2.05 2.05 0 0 1 2.9 2.9L8.1 18.9 4 20Z" />,
  shield: <path d="M12 3.2 19 6v5c0 4.4-2.9 8.3-7 9.8-4.1-1.5-7-5.4-7-9.8V6l7-2.8Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l3.1 2" />
    </>
  ),
  terminal: (
    <>
      <path d="m5 7 5 5-5 5" />
      <path d="M12.5 19H19" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  hash: <path d="M9.5 4 7.8 20M16.8 4 15 20M4.5 9.3h16M3.5 14.7h16" />,
  eye: (
    <>
      <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  zap: <path d="M13 2.5 5 13.4h5.6L10.2 21.5 18.4 10.6h-5.6L13 2.5Z" />,
  externalLink: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.2 4.8 11 13" />
      <path d="M17.5 13.5V19h-13V6H10" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11v5M12 7.8h.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 5.5v5h-5" />
      <path d="M19.6 10.5a8 8 0 1 0 .4 3" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

type IconProps = SVGAttributes<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 16, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
