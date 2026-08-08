import { readFileSync } from 'node:fs';
const token = readFileSync(process.argv[2],'utf8').trim();
const q = async sql => {
  const r = await fetch('https://api.supabase.com/v1/projects/xnejbxdvqmzlaljkgwaf/database/query',
    {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql})});
  return r.ok ? JSON.parse(await r.text()) : {e: await r.text()};
};
console.log('topics:', JSON.stringify(await q(`select slug, kind, weight, mention_count, distinct_players from rte_feedback_topics`)));
console.log('feedback:', JSON.stringify(await q(`select left(id::text,8) id, topic_id is not null linked, kind, email, player_id from rte_feedback`)));
