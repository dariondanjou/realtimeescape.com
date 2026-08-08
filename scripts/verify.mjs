/**
 * Post-migration smoke check. Reads only — makes no changes.
 *
 *   node scripts/verify.mjs <token-file>
 */
import { readFileSync } from 'node:fs';

const token = readFileSync(process.argv[2], 'utf8').trim();
const REF = process.env.SUPABASE_PROJECT_REF ?? 'xnejbxdvqmzlaljkgwaf';

const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return r.ok ? JSON.parse(await r.text()) : { error: await r.text() };
};

const show = (label, rows) => {
  console.log(`\n── ${label}`);
  if (rows.error) return console.log('   ERROR', rows.error.slice(0, 200));
  if (!rows.length) return console.log('   (none)');
  for (const row of rows) console.log('  ', JSON.stringify(row));
};

show('Schema', await q(`
  select
    (select count(*) from information_schema.tables where table_schema='public' and table_name like 'rte\\_%') as tables,
    (select count(*) from information_schema.views  where table_schema='public' and table_name like 'rte\\_%') as views,
    (select count(*) from pg_policies where tablename like 'rte\\_%')                                          as rls_policies
`));

show('Catalog', await q(`select slug, title, min_players, max_players, price_cents, status from rte_games`));

show('Bookings', await q(`
  select left(id::text,8) as id, seat_count, status, is_demo, price_cents, host_email
  from rte_bookings order by created_at desc limit 5
`));

show('Seats', await q(`
  select left(s.booking_id::text,8) as booking, s.seat_index, s.paid, s.amount_cents
  from rte_booking_seats s order by s.created_at desc limit 5
`));

show('Sessions', await q(`
  select left(id::text,8) as id, phase, left(random_seed,12) as seed from rte_game_sessions order by created_at desc limit 5
`));

show('Feedback captured', await q(`
  select left(id::text,8) as id, medium, context, topic_id is null as awaiting_collation, left(body,60) as excerpt
  from rte_feedback order by created_at desc limit 5
`));

show('Public ticker (demo excluded)', await q(`select * from rte_public_stats`));

show('Credit ledger', await q(`select count(*) as entries from rte_credit_ledger`));
