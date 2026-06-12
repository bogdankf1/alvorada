/**
 * The single 16px stroke-icon family (DESIGN.md): era-true metaphors,
 * 1.6px rounded strokes, currentColor. No emoji, no mixed sets.
 */
import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  style?: CSSProperties;
  className?: string;
}

function Svg({ size = 15, style, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** food */
export function IconWheat(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 14 8 5" />
      <path d="M8 7C6.5 7 5.4 6 5.2 4.4 6.8 4.4 7.9 5.4 8 7Z" fill="currentColor" stroke="none" />
      <path d="M8 7C9.5 7 10.6 6 10.8 4.4 9.2 4.4 8.1 5.4 8 7Z" fill="currentColor" stroke="none" />
      <path d="M8 10C6.5 10 5.4 9 5.2 7.4 6.8 7.4 7.9 8.4 8 10Z" fill="currentColor" stroke="none" />
      <path d="M8 10C9.5 10 10.6 9 10.8 7.4 9.2 7.4 8.1 8.4 8 10Z" fill="currentColor" stroke="none" />
      <path d="M8 4.6 8 2" />
    </Svg>
  );
}

/** production */
export function IconCog(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 2.4v2M8 11.6v2M2.4 8h2M11.6 8h2M4 4l1.4 1.4M10.6 10.6 12 12M12 4l-1.4 1.4M5.4 10.6 4 12" />
    </Svg>
  );
}

/** science */
export function IconScroll(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 3.5h8a1.5 1.5 0 0 1 0 3" />
      <path d="M4.5 3.5A1.5 1.5 0 0 0 3 5v7a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 12V6.5" />
      <path d="M6 7.5h4M6 10h3" />
    </Svg>
  );
}

/** culture */
export function IconAmphora(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.2 2.2h3.6M7 2.2v1.6M9 2.2v1.6" />
      <path d="M7 3.8h2c2.4 1.4 2.6 3.4 1.3 5.2-.8 1.1-.9 2.4-.2 3.6.3.5 0 1.2-.7 1.2H6.6c-.7 0-1-.7-.7-1.2.7-1.2.6-2.5-.2-3.6C4.4 7.2 4.6 5.2 7 3.8Z" />
      <path d="M4.8 5.6c-1 .2-1.6.7-1.6 1.4M11.2 5.6c1 .2 1.6.7 1.6 1.4" />
    </Svg>
  );
}

/** gold */
export function IconCoin(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="5.4" />
      <circle cx="8" cy="8" r="3" />
      <path d="M8 6.4v3.2" />
    </Svg>
  );
}

/** score */
export function IconLaurel(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.2 3c-1 2.8-1 5.6.6 8.2 1 1.5 2.1 2.2 3.2 2.6" />
      <path d="M11.8 3c1 2.8 1 5.6-.6 8.2-1 1.5-2.1 2.2-3.2 2.6" />
      <path d="M3.4 6.4 5 6M3.8 9.2l1.6-.6M5 11.6l1.4-1M12.6 6.4 11 6M12.2 9.2l-1.6-.6M11 11.6l-1.4-1" />
    </Svg>
  );
}

/** war */
export function IconSwords(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 3l7.4 7.4M13 3 5.6 10.4" />
      <path d="M9.6 12.2 12.2 9.6M3.8 9.6l2.6 2.6" />
      <path d="M11 13.4 13.4 11M2.6 11 5 13.4" />
    </Svg>
  );
}

/** movement */
export function IconBoots(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12.5h10" />
      <path d="M5 3v6l4 1.5 1 2H4.5L4 9" />
    </Svg>
  );
}

/** strength */
export function IconShield(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2 13 4v4c0 3-2 5-5 6-3-1-5-3-5-6V4Z" />
    </Svg>
  );
}

/** city population */
export function IconPeople(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5.6" cy="5.4" r="2" />
      <path d="M2.4 13c.3-2.6 1.6-4 3.2-4s2.9 1.4 3.2 4" />
      <circle cx="11" cy="5" r="1.6" />
      <path d="M9.8 8.7c.4-.3.8-.5 1.2-.5 1.4 0 2.4 1.2 2.7 3.4" />
    </Svg>
  );
}

export function IconHourglass(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 2.5h7M4.5 13.5h7" />
      <path d="M5.5 2.5c0 3 1.2 4.2 2.5 5.5 1.3-1.3 2.5-2.5 2.5-5.5M5.5 13.5c0-3 1.2-4.2 2.5-5.5 1.3 1.3 2.5 2.5 2.5 5.5" />
    </Svg>
  );
}

export const YIELD_ICONS = {
  food: IconWheat,
  production: IconCog,
  science: IconScroll,
  culture: IconAmphora,
  gold: IconCoin,
} as const;

export const YIELD_COLORS: Record<string, string> = {
  food: '#9CC069',
  production: '#D08B4C',
  science: '#7FB6D9',
  culture: '#C490D1',
  gold: '#E3C47D',
};
