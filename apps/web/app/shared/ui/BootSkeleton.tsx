/**
 * Start-up placeholder: the outline of the app (sidebar, app bar, a few content blocks) in low
 * contrast with a slow shimmer. Plain markup and CSS (app.css), so it also works before hydration.
 * It fades in after a short delay, so a fast start never flashes it.
 */
export function BootSkeleton({ label }: { label: string }) {
  return (
    <div className="tf-boot" aria-busy="true" role="status">
      <span className="tf-visually-hidden">{label}</span>
      <div className="tf-boot__side" aria-hidden="true">
        <i className="tf-boot__bar" style={{ width: "6.5rem", height: "0.875rem", marginBottom: "1.25rem" }} />
        {[78, 64, 70, 58, 66].map((w, i) => (
          <i key={i} className="tf-boot__bar" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="tf-boot__main" aria-hidden="true">
        <div className="tf-boot__top">
          <i className="tf-boot__bar" style={{ width: "9rem" }} />
        </div>
        <div className="tf-boot__content">
          <i className="tf-boot__bar" style={{ width: "14rem", height: "1.25rem" }} />
          <i className="tf-boot__bar" style={{ width: "22rem", maxWidth: "70%" }} />
          <div className="tf-boot__cards">
            <i className="tf-boot__card" />
            <i className="tf-boot__card" />
            <i className="tf-boot__card" />
          </div>
          <i className="tf-boot__card tf-boot__card--wide" />
        </div>
      </div>
    </div>
  );
}
