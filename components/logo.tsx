/** AXIOM logomark — volt tile, bold A with the "gate bar" as its crossbar. */
export function AxiomMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#B4F03C" />
      <path d="M16 6.5 L25 25.5 H20.9 L16 13.7 L11.1 25.5 H7 Z" fill="#0B0F0D" />
      <rect x="10.5" y="18.6" width="11" height="2.8" rx="1.4" fill="#0B0F0D" />
    </svg>
  );
}

export function AxiomWordmark({ mark = 26 }: { mark?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <AxiomMark size={mark} />
      <span className="font-display text-[17px] font-bold tracking-[0.02em] text-ink">AXIOM</span>
    </span>
  );
}
