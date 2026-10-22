# Hosting the web build

`npm run build` produces static files in `apps/web/build/client`. There is no runtime server; the ASP.NET API
is a separate origin.

## Routing rules

The rules are implemented in `apps/web/scripts/hosting-rules.mjs` and used by `npm run preview` and the
Playwright tests. Any host must behave the same way:

| Request | Response |
| --- | --- |
| Existing file (`/assets/*`, `/favicon.png`, `/robots.txt`, `/sitemap.xml`, `/og-image.png`) | The file. `/assets/*` with `Cache-Control: public, max-age=31536000, immutable` |
| Pre-rendered page (`/`, `/features`, `/features/program-builder`, `/features/video-analysis`, `/pl/…`) | Its own `…/index.html` with status 200 |
| `/app`, `/app/*`, `/auth/*`, `/onboarding` | `__spa-fallback.html` with status 200 and `X-Robots-Tag: noindex` |
| `/api/*`, missing `/assets/*`, missing `/brand/*` | 404, never HTML |
| `/anatomy/bodyparts3d-4.0/*` | Prepared anatomical assets; `.glb` uses `model/gltf-binary`. Hash-named GLBs are immutable; revalidate the manifest. Missing assets return 404, never the SPA fallback. See [asset preparation](../features/anatomy.md). |
| Anything else | `404/index.html` with **status 404** |

Do not use an “always serve index.html with 200” rule: `index.html` is the pre-rendered English landing, it
would hide real 404s and would try to hydrate the landing on app URLs.

### nginx example

```nginx
root /srv/trainflow/web;

location /assets/ { try_files $uri =404; add_header Cache-Control "public, max-age=31536000, immutable"; }
location /api/    { return 404; }  # or proxy to the API if it shares this host

location ~ ^/(app|auth|onboarding)(/|$) {
  add_header X-Robots-Tag "noindex" always;
  try_files $uri /__spa-fallback.html;
}

location / {
  try_files $uri $uri/index.html =404;
  error_page 404 /404/index.html;
}
```

## Headers

Recommended for HTML responses: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or `frame-ancestors 'none'`). A Content Security
Policy must allow:

- `connect-src`: the API origin, the Supabase project origin (Auth) and the Storage origin used by signed
  upload URLs;
- `media-src`: the Storage origin (signed read URLs);
- `script-src 'self'` plus the inline hydration scripts React Router writes (use hashes or `'unsafe-inline'`)
  and the one-line motion flag in `root.tsx`;
- `font-src 'self'`, `img-src 'self' data:`, `style-src 'self' 'unsafe-inline'`.

No service worker, analytics or monitoring is included.

## Environment variables (build time, public)

| Variable | Example | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `https://api.trainflow.example` | ASP.NET API base URL |
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` | Auth only |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Publishable (anon) key only |
| `VITE_SITE_URL` | `https://trainflow.example` | Canonical URLs, hreflang, sitemap |

Never put `service_role`/secret keys or database connection strings in `VITE_*` variables: they end up in
the browser bundle.

## Supabase Auth configuration

Per environment (local, staging, production), with no wildcard in production:

- **Site URL**: the site origin.
- **Redirect URLs**: exactly `<origin>/auth/callback` (query parameters `slot`, `nonce`, `next` are appended by the
  app). Local example: `http://localhost:5173/auth/callback`.
- **PKCE** is used by the web client (`flowType: "pkce"`); links return `?code=…` to the callback.
- **Email templates**: either include `{{ .Token }}` for code entry on `/auth/verify`, or keep
  `{{ .ConfirmationURL }}` for links. For token-hash links use
  `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=<signup|recovery|email>`.
- Email confirmation on; Data API off (the frontend never calls it).

Callback links require the latest sign-in, signup or recovery request in the same browser, expire after one hour and are consumed before Auth exchange. A new tab is supported. A different device/browser, cleared browser storage, a resend or a link created before this protection requires requesting a new link. Code entry on `/auth/verify` remains available. Preserve the complete `.RedirectTo`, including its nonce, in custom email templates; never construct callback URLs manually.

The API must list the site origin in `Cors:Origins` and already exposes `ETag`, `Location`, `Retry-After`.
