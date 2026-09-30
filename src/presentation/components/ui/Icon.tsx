/** Small inline SVG icon set (stroke icons on a 24×24 grid). */

type Shape = string | { circle: [number, number, number] };

const ICONS = {
  quiz: ["M13 2 3 14h9l-1 8 10-12h-9l1-8z"],
  history: [{ circle: [12, 12, 10] }, "M12 6v6l4 2"],
  book: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"],
  compass: [{ circle: [12, 12, 10] }, "M16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88z"],
  chart: ["M3 3v18h18", "M18 17V9", "M13 17V5", "M8 17v-3"],
  settings: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  close: ["M18 6 6 18", "M6 6l12 12"],
  check: ["M20 6 9 17l-5-5"],
  plus: ["M12 5v14", "M5 12h14"],
  timer: [{ circle: [12, 13, 8] }, "M12 9v4l2 2", "M9 2h6"],
  hourglass: [
    "M5 22h14",
    "M5 2h14",
    "M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22",
    "M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2",
  ],
  infinity: [
    "M18.2 7.5a4.5 4.5 0 1 1 0 9c-2.5 0-4-2.5-6.2-4.5S8.3 7.5 5.8 7.5a4.5 4.5 0 1 0 0 9c2.5 0 4-2.5 6.2-4.5s3.7-4.5 6.2-4.5z",
  ],
  volume: ["M11 5 6 9H2v6h4l5 4V5z", "M15.54 8.46a5 5 0 0 1 0 7.07", "M19.07 4.93a10 10 0 0 1 0 14.14"],
  hint: ["M9 18h6", "M10 22h4", "M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"],
  arrowRight: ["M5 12h14", "M12 5l7 7-7 7"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  trash: [
    "M3 6h18",
    "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
    "M10 11v6",
    "M14 11v6",
    "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  ],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  sun: [
    { circle: [12, 12, 4] },
    "M12 2v2",
    "M12 20v2",
    "M4.93 4.93l1.41 1.41",
    "M17.66 17.66l1.41 1.41",
    "M2 12h2",
    "M20 12h2",
    "M6.34 17.66l-1.41 1.41",
    "M19.07 4.93l-1.41 1.41",
  ],
  moon: ["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"],
  monitor: ["M3 4h18v12H3z", "M8 20h8", "M12 16v4"],
  trophy: ["M8 21h8", "M12 17v4", "M7 4h10v5a5 5 0 0 1-10 0V4z", "M17 5h3v2a3 3 0 0 1-3 3", "M7 5H4v2a3 3 0 0 0 3 3"],
  refresh: ["M21 12a9 9 0 1 1-2.64-6.36L21 8", "M21 3v5h-5"],
  globe: [{ circle: [12, 12, 10] }, "M2 12h20", "M12 2a15 15 0 0 1 0 20", "M12 2a15 15 0 0 0 0 20"],
  wifiOff: ["M2 2l20 20", "M8.5 16.5a5 5 0 0 1 7 0", "M5 12.9a10 10 0 0 1 5.2-2.8", "M12 20h.01", "M16.7 11a10 10 0 0 1 2.3 1.9"],
  cloud: ["M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"],
  cloudOff: [
    "M2 2l20 20",
    "M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.31-.2",
    "M21.53 15.5A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 9.8 5.06",
  ],
  volumeOff: ["M11 5 6 9H2v6h4l5 4V5z", "M22 9l-6 6", "M16 9l6 6"],
  mic: ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v3"],
  star: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"],
  search: [{ circle: [11, 11, 8] }, "M21 21l-4.35-4.35"],
  chevronDown: ["M6 9l6 6 6-6"],
  back: ["M19 12H5", "M12 19l-7-7 7-7"],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  label?: string;
}

export default function Icon({ name, size = 20, className, label }: Props) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {(ICONS[name] as Shape[]).map((shape, i) =>
        typeof shape === "string" ? (
          <path key={i} d={shape} />
        ) : (
          <circle key={i} cx={shape.circle[0]} cy={shape.circle[1]} r={shape.circle[2]} />
        )
      )}
    </svg>
  );
}
