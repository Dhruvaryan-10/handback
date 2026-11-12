/**
 * Phase 3 proof: runs the whole hold lifecycle against the PayPal SANDBOX.
 *   npm run spike:paypal
 * 1. Creates a $300 AUTHORIZE order and prints the approval link.
 * 2. You open it and approve with your US sandbox PERSONAL account, then press Enter.
 * 3. Authorizes, partially captures $45 with final_capture (rest released), refunds $10.
 * 4. Creates a second hold and voids it.
 */
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PayPalClient, approveLink, firstAuthorization } from '../server/src/paypal/client.js';

const pp = new PayPalClient();
const rl = createInterface({ input: stdin, output: stdout });
const stamp = Date.now().toString(36);

async function approvedHold(label: string) {
  const order = await pp.createAuthorizeOrder({
    rentalId: `spike-${label}-${stamp}`,
    itemName: 'Spike test camera',
    depositCents: 30000,
    returnUrl: 'https://example.com/return',
    cancelUrl: 'https://example.com/cancel',
  });
  console.log(`\n[${label}] Order ${order.id} (${order.status})`);
  console.log(`Approve here with your sandbox personal account:\n  ${approveLink(order)}`);
  await rl.question('Press Enter after approving... ');
  const authorized = await pp.authorizeOrder(order.id);
  const auth = firstAuthorization(authorized);
  if (!auth) throw new Error('No authorization returned');
  console.log(`[${label}] Authorization ${auth.id} ${auth.status}, expires ${auth.expiration_time ?? 'n/a'}`);
  return auth.id;
}

try {
  const authA = await approvedHold('capture');
  const capture = await pp.captureAuthorization(authA, 4500, `spike-capture-${stamp}`, 'Spike: $45 for new damage');
  console.log(`Captured ${capture.amount?.value} -> ${capture.id} ${capture.status}`);
  const again = await pp.captureAuthorization(authA, 4500, `spike-capture-${stamp}`);
  console.log(`Idempotent retry returned the same capture: ${again.id === capture.id}`);
  console.log(`Authorization after final capture: ${(await pp.getAuthorization(authA)).status}`);
  const refund = await pp.refundCapture(capture.id, 1000, `spike-refund-${stamp}`, 'Spike: appeal upheld');
  console.log(`Refunded $10.00 -> ${refund.id} ${refund.status}`);

  const authB = await approvedHold('void');
  await pp.voidAuthorization(authB, `spike-void-${stamp}`);
  console.log(`Voided -> ${(await pp.getAuthorization(authB)).status}`);
  console.log('\nAll sandbox lifecycle steps passed.');
} catch (e) {
  console.error('\nSpike failed:', e);
  process.exitCode = 1;
} finally {
  rl.close();
}
