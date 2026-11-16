// Inline SVG artwork for the hero. Decorative only; kept inline so nothing extra is downloaded.
const LIGHT = '#f1efe8';
const ORANGE = 'var(--color-accent)';

type ArtProps = { className?: string };

export function Sneaker({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden>
      <path d="M13 52c0-12 6-22 17-26l14-5c4 9 12 17 24 21l25 7c10 2 16 6 16 12v2H13z" fill={LIGHT} />
      <path d="M13 52c0-5 1-9 3-13 6 6 14 9 24 9h40l13 3c10 2 16 6 16 12v1H13z" fill="#d3d0c6" />
      <rect x="10" y="62" width="101" height="10" rx="5" fill="#ffffff" />
      <path d="M22 67h78" stroke="#b9b6ab" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 5" />
      <path d="M47 27l8-6M55 33l8-6M63 38l8-6" stroke={ORANGE} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M17 40c2-5 6-10 12-13l3 12c-5 2-10 2-15 1z" fill={ORANGE} />
    </svg>
  );
}

export function Phone({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <rect x="29" y="6" width="42" height="88" rx="10" fill={LIGHT} />
      <rect x="32.5" y="9.5" width="35" height="81" rx="7" fill="#111110" />
      <rect x="37" y="22" width="26" height="26" rx="6" fill="#2a2a28" />
      <rect x="37" y="55" width="20" height="3.4" rx="1.7" fill="#5a5954" />
      <rect x="37" y="62" width="13" height="3.4" rx="1.7" fill="#3a3a36" />
      <rect x="37" y="74" width="26" height="9" rx="4.5" fill={ORANGE} />
    </svg>
  );
}

export function Bag({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M34 42c0-26 32-26 32 0" fill="none" stroke={LIGHT} strokeWidth="5" strokeLinecap="round" />
      <path d="M21 40h58l6 42a6 6 0 0 1-6 7H21a6 6 0 0 1-6-7z" fill={LIGHT} />
      <path d="M19 52h62" stroke="#c4c1b6" strokeWidth="1.5" />
      <rect x="43" y="47" width="14" height="11" rx="3" fill={ORANGE} />
    </svg>
  );
}

export function Headphones({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M21 60V50a29 29 0 0 1 58 0v10" fill="none" stroke={LIGHT} strokeWidth="6" strokeLinecap="round" />
      <rect x="12" y="54" width="19" height="32" rx="9" fill={LIGHT} />
      <rect x="69" y="54" width="19" height="32" rx="9" fill={LIGHT} />
      <rect x="12" y="63" width="5.5" height="14" rx="2.75" fill={ORANGE} />
      <rect x="82.5" y="63" width="5.5" height="14" rx="2.75" fill={ORANGE} />
    </svg>
  );
}
