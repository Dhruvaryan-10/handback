# Local testing

## Automated (no keys needed)

```
npm run typecheck
npm test          # 31 tests
npm run build
```

## Integrations (keys in .env)

```
npm run check:gemini -- before.jpg after.jpg
npm run spike:paypal
```

## Full journey in the browser (about 15 minutes)

1. `npm run dev`, open http://localhost:5173.
2. Landing page → **Launch Handback**.
3. **New rental** → pick the camera, enter a renter name → **Create rental**.
4. Click the PayPal button → log in with the **sandbox Personal** account → approve. The stepper moves to Pick-up and the deposit card says "Held, not charged".
5. Add a photo for each of the 4 angles → **Run pick-up inspection**. Existing marks appear as grey dashed boxes.
6. **Renter agrees: start rental**.
7. Add a removable mark to the object. Add 4 return photos → **Compare with pick-up**.
8. Check the comparison: new marks boxed in red (low-confidence ones in amber, excluded from the charge), old marks listed as pre-existing. Try the **Slider** view.
9. Adjust amounts if needed → **Approve**. Enter `dev-shop-token` (or your `SHOP_ADMIN_TOKEN`) when asked.
10. The receipt shows captured and released amounts with PayPal IDs. Optionally **Uphold appeal: refund** a part.
11. Check **Payments** (authorization, capture, release, refund rows) and **Activity**.

Also try: the theme toggle and Settings, the window narrowed to phone width, and double-clicking Approve (it captures once).

## Visual QA done

Every page was rendered with Playwright at 1440, 1024, 768 and 390 px, in light and dark, with rentals in every stage. An automated check found no horizontal overflow and no JavaScript errors.
