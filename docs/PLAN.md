# Build plan and status

Deadline: **Nov 12, 2026, 3:00 PM EST = Nov 13, 01:30 IST.** Submit target: Nov 12, 21:00 IST.

## Done (Nov 11, 01:30 IST)

- [x] Idea scorecard: Handback first for hackathon (79), résumé (86) and combined (81.8) — `docs/Idea_Scorecard.xlsx`
- [x] Project setup: TypeScript, Express API, React/Vite client, MIT licence, `.env.example`, `render.yaml`
- [x] PayPal client for the full hold lifecycle with idempotency, token refresh, webhook verification
- [x] `npm run spike:paypal` script to prove the lifecycle in the sandbox
- [x] Gemini vision module: baseline + diff prompts, JSON schema output, zod validation, fallback model
- [x] Domain: integer-cent money, price list, cap at hold, review threshold, state machine
- [x] Settlement: owner approval, per-rental lock, deterministic request ids, retry-safe, refunds, reauthorize job
- [x] Stores: in-memory and Postgres (advisory locks), schema
- [x] Client: shop console, PayPal button, camera capture per angle with compression, baseline and before/after boxes, approve, receipt, refund, activity log
- [x] 16 tests passing; typecheck clean; client builds

## Next (in order)

1. **You:** create US sandbox accounts + app, Gemini key → put them in `.env`.
2. `npm run spike:paypal` → paste the IDs it prints into `docs/sandbox-evidence.md`.
3. Real photos: shoot one object 4 angles, add a removable mark, test the AI diff; tune prompts.
4. Deploy to Render; set `APP_URL`; register the webhook; Neon database.
5. P1: Bryntum fleet scheduler, judge mode with sample photo sets, webhook log view.
6. README screenshots, demo video (script in the strategy doc), Devpost.
