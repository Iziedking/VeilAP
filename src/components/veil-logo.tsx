type VeilLogoProps = {
  className?: string;
};

export function VeilLogo({ className = "" }: VeilLogoProps) {
  return (
    <span className={`veil-logo-lockup ${className}`.trim()}>
      <svg className="veil-logo-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" fill="#191915" />
        <path d="M11 13h12l9 33 9-33h12L39 53H25L11 13Z" fill="#f3eddf" />
        <path d="M11 13h12l9 33-7 7L11 13Z" fill="#ee5736" />
        <path d="M32 10v43" stroke="#191915" strokeWidth="2.5" />
      </svg>
      <span className="veil-logo-wordmark">VEIL <span>ARENA</span></span>
    </span>
  );
}
