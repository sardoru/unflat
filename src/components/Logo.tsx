/** The mark: a flat panel with one side standing up out of it: a manual, unflattened. */
export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M3 21.5 16 28l13-6.5L16 15z" fill="var(--surface-2)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 15V4.5L29 11v10.5z" fill="var(--accent)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9.5" cy="21.6" r="1.3" fill="currentColor" />
      <circle cx="22.4" cy="15.2" r="1.1" fill="var(--accent-ink)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-ink">
      <Mark />
      <span className="text-[17px] font-semibold tracking-[-0.02em]">Unflat</span>
    </span>
  );
}
