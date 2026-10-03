import Link from "next/link";
import { useId } from "react";

export function BrandMark({ size = 32 }: { size?: number }) {
  // Unique per instance: a shared gradient ID breaks when the first copy is display:none.
  const gradientId = `brand-${useId()}`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b68ff" />
          <stop offset="1" stopColor="#4f37d8" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill={`url(#${gradientId})`} />
      <g transform="rotate(-45 256 256)" fill="none" stroke="#fff" strokeWidth="44" strokeLinecap="round">
        <rect x="92" y="196" width="200" height="120" rx="60" />
        <rect x="220" y="196" width="200" height="120" rx="60" />
      </g>
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="focus-ring -m-1 flex items-center gap-2.5 rounded-xl p-1 text-ink"
      aria-label="Link Your Dude home"
    >
      <BrandMark size={compact ? 28 : 32} />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight">
          Link Your Dude
        </span>
      )}
    </Link>
  );
}
