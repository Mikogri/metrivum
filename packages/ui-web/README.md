# Portable UI React

Accessible React 19 components. No API, router, account model, application translations or brand assets are required.

```tsx
import { UIProvider, Button } from "@portable-ui/react";
import "@portable-ui/react/styles.css";
// Optional: import "@portable-ui/react/fonts.css";

<UIProvider mobileMaxWidth={767} messages={{ openCalendar: "Choose date" }}>
  <Button>Continue</Button>
</UIProvider>;
```

## Themes and copy

The default theme is neutral dark with system fonts. Set `data-ui-theme="light"` or `data-ui-theme="dark"` on `html` to switch the entire page, including portals. Override semantic `--ui-*` variables after importing styles to supply your brand. Layout, spacing, typography scales and motion are in `tokens.css`; palette overrides are in `light.css`. `styles.css` includes both themes, reset, utilities and component CSS. It never loads fonts. `fonts.css` is an optional Geist/Geist Mono import.

`UIProvider.messages` overrides library-owned English labels. Component label props take precedence. Use React Aria's `I18nProvider` for date/number locale and direction. The library does not select an application language. Explicit children and action labels remain the caller's responsibility. Nested UI providers configure their own copy and breakpoint.

`mobileMaxWidth` is an inclusive pixel breakpoint, default 767. It controls responsive menus, dialogs, selects and popovers, including portalled content. Set it identically on server and client. The first hydration render uses desktop semantics; layout is updated after hydration. Application-owned responsive layouts remain configured by the application.

## Build and distribution

Copy this directory to another repository, then run `npm install`, `npm run build` and `npm pack`. It has its own build TypeScript configuration and Vite library build. React and runtime dependencies remain external. The tarball exports compiled ESM, declarations and CSS; stories and tests are excluded. Import `styles.css` once in the consumer.

Install a generated tarball with `npm install ./portable-ui-react-0.1.0.tgz`. For a private registry, configure its scope and authenticate using your package manager, then run `npm publish --registry <registry-url>`. The default publish access is restricted. No credentials or registry ownership are assumed. No publication is performed by the build.

Consumers use `dist` in development and production. The app scripts build it before starting or building; run `npm run build:ui` after editing library source, or use `vite build --watch` in its directory. `npm run typecheck` and `npm run build` work without parent repository configuration.

## Metrivum migration

The package was renamed from `@metrivum/ui-web`; tokens moved from `--tf-*` to `--ui-*`. Update consumer imports and CSS overrides together. Metrivum imports its own `apps/web/app/fonts.css` and `metrivum-theme.css` after the base styles and provides Polish copy through its locale bridge. React Bits effects stay in the application. No LightRays component or placeholder is exported by this library.
