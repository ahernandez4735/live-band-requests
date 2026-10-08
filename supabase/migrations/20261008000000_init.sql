-- Live band requests: core gig loop.
-- Bands own songs and gigs. Guests join a live gig (location or join code),
-- request songs with an optional shoutout, and vote. All guest writes go through
-- the server (service role) via the guest_* functions; band writes go through
-- RLS or the band_* functions, which lock the gig row so band actions never race.

create extension if not exists pgcrypto;

create type public.request_policy as enum ('listed', 'listed_artists', 'any');
create type public.gig_status as enum ('draft', 'live', 'ended');
create type public.item_status as enum ('pending_confirm', 'queued', 'playing', 'played', 'skipped', 'rejected');
create type public.shoutout_status as enum ('none', 'pending', 'approved', 'hidden');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.bands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  bio text check (char_length(bio) <= 1000),
  members text check (char_length(members) <= 300),
  booking_email text check (char_length(booking_email) <= 200),
  booking_phone text check (char_length(booking_phone) <= 40),
  website text check (char_length(website) <= 200),
  instagram text check (char_length(instagram) <= 100),
  request_policy public.request_policy not null default 'listed_artists',
  created_at timestamptz not null default now()
);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.bands (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  artist text not null default '' check (char_length(artist) <= 200),
  tags text[] not null default '{}',
  lyrics text,
  synced_lyrics text,
  lyrics_status text not null default 'unchecked' check (lyrics_status in ('unchecked', 'found', 'missing')),
  created_at timestamptz not null default now()
);
create unique index songs_band_title_artist on public.songs (band_id, lower(title), lower(artist));

create table public.cover_artists (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.bands (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200)
);
create unique index cover_artists_band_name on public.cover_artists (band_id, lower(name));

-- Public gig fields only. Location and join code live in gig_private.
create table public.gigs (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.bands (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  starts_at timestamptz,
  ends_at timestamptz,
  status public.gig_status not null default 'draft',
  requests_open boolean not null default true,
  shoutouts_enabled boolean not null default true,
  now_playing_item_id uuid,
  created_at timestamptz not null default now()
);
create unique index gigs_one_live_per_band on public.gigs (band_id) where status = 'live';

create table public.gig_private (
  gig_id uuid primary key references public.gigs (id) on delete cascade,
  address text check (char_length(address) <= 300),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  radius_m integer not null default 300 check (radius_m between 100 and 2000),
  join_code text not null default lpad((floor(random() * 10000))::int::text, 4, '0') check (join_code ~ '^[0-9]{4}$')
);

-- Songs the band switched off for one gig.
create table public.gig_song_off (
  gig_id uuid not null references public.gigs (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  primary key (gig_id, song_id)
);

create table public.queue_items (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs (id) on delete cascade,
  song_id uuid references public.songs (id) on delete set null,
  title text not null,
  artist text not null default '',
  off_list boolean not null default false,
  match_key text not null,
  status public.item_status not null,
  pinned boolean not null default false,
  score integer not null default 0,
  request_count integer not null default 0,
  shoutout_count integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
-- One active entry per song per gig; a repeat request joins it.
create unique index queue_items_active_song on public.queue_items (gig_id, match_key)
  where status in ('pending_confirm', 'queued');
create index queue_items_gig on public.queue_items (gig_id, status);

alter table public.gigs
  add constraint gigs_now_playing_fk foreign key (now_playing_item_id)
  references public.queue_items (id) on delete set null;

create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs (id) on delete cascade,
  joined_via text not null check (joined_via in ('location', 'code')),
  created_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs (id) on delete cascade,
  queue_item_id uuid not null references public.queue_items (id) on delete cascade,
  guest_id uuid not null references public.guest_sessions (id) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 1 and 40),
  shoutout text check (char_length(shoutout) <= 80),
  shoutout_status public.shoutout_status not null default 'none',
  created_at timestamptz not null default now(),
  unique (queue_item_id, guest_id)
);
create index requests_gig on public.requests (gig_id);

create table public.votes (
  queue_item_id uuid not null references public.queue_items (id) on delete cascade,
  guest_id uuid not null references public.guest_sessions (id) on delete cascade,
  gig_id uuid not null references public.gigs (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (queue_item_id, guest_id)
);

-- ---------------------------------------------------------------------------
-- Score bookkeeping. Scores move by deltas, so concurrent votes on the same
-- song serialize on the queue_items row lock and none are lost.
-- ---------------------------------------------------------------------------

create function public.apply_vote_delta() returns trigger
language plpgsql as $$
declare
  delta integer;
  item uuid;
begin
  if tg_op = 'INSERT' then
    delta := new.value; item := new.queue_item_id;
  elsif tg_op = 'UPDATE' then
    delta := new.value - old.value; item := new.queue_item_id;
  else
    delta := -old.value; item := old.queue_item_id;
  end if;
  if delta <> 0 then
    update public.queue_items set score = score + delta where id = item;
  end if;
  return null;
end $$;

create trigger votes_score after insert or update or delete on public.votes
  for each row execute function public.apply_vote_delta();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.normalize_text(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(translate(coalesce(t, ''),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', ' ', 'g'))
$$;

create function public.is_band_owner(p_band uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bands where id = p_band and owner_id = auth.uid())
$$;

create function public.is_gig_owner(p_gig uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.gigs g join public.bands b on b.id = g.band_id
    where g.id = p_gig and b.owner_id = auth.uid())
$$;

create function public.is_live_gig(p_gig uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gigs where id = p_gig and status = 'live')
$$;

-- ---------------------------------------------------------------------------
-- Guest actions (called by the server with the service role after it has
-- checked the guest's session cookie).
-- ---------------------------------------------------------------------------

create function public.guest_request(
  p_gig uuid, p_guest uuid, p_song uuid, p_title text, p_artist text,
  p_name text, p_shoutout text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  g record;
  b record;
  s record;
  v_title text;
  v_artist text;
  v_off boolean := false;
  v_key text;
  v_item uuid;
  v_request uuid;
  v_shout text := nullif(trim(coalesce(p_shoutout, '')), '');
  v_open integer;
begin
  select * into g from gigs where id = p_gig;
  if not found or g.status <> 'live' then raise exception 'gig_not_live'; end if;
  if not g.requests_open then raise exception 'requests_closed'; end if;
  if not exists (select 1 from guest_sessions where id = p_guest and gig_id = p_gig) then
    raise exception 'not_joined';
  end if;
  select * into b from bands where id = g.band_id;

  select count(*) into v_open from requests r join queue_items q on q.id = r.queue_item_id
  where r.guest_id = p_guest and q.status in ('pending_confirm', 'queued');
  if v_open >= 3 then raise exception 'too_many_requests'; end if;

  if p_song is null and nullif(trim(coalesce(p_title, '')), '') is not null then
    -- Free text that matches a listed song becomes that song.
    select * into s from songs
    where band_id = b.id and normalize_text(title) = normalize_text(p_title)
      and (nullif(trim(coalesce(p_artist, '')), '') is null
           or normalize_text(artist) = normalize_text(p_artist))
    order by created_at limit 1;
    if found then p_song := s.id; end if;
  end if;

  if p_song is not null then
    select * into s from songs where id = p_song and band_id = b.id;
    if not found then raise exception 'song_not_found'; end if;
    if exists (select 1 from gig_song_off where gig_id = p_gig and song_id = p_song) then
      raise exception 'song_off_tonight';
    end if;
    v_title := s.title; v_artist := s.artist; v_key := s.id::text;
  else
    v_title := trim(coalesce(p_title, ''));
    v_artist := trim(coalesce(p_artist, ''));
    if v_title = '' or char_length(v_title) > 200 or char_length(v_artist) > 200 then
      raise exception 'invalid_song';
    end if;
    if b.request_policy = 'listed' then raise exception 'listed_only'; end if;
    if b.request_policy = 'listed_artists' and not exists (
      select 1 from cover_artists where band_id = b.id and normalize_text(name) = normalize_text(v_artist)
    ) then
      raise exception 'artist_not_covered';
    end if;
    v_off := true;
    v_key := 'x:' || normalize_text(v_title) || '|' || normalize_text(v_artist);
  end if;

  insert into queue_items (gig_id, song_id, title, artist, off_list, match_key, status)
  values (p_gig, p_song, v_title, v_artist, v_off, v_key,
          case when v_off then 'pending_confirm'::item_status else 'queued'::item_status end)
  on conflict (gig_id, match_key) where status in ('pending_confirm', 'queued')
  do update set match_key = excluded.match_key
  returning id into v_item;

  insert into requests (gig_id, queue_item_id, guest_id, guest_name, shoutout, shoutout_status)
  values (p_gig, v_item, p_guest, left(trim(p_name), 40),
          case when g.shoutouts_enabled then left(v_shout, 80) end,
          case when g.shoutouts_enabled and v_shout is not null then 'pending'::shoutout_status else 'none'::shoutout_status end)
  on conflict (queue_item_id, guest_id) do nothing
  returning id into v_request;

  if v_request is not null then
    update queue_items set request_count = request_count + 1 where id = v_item;
  elsif v_shout is not null and g.shoutouts_enabled then
    -- Same guest asked again: keep their newest shoutout.
    update requests set shoutout = left(v_shout, 80), shoutout_status = 'pending'
    where queue_item_id = v_item and guest_id = p_guest and shoutout_status <> 'approved';
  end if;

  -- A request counts as a like from the requester.
  insert into votes (queue_item_id, guest_id, gig_id, value) values (v_item, p_guest, p_gig, 1)
  on conflict (queue_item_id, guest_id) do update set value = 1;

  return v_item;
end $$;

create function public.guest_vote(p_gig uuid, p_guest uuid, p_item uuid, p_value integer)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_value not in (-1, 0, 1) then raise exception 'invalid_vote'; end if;
  if not exists (select 1 from guest_sessions where id = p_guest and gig_id = p_gig) then
    raise exception 'not_joined';
  end if;
  if not exists (
    select 1 from queue_items q join gigs g on g.id = q.gig_id
    where q.id = p_item and q.gig_id = p_gig and g.status = 'live'
      and q.status in ('pending_confirm', 'queued')
  ) then
    raise exception 'item_not_votable';
  end if;
  if p_value = 0 then
    delete from votes where queue_item_id = p_item and guest_id = p_guest;
  else
    insert into votes (queue_item_id, guest_id, gig_id, value) values (p_item, p_guest, p_gig, p_value)
    on conflict (queue_item_id, guest_id) do update set value = excluded.value;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Band actions. Each one locks the gig row first, so two band members tapping
-- at once run one after the other, and each checks the item is still in the
-- state it expects ('stale' otherwise).
-- ---------------------------------------------------------------------------

create function public.lock_owned_gig(p_gig uuid) returns public.gigs
language plpgsql security definer set search_path = public as $$
declare g gigs;
begin
  select * into g from gigs where id = p_gig for update;
  if not found or not is_gig_owner(p_gig) then raise exception 'not_allowed'; end if;
  return g;
end $$;

create function public.item_gig(p_item uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select gig_id from public.queue_items where id = p_item
$$;

create function public.start_item(p_gig uuid, p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update queue_items set status = 'played', finished_at = now()
  where gig_id = p_gig and status = 'playing';
  if p_item is not null then
    update queue_items set status = 'playing', started_at = now(), pinned = false where id = p_item;
  end if;
  update gigs set now_playing_item_id = p_item where id = p_gig;
end $$;

create function public.band_play(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_gig uuid := item_gig(p_item);
begin
  perform lock_owned_gig(v_gig);
  if not exists (select 1 from queue_items where id = p_item and status = 'queued') then
    raise exception 'stale';
  end if;
  perform start_item(v_gig, p_item);
end $$;

create function public.band_next(p_gig uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_next uuid;
begin
  perform lock_owned_gig(p_gig);
  select id into v_next from queue_items
  where gig_id = p_gig and status = 'queued'
  order by pinned desc, score desc, created_at asc limit 1;
  perform start_item(p_gig, v_next);
  return v_next;
end $$;

create function public.band_set_item(p_item uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare v_gig uuid := item_gig(p_item);
begin
  perform lock_owned_gig(v_gig);
  if p_action = 'skip' then
    update queue_items set status = 'skipped', finished_at = now(), pinned = false
    where id = p_item and status in ('queued', 'pending_confirm');
  elsif p_action = 'confirm' then
    update queue_items set status = 'queued' where id = p_item and status = 'pending_confirm';
  elsif p_action = 'reject' then
    update queue_items set status = 'rejected', finished_at = now()
    where id = p_item and status = 'pending_confirm';
  elsif p_action = 'pin' then
    update queue_items set pinned = false where gig_id = v_gig and pinned;
    update queue_items set pinned = true where id = p_item and status = 'queued';
  elsif p_action = 'unpin' then
    update queue_items set pinned = false where id = p_item;
  else
    raise exception 'invalid_action';
  end if;
  if not found then raise exception 'stale'; end if;
end $$;

create function public.band_shoutout(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  select * into r from requests where id = p_request;
  if not found then raise exception 'not_found'; end if;
  perform lock_owned_gig(r.gig_id);
  update requests set shoutout_status = case when p_approve then 'approved'::shoutout_status else 'hidden'::shoutout_status end
  where id = p_request and shoutout_status = 'pending';
  if not found then raise exception 'stale'; end if;
  if p_approve then
    update queue_items set shoutout_count = shoutout_count + 1 where id = r.queue_item_id;
  end if;
end $$;

create function public.band_set_gig_status(p_gig uuid, p_status public.gig_status) returns void
language plpgsql security definer set search_path = public as $$
declare g gigs;
begin
  g := lock_owned_gig(p_gig);
  if p_status = 'live' then
    update gigs set status = 'ended'
    where band_id = g.band_id and status = 'live' and id <> p_gig;
  elsif p_status = 'ended' then
    perform start_item(p_gig, null);
  end if;
  update gigs set status = p_status where id = p_gig;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.bands enable row level security;
alter table public.songs enable row level security;
alter table public.cover_artists enable row level security;
alter table public.gigs enable row level security;
alter table public.gig_private enable row level security;
alter table public.gig_song_off enable row level security;
alter table public.queue_items enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.requests enable row level security;
alter table public.votes enable row level security;

-- Band profiles are public (guests see them, and they're how people book).
create policy bands_public_read on public.bands for select using (true);
create policy bands_owner_insert on public.bands for insert to authenticated with check (owner_id = auth.uid());
create policy bands_owner_update on public.bands for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy songs_owner on public.songs for all to authenticated
  using (is_band_owner(band_id)) with check (is_band_owner(band_id));
create policy cover_artists_owner on public.cover_artists for all to authenticated
  using (is_band_owner(band_id)) with check (is_band_owner(band_id));

create policy gigs_live_read on public.gigs for select using (status = 'live');
create policy gigs_owner_read on public.gigs for select to authenticated using (is_band_owner(band_id));
create policy gigs_owner_insert on public.gigs for insert to authenticated
  with check (is_band_owner(band_id) and status = 'draft');
create policy gigs_owner_update on public.gigs for update to authenticated
  using (is_band_owner(band_id)) with check (is_band_owner(band_id));
create policy gigs_owner_delete on public.gigs for delete to authenticated
  using (is_band_owner(band_id) and status <> 'live');

create policy gig_private_owner on public.gig_private for all to authenticated
  using (is_gig_owner(gig_id)) with check (is_gig_owner(gig_id));
create policy gig_song_off_owner on public.gig_song_off for all to authenticated
  using (is_gig_owner(gig_id)) with check (is_gig_owner(gig_id));

-- Guests read the queue of a live gig over realtime. No guest names in this table.
create policy queue_live_read on public.queue_items for select using (is_live_gig(gig_id));
create policy queue_owner_read on public.queue_items for select to authenticated using (is_gig_owner(gig_id));

create policy requests_owner_read on public.requests for select to authenticated using (is_gig_owner(gig_id));
-- guest_sessions and votes: no client access; the server uses the service role.

-- Explicit grants, so the app works whatever the project's default privileges are.
-- RLS above still decides which rows each role sees.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.bands, public.gigs, public.queue_items to anon;
grant select, insert, update, delete on public.bands, public.songs, public.cover_artists,
  public.gigs, public.gig_private, public.gig_song_off to authenticated;
grant select on public.queue_items, public.requests to authenticated;
grant all on all tables in schema public to service_role;
revoke insert, update, delete on public.bands, public.songs, public.cover_artists, public.gigs,
  public.gig_private, public.gig_song_off, public.queue_items, public.requests, public.votes,
  public.guest_sessions from anon;
revoke all on public.votes, public.guest_sessions, public.gig_private from anon;

-- Status changes go through band_set_gig_status so the one-live-gig rule holds.
revoke update on public.gigs from anon, authenticated;
grant update (name, starts_at, ends_at, requests_open, shoutouts_enabled) on public.gigs to authenticated;

revoke execute on function public.guest_request(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.guest_vote(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.start_item(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.lock_owned_gig(uuid) from public, anon;
revoke execute on function public.band_play(uuid) from public, anon;
revoke execute on function public.band_next(uuid) from public, anon;
revoke execute on function public.band_set_item(uuid, text) from public, anon;
revoke execute on function public.band_shoutout(uuid, boolean) from public, anon;
revoke execute on function public.band_set_gig_status(uuid, public.gig_status) from public, anon;

grant execute on function public.normalize_text(text), public.is_band_owner(uuid), public.is_gig_owner(uuid),
  public.is_live_gig(uuid), public.item_gig(uuid) to anon, authenticated, service_role;
grant execute on function public.lock_owned_gig(uuid), public.band_play(uuid), public.band_next(uuid),
  public.band_set_item(uuid, text), public.band_shoutout(uuid, boolean),
  public.band_set_gig_status(uuid, public.gig_status) to authenticated;
grant execute on function public.guest_request(uuid, uuid, uuid, text, text, text, text),
  public.guest_vote(uuid, uuid, uuid, integer), public.start_item(uuid, uuid) to service_role;

-- Realtime: guests and band dashboards subscribe to these.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.queue_items, public.gigs, public.requests;
  end if;
end $$;
