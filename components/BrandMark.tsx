/** Roof line in asphalt with a small chalk-blue pitch triangle (docs/SPEC.md Components). */
export function BrandMark({ width = 34, height = 24 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 34 24" aria-hidden="true" focusable="false">
      <path d="M2 22 L17 4 L32 22" fill="none" stroke="#22262A" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M21 22 H29 V14" fill="none" stroke="#2F6FD0" strokeWidth="1.5" />
    </svg>
  );
}
