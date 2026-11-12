import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  APP_URL: z.string().url().default('http://localhost:5173'),
  SHOP_ADMIN_TOKEN: z.string().default('dev-shop-token'),
  PAYPAL_CLIENT_ID: z.string().default(''),
  PAYPAL_CLIENT_SECRET: z.string().default(''),
  PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYPAL_WEBHOOK_ID: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash-lite'),
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  DATABASE_URL: z.string().default(''),
  NODE_ENV: z.string().default('development'),
});

export const env = Env.parse(process.env);

if (env.PAYPAL_ENV === 'live') {
  // Hackathon build: refuse to touch real money.
  throw new Error('PAYPAL_ENV=live is not allowed in this build. Use sandbox.');
}

export const paypalBase = 'https://api-m.sandbox.paypal.com';

export const features = {
  paypal: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
  ai: Boolean(env.GEMINI_API_KEY),
  db: Boolean(env.DATABASE_URL),
  webhooks: Boolean(env.PAYPAL_WEBHOOK_ID),
};
