# Metrivum Mobile — visual direction

Written before the UI pass of 2026-10-10. It records what was taken from the supplied inspiration
(three dark phone mock-ups: plans library, workout editor, exercise base) and what was deliberately
not copied. The mobile theme is independent of the web theme and lives in `packages/ui-mobile`.

## What the inspiration establishes

- **Material:** near-black canvas, one step of charcoal for surfaces, hairline separators instead of
  shadows. Depth comes from two surface levels, not from elevation.
- **Hierarchy:** a large light-weight screen title with a quiet subtitle, small section labels, then
  grouped rows. Related rows share one container; unrelated content is not boxed card by card.
- **Accent:** a single mint green used for "add", "done" and success. Primary emphasis is white on
  black (the filled pill of the active tab, the primary button), not a coloured fill.
- **Type:** a light geometric sans, wide tracking only on the wordmark and tiny labels, digits large
  and calm in data rows (sets, reps, load).
- **Icons:** thin outline glyphs, one weight everywhere.
- **Navigation:** a floating bottom bar; the active destination is a filled circle.

## Decisions

| Area | Decision |
|---|---|
| Typeface | Geist (SIL OFL 1.1), weights 400/500/600, loaded at runtime with `expo-font`. Covers EN and PL diacritics. Titles are semibold with tight tracking; text scales with the system setting; numeric rows use tabular figures. (Outfit was used first and replaced on 2026-10-10.) |
| Icons | Content icons use `expo-symbols`: SF Symbols on iOS, Material Symbols (light weight) on Android, mapped by one `Icon` component. Navigation icons (tab bar, More tiles, notifications) are the web app's Tabler outline icons, rasterised from the same paths as `apps/web/app/layouts/components/navIcons.tsx` into tintable PNG templates in `apps/mobile/assets/nav` and drawn by `NavIcon`. |
| Colour | Semantic tokens only (`background`, `surface`, `surfaceRaised`, `border`, `text`, `mutedText`, `subtleText`, `accent`/`onAccent`, `brand`, `success`, `warning`, `danger`). Dark is the reference theme; light is a real second theme, not an inversion. |
| Glass | Real Liquid Glass (`expo-glass-effect`) for chrome floating above content: the tab bar, the toolbar surface and the toast. Reduce Transparency or an OS without Liquid Glass falls back to a near-opaque surface with a hairline. Android never imitates glass on chrome. |
| Navigation | Expo Router native stack; tabs are JS tabs with a custom bar. The bar is an icon-only panel floating over the content with a margin from the screen edges; screens scroll behind it and end above it. The active destination is a filled circle that slides between icons. It hides while the keyboard is open. Stack pushes use one horizontal transition on both platforms; tab changes use a short shift. Every tab screen title carries notifications and the profile avatar at the trailing edge. Role-specific tabs are guarded routes, so changing the Coach/Client view swaps them in place without rebuilding the navigator. |
| Modals | Everything Metrivum presents slides up from the bottom: `BottomSheet`, `ActionSheet`, `ConfirmationSheet`, `SelectionSheet`, built on the native sheet of `@expo/ui` (SwiftUI sheet / Material 3 `ModalBottomSheet`). No context menus, popovers, centred dialogs or side drawers. Sheets are translucent over a blurred backdrop: iOS 26 keeps the system Liquid Glass sheet (no background is set), earlier iOS uses a blurred material, Android 12+ blurs the app behind the sheet with a render effect (`SheetBackdrop`) under a translucent sheet colour. Reduce Transparency and Android 11 or lower get an opaque sheet. System permission prompts, pickers and text-selection menus are left alone. |
| Motion | Central tokens (durations, easings, springs). Press feedback, selection changes, expanding sections, set check-off, new chat messages, toasts. Lists do not replay an entrance on refetch. Reduce Motion removes movement but keeps the state change and the confirmation. |
| Haptics | Only on meaningful confirmations: completing a set, saving, destructive confirm, selection in a sheet. Never per keystroke. |

## Not copied

- The mock-ups are a plan editor; the app is a coach/client companion. Screens keep their own
  content and API data — no placeholder data was added to make a screen look fuller.
- Controls are compact (buttons 32/40/46 high, 44 rows) and reach the minimum touch target with
  hit slop; switches, segmented controls and in-screen tabs are the app's own drawn controls.
- Web tables are not ported: workout execution uses large one-hand rows and steppers.
