// Cardessa mark: three fanned cards, center emerald, on the dark zinc theme.
// Glyph-tier shapes only (no fine detail) so it survives 16px favicons.
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="19"
        y="12"
        width="26"
        height="36"
        rx="5"
        fill="#3f3f46"
        stroke="#52525b"
        strokeWidth="2"
        transform="rotate(-16 32 54)"
      />
      <rect
        x="19"
        y="12"
        width="26"
        height="36"
        rx="5"
        fill="#3f3f46"
        stroke="#52525b"
        strokeWidth="2"
        transform="rotate(16 32 54)"
      />
      <rect x="19" y="12" width="26" height="36" rx="5" fill="#10b981" />
      <rect
        x="24.5"
        y="17.5"
        width="15"
        height="25"
        rx="3"
        stroke="#065f46"
        strokeWidth="2"
        opacity="0.55"
      />
    </svg>
  );
}
