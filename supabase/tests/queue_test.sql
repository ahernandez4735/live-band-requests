-- Behaviour tests for the queue logic. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on

insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');

-- Band owner creates a band, songs, an artist and a gig through RLS.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into bands (id, owner_id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'The Night Shift', 'night-shift');
insert into songs (id, band_id, title, artist) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'September', 'Earth, Wind & Fire'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Suavemente', 'Elvis Crespo'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'La Bamba', 'Ritchie Valens');
insert into cover_artists (band_id, name) values ('10000000-0000-0000-0000-000000000001', 'ABBA');
insert into gigs (id, band_id, name) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Evelyn''s 60th');
insert into gig_private (gig_id, lat, lng, radius_m) values ('30000000-0000-0000-0000-000000000001', 37.77, -122.42, 300);
insert into gig_song_off values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003');

-- A direct status update is refused; going live uses the function.
do $$ begin
  update gigs set status = 'live' where id = '30000000-0000-0000-0000-000000000001';
  raise exception 'direct status update should fail';
exception when insufficient_privilege then null; end $$;
select band_set_gig_status('30000000-0000-0000-0000-000000000001', 'live');

-- Another user can't touch this band's data.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  if (select count(*) from songs) <> 0 then raise exception 'songs leaked to other user'; end if;
  if (select count(*) from gig_private) <> 0 then raise exception 'gig_private leaked'; end if;
  begin
    perform band_next('30000000-0000-0000-0000-000000000001');
    raise exception 'other user ran band_next';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;
end $$;
reset role;

-- Guests join and request (server side, service role).
insert into guest_sessions (id, gig_id, joined_via) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'location'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'code'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'location');

do $$
declare a uuid; b uuid; c uuid; d uuid;
begin
  a := guest_request('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', null, null, 'Marco', 'For Evelyn');
  -- Same song by another guest joins the same entry.
  b := guest_request('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000001', null, null, 'Dana', null);
  if a <> b then raise exception 'duplicate queue entry'; end if;
  if (select request_count from queue_items where id = a) <> 2 then raise exception 'request_count wrong'; end if;
  if (select score from queue_items where id = a) <> 2 then raise exception 'requests should count as likes'; end if;
  -- Same guest again does not double count.
  b := guest_request('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000001', null, null, 'Dana', 'Table 4!');
  if (select request_count from queue_items where id = a) <> 2 then raise exception 'repeat request double counted'; end if;
  if (select shoutout_status from requests where guest_id = '40000000-0000-0000-0000-000000000002') <> 'pending' then
    raise exception 'repeat shoutout not saved';
  end if;

  -- Free text that matches a listed song, accents and case aside.
  c := guest_request('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
        null, 'suavemente', '', 'Rosa', null);
  if (select song_id from queue_items where id = c) <> '20000000-0000-0000-0000-000000000002' then
    raise exception 'free text did not match listed song';
  end if;

  -- Off-list song by a covered artist waits for the band.
  d := guest_request('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
        null, 'Mamma Mia', 'abba', 'Rosa', null);
  if (select status from queue_items where id = d) <> 'pending_confirm' then raise exception 'off-list not pending'; end if;

  -- Off-list by an artist not covered is refused under the default policy.
  begin
    perform guest_request('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
        null, 'Espresso', 'Sabrina Carpenter', 'Marco', null);
    raise exception 'uncovered artist accepted';
  exception when others then if sqlerrm <> 'artist_not_covered' then raise; end if; end;

  -- A song switched off tonight is refused.
  begin
    perform guest_request('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000003', null, null, 'Marco', null);
    raise exception 'off-tonight song accepted';
  exception when others then if sqlerrm <> 'song_off_tonight' then raise; end if; end;

  -- Votes: switching from like to dislike moves the score by two.
  perform guest_vote('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', c, 1);
  perform guest_vote('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', c, -1);
  if (select score from queue_items where id = c) <> 1 then raise exception 'score after votes wrong: %', (select score from queue_items where id = c); end if;
  perform guest_vote('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', c, 0);
  if (select score from queue_items where id = c) <> 2 then raise exception 'clearing a vote failed'; end if;
end $$;

-- Band runs the night.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$
declare first uuid; r uuid; sept uuid; mamma uuid;
begin
  select id into sept from queue_items where title = 'September';
  select id into mamma from queue_items where title = 'Mamma Mia';
  -- Confirm the off-list song, pin it, and Next plays the pinned song first.
  perform band_set_item(mamma, 'confirm');
  perform band_set_item(mamma, 'pin');
  first := band_next('30000000-0000-0000-0000-000000000001');
  if first <> mamma then raise exception 'pinned song not played first'; end if;
  -- Playing it again is stale.
  begin
    perform band_play(mamma);
    raise exception 'stale play allowed';
  exception when others then if sqlerrm <> 'stale' then raise; end if; end;
  -- Next: highest score.
  first := band_next('30000000-0000-0000-0000-000000000001');
  if (select status from queue_items where id = mamma) <> 'played' then raise exception 'previous not marked played'; end if;
  if first not in (sept, (select id from queue_items where title = 'Suavemente')) then raise exception 'next picked wrong song'; end if;
  -- Approve a shoutout.
  select id into r from requests where guest_name = 'Marco';
  perform band_shoutout(r, true);
  if (select shoutout_count from queue_items where id = sept) <> 1 then raise exception 'shoutout count wrong'; end if;
  begin
    perform band_shoutout(r, true);
    raise exception 'double approve allowed';
  exception when others then if sqlerrm <> 'stale' then raise; end if; end;
end $$;
reset role;

-- Guests (anon) can read the queue of the live gig but not requests or private data.
set role anon;
do $$ begin
  if (select count(*) from queue_items) = 0 then raise exception 'anon cannot read live queue'; end if;
  -- Guest names and venue locations: either no grant at all or no visible rows.
  begin
    if (select count(*) from requests) <> 0 then raise exception 'anon can read requests'; end if;
  exception when insufficient_privilege then null; end;
  begin
    if (select count(*) from gig_private) <> 0 then raise exception 'anon can read gig_private'; end if;
  exception when insufficient_privilege then null; end;
  begin
    perform guest_vote('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
      (select id from queue_items limit 1), 1);
    raise exception 'anon called guest_vote directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Ending the gig hides its queue from guests.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select band_set_gig_status('30000000-0000-0000-0000-000000000001', 'ended');
reset role;
set role anon;
do $$ begin
  if (select count(*) from queue_items) <> 0 then raise exception 'ended gig still visible'; end if;
end $$;
reset role;

select 'ALL QUEUE TESTS PASSED' as result;
