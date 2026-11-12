/** `npm run demo`: the app with only the demo workspace (simulated PayPal + AI). No keys needed. */
import { createApp } from './app.js';
import { createDemoWorkspace } from './demo/workspace.js';

const PORT = Number(process.env.PORT) || 8787;
const app = createApp(await createDemoWorkspace());
app.listen(PORT, () => {
  console.log(`Handback DEMO on http://localhost:${PORT} (API) · open http://localhost:5173/app`);
  console.log('  Simulated PayPal and simulated AI. 11 sample rentals, one per stage.');
  console.log('  For real PayPal sandbox + Gemini, use: npm run dev (it also has a "Try demo" switch).');
});
