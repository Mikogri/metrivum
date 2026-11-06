export type AuthCardWidth = "wide" | "plans";

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

/**
 * The same placeholder for sign-in, registration and onboarding: the top bar and the card exactly where the page
 * draws them, so nothing moves when the page arrives.
 */
export function AuthBootSkeleton({ label, width }: { label: string; width?: AuthCardWidth }) {
  return (
    <div className="tf-boot-auth" aria-busy="true" role="status">
      <span className="tf-visually-hidden">{label}</span>
      <div className="tf-boot-auth__top" aria-hidden="true">
        <i className="tf-boot__bar" style={{ width: "7.5rem", height: "1.375rem" }} />
        <i className="tf-boot__bar" style={{ width: "5.5rem", height: "1.75rem", borderRadius: "999px" }} />
      </div>
      <div className="tf-boot-auth__main" aria-hidden="true">
        <div className="tf-boot-auth__card" data-width={width}>
          <i className="tf-boot__bar" style={{ width: "45%", height: "1.5rem" }} />
          <i className="tf-boot__bar" style={{ width: "80%" }} />
          <i className="tf-boot__field" />
          <i className="tf-boot__field" />
          <i className="tf-boot__field" />
          <i className="tf-boot__bar" style={{ width: "55%", alignSelf: "center" }} />
        </div>
      </div>
      <div className="tf-boot-auth__tag" aria-hidden="true">
        <i className="tf-boot__bar" style={{ width: "14rem" }} />
      </div>
    </div>
  );
}

/** Pages drawn in the sign-in layout, and the card width each one uses. */
export function authCardFor(pathname: string): { auth: boolean; width?: AuthCardWidth } {
  if (pathname === "/onboarding" || pathname === "/app/integrations/consent") return { auth: true, width: "wide" };
  if (pathname === "/onboarding/plan") return { auth: true, width: "plans" };
  return { auth: pathname.startsWith("/auth/") };
}

/** Run before the page paints (as an inline script): marks sign-in pages so the start-up placeholder takes their shape. */
export const BOOT_SHAPE_SCRIPT =
  "(function(p){var w=p==='/onboarding'||p==='/app/integrations/consent'?'wide':p==='/onboarding/plan'?'plans':p.indexOf('/auth/')===0?'':null;" +
  "if(w!==null){var d=document.documentElement;d.setAttribute('data-boot','auth');if(w)d.setAttribute('data-boot-width',w)}})(location.pathname)";
