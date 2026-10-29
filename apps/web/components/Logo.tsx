/**
 * Mira & Muse brand mark: two joined arches forming an "m" — Mira and Muse, each arch mirroring
 * the other — inside a ring, with a gold four-point spark above for the muse. Drawn in
 * currentColor so it inherits text colour on light and dark backgrounds; the spark stays gold.
 */
export function LogoMark({ className = "h-9 w-9", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M13 34V23.5a5.5 5.5 0 0 1 11 0V34M24 23.5a5.5 5.5 0 0 1 11 0V34"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24 8.5l1.15 2.85L28 12.5l-2.85 1.15L24 16.5l-1.15-2.85L20 12.5l2.85-1.15z" fill="#b3966a" />
    </svg>
  );
}

/** Mark + wordmark. The ampersand is set italic in the accent gold, matching the mark's spark. */
export function Logo({ className = "", markClassName = "h-9 w-9", wordClassName = "text-2xl" }: { className?: string; markClassName?: string; wordClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span className={`font-serif tracking-wide leading-none whitespace-nowrap ${wordClassName}`}>
        Mira <span className="italic text-accent">&amp;</span> Muse
      </span>
    </span>
  );
}
