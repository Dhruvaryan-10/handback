# Local development audit (before the frontend upgrade)

## Working

- PayPal sandbox lifecycle and Gemini vision, both verified live.
- Server: state machine, settlement under lock, idempotent PayPal calls, image validation, webhook verification.

## Weak before this pass

| Area | Problem | Fix |
| --- | --- | --- |
| Frontend | One plain list page and one long rental page; no landing page, no navigation | Landing page + app shell with six sections |
| Inspection UI | Small boxes, no link between list and boxes, no confidence or review state | ComparePanel: side-by-side or slider, linked findings, confidence bars, severity, manual review |
| Settlement | Free number inputs only; low-confidence rows silently excluded | Include/exclude per row, live capture/release totals, clear button labels |
| Duplicate actions | Buttons disabled only after React re-renders | Ref-based guard so a double click runs once |
| Errors | Raw text below the page | Dismissable alerts at the top, retake reasons listed per angle |
| Activity | Per-rental only | `GET /api/events` (read-only) for a global timeline |
| Theme | Dark only via OS | Light / dark / system, saved |
| Mobile | Tables overflowed | Tables become stacked cards under 640 px |
| Gemini default | `config.ts` defaulted to `gemini-3.8-flash`; the verified model is `gemini-3.5-flash` | Default restored to the verified model |

## Not changed on purpose

PayPal client, settlement logic, Gemini prompts and schema, pricing.
