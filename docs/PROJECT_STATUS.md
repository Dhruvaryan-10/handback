# Project status

Updated Thu 12 Nov 2026, evening IST. Local build only, as requested.

## What works

| Area | Status | Evidence |
| --- | --- | --- |
| PayPal sandbox hold lifecycle | Verified live | `npm run spike:paypal` ended "All sandbox lifecycle steps passed" (create, authorize, partial capture, idempotent retry, refund, void) |
| Gemini vision | Verified live | `npm run check:gemini`: primary `gemini-3.5-flash` passed the probe and real-image test; fallback `gemini-3.5-flash-lite` returned a temporary 503 (high demand) once |
| Money rules, state machine, image validation | Verified | 31 automated tests |
| New frontend: landing, app shell, 6 sections, rental workflow | Verified rendered | Screenshots of every page at 1440 / 1024 / 768 / 390 px, light and dark: no sideways scroll, no JS errors |
| Full journey in the browser against live PayPal + Gemini | **Not yet verified** | Needs one run on the laptop with real keys and photos (see LOCAL_TESTING.md) |

## Changed in the frontend upgrade

- **New:** landing page (`/`), app at `/app` with Overview, Rentals, Inspections, Payments, Activity, Settings; redesigned rental detail with stepper, multi-angle capture, side-by-side and slider comparison, findings linked to boxes, confidence and severity, manual-review rows, settlement bar, PayPal receipt.
- **Design system** in `client/src/styles.css` (tokens for colour, type, spacing, radius, shadow, motion; light and dark; theme saved in the browser).
- **Backend:** one read-only endpoint `GET /api/events` for the Activity page. PayPal, Gemini and settlement code unchanged.
- **Safety in the UI:** one action at a time (double clicks ignored), refund amount validated before calling the server, low-confidence findings excluded from the charge until the owner includes them.

## Known limitations

- In-memory storage by default: restarting the server clears rentals (Postgres optional).
- Dashboard numbers are derived from rental state in this server; they are not read back from PayPal.
- The landing page's inspection showcase is an illustration with sample values, labelled as such.
- Fonts load from Google Fonts; offline, the system font is used.
- No login: the shop approval token (`SHOP_ADMIN_TOKEN`, default `dev-shop-token`) guards settlements and refunds.

## Scores (self-assessed, honest)

- Local functionality: 8/10 until the live browser journey is run once; 9/10 after.
- Visual quality: 8.5/10.
- Overall completion for the hackathon: about 85%. Remaining: one live end-to-end run, demo video, GitHub push, Devpost.
