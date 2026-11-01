# @metrivum/ui-web

Metrivum's web component library: design tokens, base styles and accessible React components built on
React Aria Components. Used by both the public site and the app. Not published to npm.

```tsx
import "@metrivum/ui-web/styles.css"; // once, at the app root: fonts, tokens, reset, utilities
import { Button, Dialog, TextField, toast, Toaster } from "@metrivum/ui-web";
```

- React and React DOM are peer dependencies.
- Named exports with `sideEffects: ["**/*.css"]`, so unused components are tree-shaken.
- Styling uses CSS Modules and the semantic variables in `src/tokens/tokens.css` (`--tf-color-*`,
  `--tf-space-*`, `--tf-radius-*`, `--tf-ease-*`, …). Don't hard-code colours or spacing in components.
- The library is deliberately unaware of the API, Supabase, users and feature access. Pass `isDisabled`,
  `loading` or `errorMessage`; the app decides why.
- Domain components (set grid, exercise picker, charts) belong in the app's modules, not here.

## Components

| Group | Components |
| --- | --- |
| Actions | `Button`, `LinkButton`, `IconButton` (required `label`, shown as tooltip), `Link` |
| Typography | `Text`, `Heading`, `Label`, `Caption` |
| Fields | `TextField`, `TextArea`, `NumberInput` (locale-aware), `DateField`, `SearchInput`, `Select`, `Combobox`, `Option`, `Checkbox`, `RadioGroup`/`Radio`, `Switch`, `SegmentedControl`/`Segment`, `ChipGroup`/`Chip` (pill toggles; choosing the selected one again clears it) |
| Overlays | `Dialog`, `AlertDialog`, `DialogTrigger`, `Popover`, `Tooltip`/`TooltipTrigger`, `DropdownMenu*` |
| Structure | `Tabs`/`TabList`/`Tab`/`TabPanel`, `Breadcrumbs`, `Card`, `Separator`, `Disclosure` (row that expands smoothly), `PageHeader`, `SectionHeader`, `Toolbar`, `Pagination`, `List`/`ListRow` |
| Feedback | `Badge`, `Alert`, `Toaster` + `toast()`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState` |
| Display | `Avatar`, `Kbd`, `FileCard` |

Motion rules (press scale, origin-aware popovers, no animation on keyboard-frequent actions, reduced
motion) are described in [docs/frontend/design-reference.md](../../docs/frontend/design-reference.md).

Stories live next to the source in `src/stories` and run in `apps/ui-catalog` (`npm run storybook`).
Tests: `npm test` (Vitest + Testing Library).
