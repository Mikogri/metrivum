/** The Metrivum symbol (the M), drawn in the current text colour so it follows the theme. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="413 233 706 556" fill="currentColor" aria-hidden="true" focusable="false">
      <polygon points="415,235 765,497 950,365 946,505 755,650 535,478 533,787 415,695" />
      <polygon points="970,345 1117,235 1117,370 972,478" />
      <polygon points="778,682 1117,418 1117,580 868,772" />
    </svg>
  );
}
