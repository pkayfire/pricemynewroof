/**
 * Brand mark: a white house with a round window on a chalk-blue square (docs/SPEC.md Components).
 * Plain SVG so it also renders in next/og images (favicon, home-screen icon, social preview).
 */
export function BrandMark({ size = 30, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <rect width="512" height="512" fill="#2F6FD0" />
      <path
        d="M256 90 L410 219 V422 H102 V219 Z"
        fill="#FFFFFF"
        stroke="#FFFFFF"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <circle cx="256" cy="232" r="36" fill="#2F6FD0" />
    </svg>
  );
}
