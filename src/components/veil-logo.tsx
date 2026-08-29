type VeilLogoProps = {
  className?: string;
};

export function VeilLogo({ className = "" }: VeilLogoProps) {
  return (
    <span className={`veil-logo-lockup ${className}`.trim()}>
      <svg className="veil-logo-mark" viewBox="0 0 40 30" aria-hidden="true">
        <path
          className="veil-logo-mark-main"
          d="M3 4h6v10H3zM7 10h6v10H7zM15 12h6v10h-6zM19 8h6v10h-6zM23 4h14v6H23zM31 8h6v18h-6zM19 12h18v6H19z"
        />
        <path className="veil-logo-mark-accent" d="M11 16h6v10h-6z" />
      </svg>
      <span className="veil-logo-wordmark">VEIL<span className="veil-logo-colon">:</span>ARENA</span>
    </span>
  );
}
