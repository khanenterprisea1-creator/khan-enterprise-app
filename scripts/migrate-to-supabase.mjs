#!/usr/bin/env node
/**
 * Migrate a Khan Enterprise JSON backup into Supabase (table `ledger_state`,
 * row id 'main') so every device sees the same ledger afterwards.
 *
 * Prerequisites (do these first):
 *   1. Create a Supabase project and run supabase/001_ledger_state.sql
 *      in the Supabase Dashboard → SQL Editor.
 *   2. Create the owner account in Supabase Dashboard → Authentication → Users.
 *   3. Export the current data from the PC app: Backup → JSON export
 *      (file name looks like Khan_Enterprise_backup_YYYY-MM-DD.json).
 *
 * Usage:
 *   node scripts/migrate-to-supabase.mjs <backup.json>
 *
 * Credentials come from the environment (or the matching --flag):
 *   SUPABASE_URL        (or --url)        e.g. https://<project-ref>.supabase.co
 *   SUPABASE_ANON_KEY   (or --key)        the project's anon / public key
 *   SUPABASE_EMAIL      (or --email)      owner account email
 *   SUPABASE_PASSWORD   (or --password)   owner account password
 *
 * Example:
 *   SUPABASE_URL=https://abc.supabase.co SUPABASE_ANON_KEY=eyJ... \
 *   SUPABASE_EMAIL=owner@example.com SUPABASE_PASSWORD='...' \
 *   node scripts/migrate-to-supabase.mjs ./Khan_Enterprise_backup_2026-11-26.json
 *
 * Run from the repository root (it needs node_modules from `npm install`).
 */
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const USAGE = `
Usage:
  node scripts/migrate-to-supabase.mjs <backup.json>

Required (environment variables or flags):
  SUPABASE_URL        (or --url=https://<project-ref>.supabase.co)
  SUPABASE_ANON_KEY   (or --key=<anon-public-key>)
  SUPABASE_EMAIL      (or --email=<owner-email>)
  SUPABASE_PASSWORD   (or --password=<owner-password>)

Example:
  SUPABASE_URL=https://abc.supabase.co SUPABASE_ANON_KEY=eyJ... \\
  SUPABASE_EMAIL=owner@example.com SUPABASE_PASSWORD='...' \\
  node scripts/migrate-to-supabase.mjs ./Khan_Enterprise_backup_2026-11-26.json
`.trim();

function fail(message) {
  console.error(`\nError: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = { file: undefined, url: undefined, key: undefined, email: undefined, password: undefined };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) result.url = arg.slice('--url='.length);
    else if (arg.startsWith('--key=')) result.key = arg.slice('--key='.length);
    else if (arg.startsWith('--email=')) result.email = arg.slice('--email='.length);
    else if (arg.startsWith('--password=')) result.password = arg.slice('--password='.length);
    else if (arg.startsWith('--file=')) result.file = arg.slice('--file='.length);
    else if (arg.startsWith('--')) fail(`Unknown option: ${arg}\n${USAGE}`);
    else if (!result.file) result.file = arg;
    else fail(`Unexpected extra argument: ${arg}\n${USAGE}`);
  }
  return {
    file: result.file,
    url: result.url ?? process.env.SUPABASE_URL,
    key: result.key ?? process.env.SUPABASE_ANON_KEY,
    email: result.email ?? process.env.SUPABASE_EMAIL,
    password: result.password ?? process.env.SUPABASE_PASSWORD,
  };
}

const { file, url, key, email, password } = parseArgs(process.argv.slice(2));

if (!file || !url || !key || !email || !password) {
  const missing = [
    !file ? 'backup file path' : null,
    !url ? 'SUPABASE_URL' : null,
    !key ? 'SUPABASE_ANON_KEY' : null,
    !email ? 'SUPABASE_EMAIL' : null,
    !password ? 'SUPABASE_PASSWORD' : null,
  ]
    .filter(Boolean)
    .join(', ');
  fail(`Missing: ${missing}\n${USAGE}`);
}

let rawText;
try {
  rawText = await readFile(file, 'utf8');
} catch {
  fail(`Could not read backup file: ${file}`);
}

let backup;
try {
  backup = JSON.parse(rawText.trim().replace(/^\uFEFF/, ''));
} catch {
  fail(`Not a valid JSON file: ${file}`);
}

if (
  !backup ||
  !Array.isArray(backup.companies) ||
  !Array.isArray(backup.products) ||
  typeof backup.entries !== 'object' ||
  backup.entries === null
) {
  fail(
    'Not a Khan Enterprise JSON backup (expected companies/products/entries). ' +
      'Export it from the app: Backup → JSON export.'
  );
}

const supabase = createClient(url, key);

const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) {
  fail(
    `Sign-in failed for ${email}: ${authError.message} ` +
      '(check the owner account in Supabase Dashboard → Authentication → Users).'
  );
}

const { error: upsertError } = await supabase.from('ledger_state').upsert({
  id: 'main',
  data: backup,
  updated_at: new Date().toISOString(),
});
if (upsertError) {
  fail(
    `Upload failed: ${upsertError.message} ` +
      '(did you run supabase/001_ledger_state.sql in the SQL Editor?)'
  );
}

const { data: row, error: readError } = await supabase
  .from('ledger_state')
  .select('id, updated_at')
  .eq('id', 'main')
  .maybeSingle();
if (readError || !row) {
  fail(`Upload finished but the row could not be read back: ${readError?.message ?? 'no row found'}`);
}

const companyCount = backup.companies.length;
const productCount = backup.products.length;
const entryCount = Object.keys(backup.entries).length;

console.log(
  `\nDone! Migrated ${companyCount} companies, ${productCount} products, ` +
    `${entryCount} sales entries to ledger_state (id 'main').\n` +
    `Verified in Supabase, updated_at: ${row.updated_at}\n` +
    'All devices will now load this data after signing in with the owner account.\n'
);
