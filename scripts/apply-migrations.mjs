/**
 * Applies supabase/migrations/*.sql to the linked Supabase project.
 *
 * Uses the Supabase Management API (POST /v1/projects/{ref}/database/query), which executes
 * arbitrary SQL including DDL. This is the same mechanism the aimakersgeneration project uses,
 * and it needs a Supabase **personal access token** rather than the database password — the
 * anon and service-role keys authenticate to PostgREST and cannot create tables.
 *
 * Generate a token at https://supabase.com/dashboard/account/tokens (it is revocable).
 *
 * Usage:
 *   node scripts/apply-migrations.mjs <token-file>
 *   node scripts/apply-migrations.mjs                  # reads SUPABASE_ACCESS_TOKEN
 *
 * Each file is applied in filename order and is individually guarded, so re-running is safe.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'xnejbxdvqmzlaljkgwaf';

const tokenArg = process.argv[2];
const token = (tokenArg ? readFileSync(tokenArg, 'utf8') : process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();

if (!token) {
  console.error(
    'No access token.\n\n' +
    '  node scripts/apply-migrations.mjs <token-file>\n' +
    '  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migrations.mjs\n\n' +
    'Generate one at https://supabase.com/dashboard/account/tokens',
  );
  process.exit(1);
}

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// Fail fast on a bad token rather than part-way through the migration set.
const probe = await runSql('select current_database() as db, current_user as usr');
if (!probe.ok) {
  console.error(`Could not reach the database (HTTP ${probe.status}).`);
  console.error(probe.body.slice(0, 300));
  if (probe.status === 401) console.error('\nThat token was rejected. It must be a personal access token (sbp_...).');
  process.exit(1);
}
console.log(`Connected: ${probe.body}\n`);

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) {
  console.error(`No .sql files in ${MIGRATIONS}`);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
  process.stdout.write(`${file.padEnd(44)} `);
  const r = await runSql(sql);
  if (r.ok) {
    console.log('applied');
  } else {
    failed++;
    console.log(`FAILED (HTTP ${r.status})`);
    console.log(`  ${r.body.slice(0, 400)}\n`);
  }
}

if (failed) {
  console.log(`\n${failed} of ${files.length} migrations failed.`);
  process.exit(1);
}

// Verify the schema actually landed rather than trusting the HTTP status.
const check = await runSql(`
  select
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_name like 'rte\\_%')            as rte_tables,
    (select count(*) from information_schema.views
      where table_schema = 'public' and table_name like 'rte\\_%')            as rte_views,
    (select count(*) from rte_games)                                          as games_seeded
`);
console.log(`\nAll ${files.length} migrations applied.`);
console.log(`Verification: ${check.body}`);
