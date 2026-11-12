# Frontend design

**Direction:** calm fintech. Warm off-white canvas, charcoal ink, one emerald accent, flat surfaces with hairline borders and soft shadows. No gradients beyond two subtle washes, no glassmorphism except the sticky bars.

## Tokens (`client/src/styles.css`, `:root`)

| Group | Tokens |
| --- | --- |
| Colour | `--bg --surface --surface-2 --ink --muted --faint --line --accent` + status pairs `--good/-soft --warn --bad --info`; inspection marks `--mark-existing --mark-new --mark-review` |
| Type | Inter (UI), JetBrains Mono (IDs, API names); scale 12/13/15/17/20/26/36, display `clamp(40px, 5.6vw, 68px)` |
| Space | 4 px grid `--s1`…`--s24` |
| Radius | 6 / 10 / 14 / 20 / pill |
| Shadow | `--shadow-xs` … `--shadow-lg`, focus `--ring` |
| Motion | 120 / 200 / 360 ms, one easing; disabled under `prefers-reduced-motion` |
| Breakpoints | 1100 (laptop), 900 (tablet: sidebar → drawer), 640 (mobile: tables → stacked cards) |

Dark mode redefines the colour tokens under `prefers-color-scheme: dark` and `[data-theme='dark']`. The theme choice (light / dark / system) is saved in `localStorage`.

## Inspection colour language

- Grey dashed box, `E1`: existing mark from the signed baseline.
- Red solid box, `N1`: potential new damage, priced.
- Amber dashed box: low confidence, sent to manual review, not charged by default.

Hovering a finding dims the photo and highlights its box.

## Structure

```
client/src/
  main.tsx              routes: / landing, /app/* app, /r/:id (PayPal return) → rental
  pages/Landing.tsx     marketing page
  pages/AppShell.tsx    sidebar, mobile drawer, setup alerts
  pages/pages.tsx       Overview, Rentals, Inspections, Payments, Activity, Settings
  pages/RentalDetail.tsx the workflow
  components/           Inspection (BoxedPhoto, ComparePanel), ui, icons, ThemeToggle
  lib/derive.ts         every number and label, computed from backend data (tested)
  lib/data.tsx          shared fetch + refresh
```

## Accessibility

Skip links, landmarks, `aria-current` in navigation, visible focus rings, labelled inputs and icon buttons, native `<dialog>` for New rental (Escape closes), keyboard-focusable findings, status not shown by colour alone (every badge has text), 40 px minimum touch targets.
