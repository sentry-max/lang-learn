import { useMemo } from "react";

const COLORS = ["#3b5bfd", "#1f9d55", "#f5a524", "#e0457b", "#7c5cff", "#15b8a6"];

/** A short, CSS-only confetti burst for a well-done session. */
export default function Confetti({ pieces = 40 }: { pieces?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.4 + Math.random() * 1.2,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 160,
        color: COLORS[i % COLORS.length],
      })),
    [pieces]
  );
  return (
    <div className="confetti" aria-hidden="true">
      {items.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ["--rotate" as string]: `${p.rotate}deg`,
            ["--drift" as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
