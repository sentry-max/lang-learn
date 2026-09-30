import { useId } from "react";
import { useLiquidGlass } from "@presentation/hooks/useLiquidGlass";

interface Props {
  size: number;
  className?: string;
}

/**
 * The app logo: the ring-and-dot mark. The classic style uses the logo image;
 * Liquid Glass draws the same mark as a glass iOS app icon (system blue to
 * indigo, a glossy sheen and a bright rim).
 */
export default function AppLogo({ size, className }: Props) {
  const liquid = useLiquidGlass();
  const id = useId();
  if (!liquid) {
    return <img className={className} src="/icons/logo-128.png" alt="" width={size} height={size} decoding="async" />;
  }
  return (
    <svg className={`${className ?? ""} glass-logo`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ac8fa" />
          <stop offset="0.5" stopColor="#007aff" />
          <stop offset="1" stopColor="#5e5ce6" />
        </linearGradient>
        <linearGradient id={`${id}sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.48" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill={`url(#${id}bg)`} />
      <rect width="100" height="100" rx="23" fill={`url(#${id}sheen)`} />
      <circle cx="53.3" cy="44.3" r="21.7" fill="none" stroke={`url(#${id}ring)`} strokeWidth="8.5" />
      <circle cx="25.4" cy="72.4" r="8.6" fill="#fff" />
      <rect x="1" y="1" width="98" height="98" rx="22" fill="none" stroke={`url(#${id}rim)`} strokeWidth="2" />
    </svg>
  );
}
