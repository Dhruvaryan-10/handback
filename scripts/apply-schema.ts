import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL first (Neon free Postgres works).');
  process.exit(1);
}
const sql = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url, ssl: url.includes('sslmode=') ? { rejectUnauthorized: false } : undefined });
await client.connect();
await client.query(sql);
await client.end();
console.log('Schema applied.');
