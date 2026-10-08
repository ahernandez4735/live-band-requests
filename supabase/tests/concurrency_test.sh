#!/usr/bin/env bash
# 40 guests vote on the same song at the same moment; the score must be exactly 40.
set -euo pipefail
: "${DB:?}"
q() { psql -qtA -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }

q "insert into auth.users values ('00000000-0000-0000-0000-0000000000a1');
   insert into bands (id, owner_id, name, slug) values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Load', 'load-test');
   insert into songs (id, band_id, title) values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Shout');
   insert into gigs (id, band_id, name, status) values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Load', 'live');
   insert into guest_sessions (id, gig_id, joined_via)
     select ('40000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, '30000000-0000-0000-0000-0000000000a1', 'code'
     from generate_series(1, 41) i;" >/dev/null

ITEM=$(q "select guest_request('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000141',
          '20000000-0000-0000-0000-0000000000a1', null, null, 'Seed', null);")

pids=()
for i in $(seq -w 1 40); do
  q "select guest_vote('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000001$i', '$ITEM', 1);" >/dev/null &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done

SCORE=$(q "select score from queue_items where id = '$ITEM';")
if [ "$SCORE" != "41" ]; then echo "concurrency test FAILED: score $SCORE, expected 41"; exit 1; fi
echo "CONCURRENCY TEST PASSED (41 votes, score $SCORE)"
