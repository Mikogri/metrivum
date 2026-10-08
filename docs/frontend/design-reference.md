# Design reference

The visual direction comes from eleven inspiration screenshots supplied with the brief. They arrived as
`1.png` … `11.png`, so they are referenced here by number and content. Tokens live in
`packages/ui-web/src/tokens/tokens.css`; components use only those semantic variables.

## What the inspirations show

| # | Screen | What TrainFlow takes from it |
| --- | --- | --- |
| 1 | Projects page with a notifications popover (General / Mentions / Inbox / Archive pills, file cards with size and download icon) | Pill tabs, **file cards** (name, size/meta, type glyph, action) used for CSV/PDF exports, revisions and videos; folder cards above the list in the library |
| 2 | Command palette (Jump / Favorites / Tools tabs, icon squares, keyboard hints) | ⌘K palette in the app shell, underline tabs, `Kbd`, icon-square list rows |
| 3 | Notification settings table with green switches, left settings nav with an accent line | Switch styling, settings layout, sidebar active indicator (2px accent line) |
| 4 | Advisor dashboard rendered in perspective, dot-grid “activity map” | Hero sheet in perspective; the **cycle map** (dot grid of training days) on the landing and auth screens |
| 5 | NotifyHub landing: light beams from the top, gradient headline, tilted product shot, integration diagram with dashed connectors | Landing spotlight beams, gradient display headline, transfer diagram with flowing dashed wires and a glowing hub |
| 6 | Activity timeline grouped by month, note with a green left border | Revision list and exercise history timeline; callouts with a coloured left border |
| 7 | Portfolio dashboard with big numbers, white primary + dark secondary buttons | **White is the primary action**, dark bordered secondary buttons |
| 8 | Workspace dashboard: isometric 3D floor map, coloured stat icons, dense sidebar sections | Density and sidebar grouping of the app; status colours always paired with labels |
| 9 | Feedback modal with a 0–5 segmented rating, Cancel / white Send | Dialog layout, segmented control, footer button order |
| 10 | Notifications panel with count badges, green Approve | Count badges on tabs, accent (green) action buttons |
| 11 | Notification popover over a chart, white “Verify status” + dark “Dismiss” | Popover surface, Alert actions, toast styling |

All inspirations are dark, so dark mode is the decided theme (not an assumption). There is no light theme yet;
tokens are semantic so one can be added by redefining variables.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--tf-color-bg` | `#141414` | Page background |
| `--tf-color-sidebar` | `#0e0e0e` | Sidebar, darker than the page (spec: 250px, Source Code Pro labels, 34px items, 15px icons, 5px radius; collapses to a 54px rail of square items) |
| `--tf-color-surface` → `-overlay` | `#1b1b1b` → `#262626` | Cards, raised rows, popovers (each step one notch lighter) |
| `--tf-color-surface-hover` / `-selected` | white at 5% / `rgb(60 60 60 / 0.5)` | Hover and selected rows on any surface |
| `--tf-color-border` / `-strong` / `-subtle` | white at 10% / 17% / 7% | Hairlines carry most of the structure |
| `--tf-color-text` / `-secondary` / `-tertiary` | `#ededed` / `#a0a0a0` / `#8a8a8a` | Tertiary still passes 4.5:1 on the background |
| `--tf-color-primary` | `#235337` | Primary buttons: white text, translucent green border `rgb(62 224 154 / 0.24)` |
| `--tf-color-accent` | `#3ee09a` | Small details only: icon chips, progress, focus ring, status dots |
| `--tf-color-accent-deep` / `-text` | `#163a2b` / `#2ebc75` | Count badges |

Button text is white on every filled button; only a white button would carry dark text. Hover never turns a
regular control green. Colour comes from small details (tinted icon chips, dots, badges), not coloured
borders. Radii are small: 3–8px. The brand name is set in Orbitron ExtraBold.

Type weights stay between 400 and 500 (variable fonts, so 450 is used for menu items and buttons); heavier
weights are kept for special cases. Every text input has a placeholder (`m.common.ph`). Dialogs: title bar
with a hairline, body, and equal-width actions over a hairline (`footer` prop or `DialogFooter` inside a
form); confirmations show a toned warning tile beside the message. Empty states are a dashed box with a line icon,
a title, one sentence and the action that fills them. Side panels (`placement="right"`) sit flush against the
right edge and end with Cancel and the primary action.

Neutrals are pure greys (equal RGB channels) or translucent white; never blue- or warm-tinted greys.
Two places use hue on purpose: the chat (your own messages are the info blue mixed into the page) and colour
coding. The calendar marks meetings info-blue, events violet and check-ins amber; the exercise list groups
muscles into six body regions with one hue each. Coding never uses more than a handful of hues.
| `--tf-color-warning` / `-danger` / `-info` / `-violet` | `#f2a93b` / `#f0605d` / `#79a8ff` / `#a98bff` | Status; violet marks templates and top sets, info marks back-offs |

Status is never conveyed by colour alone: badges have a dot **and** text, errors have an icon **and** text.

## Typography

- **Saira** (variable) for display headlines. Its squared, rounded geometry echoes the TrainFlow wordmark in
  `trainflow.png` and reads athletic without being a cliché sports face.
- **Geist** (variable) for UI and body text; tabular numerals for all numbers (sets, loads, sizes).
- **Geist Mono** only for formula expressions.
- Scale: 11 / 12 / **13 (app default)** / 14 / 16 (marketing body) / 18 / 22 / 28, display sizes fluid with `clamp()`.
- Headlines use `text-wrap: balance`, paragraphs `pretty`; marketing line length ≤ 40rem.

## Spacing, density, radius, elevation

- 4px grid with half steps (2/6/10px) for dense rows. App rows are 32–38px; marketing sections breathe with
  96–128px vertical rhythm.
- Radius by hierarchy: controls 6–8px, cards 12px, overlays 16px, pills full.
- Elevation is a dark shadow plus a 1px inner highlight; borders do most of the separation.

## Icons

Lucide icons at 14–16px, stroke 2, decorative (`aria-hidden`) next to visible labels. Icon-only buttons
(`IconButton`) require a label that is also shown as a tooltip.

## Navigation layout

- Public: sticky header that turns solid with the first 80px of scroll (CSS scroll timeline), language switch
  EN/PL, mobile sheet menu.
- App (main reference: the supplied "Nexus" workspace dashboard): left sidebar with logo and collapse toggle,
  grouped sections with small labels, settings and the account card at the bottom; it collapses to an icon
  rail (remembered per browser). A sticky app bar over the content holds the search (opens the command
  palette) and the primary action. The active item changes in place (background + green icon), nothing
  slides between items. Under 56rem the sidebar becomes a drawer opened from the app bar.
- Editor: no sidebar, no footer; toolbar + structure / grid / details columns.

## Controls and motion

Motion follows Emil Kowalski's rules (see the `emil-design-eng` skill):

- Buttons scale to 0.97 on press (140ms, strong ease-out `cubic-bezier(.23,1,.32,1)`).
- Popovers, menus and tooltips scale from 0.96 **from their trigger** (`data-placement` → transform-origin);
  modals scale from the centre. Exits are faster than entries.
- Things used constantly don't animate: the ⌘K palette opens instantly; the active grid cell ring jumps
  without transition; keyboard navigation never waits for animation.
- Tab indicators may slide; navigation selection never does.
- Modals rise from the bottom (and sink back on close); their header, body and footer settle in sequence; the command palette
  animates only when opened from the app bar, never from ⌘K.
- Toasts use transitions (interruptible), pause while hovered or while the tab is hidden.
- Save status swaps its label with a 2px blur so the change reads as one transition.
- Only `transform`, `opacity`, `clip-path` and `filter` animate; hover effects are gated by
  `(hover: hover) and (pointer: fine)`.
- `prefers-reduced-motion` removes movement but keeps short fades.

The landing spends its boldness in one place — the hero sheet — and every other section animates what it
explains: days lighting up in a cycle, set shapes morphing, a formula typing and evaluating, files flowing
through import/export, a bar path drawing after an analysis completes. All drawn product visuals carry an
“Illustrative preview” label.

## Documented exceptions

- `#ffffff` for the switch thumb and `#000` behind video are literal: they are physical colours, not theme.
- Chart SVG strokes reference tokens through CSS classes; no colour lives in chart code.
