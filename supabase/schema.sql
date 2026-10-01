-- Dice Throne Elo: run once in the Supabase SQL editor.
-- Everyone with the link can read; all writes go through the functions below,
-- which hold a lock so two people saving at once never compute from stale ratings.

create table if not exists players (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 40),
  elo integer not null default 1000,
  created_at timestamptz not null default now()
);
create unique index if not exists players_name_unique on players (lower(trim(name)));

create table if not exists games (
  id bigint generated always as identity primary key,
  player_a_id bigint not null references players (id),
  player_b_id bigint not null references players (id),
  score_a integer not null check (score_a >= 0),
  score_b integer not null check (score_b >= 0),
  elo_a_before integer not null,
  elo_b_before integer not null,
  elo_a_after integer not null,
  elo_b_after integer not null,
  played_at timestamptz not null default now(),
  check (player_a_id <> player_b_id)
);
create index if not exists games_player_a on games (player_a_id);
create index if not exists games_player_b on games (player_b_id);

-- Must match src/lib/elo.ts exactly. floor(x + 0.5) mirrors JavaScript's Math.round.
create or replace function elo_delta(elo_a integer, elo_b integer, score_a integer, score_b integer)
returns integer language sql immutable as $$
  select floor(
    40
    * (1 + 0.35 * power(least(abs(score_a - score_b), 50)::float8 / 50, 2))
    * ((case when score_a > score_b then 1.0 when score_a < score_b then 0.0 else 0.5 end)::float8
       - 1 / (1 + power(10::float8, (elo_b - elo_a)::float8 / 350)))
    + 0.5
  )::integer
$$;

create or replace function recompute_elo()
returns void language plpgsql security definer set search_path = public as $$
declare
  g record;
  a integer;
  b integer;
  d integer;
begin
  perform pg_advisory_xact_lock(424242);
  update players set elo = 1000 where true;
  for g in select * from games order by id loop
    select elo into a from players where id = g.player_a_id;
    select elo into b from players where id = g.player_b_id;
    d := elo_delta(a, b, g.score_a, g.score_b);
    update games
       set elo_a_before = a, elo_b_before = b, elo_a_after = a + d, elo_b_after = b - d
     where id = g.id
       and (elo_a_before, elo_b_before, elo_a_after, elo_b_after) is distinct from (a, b, a + d, b - d);
    update players set elo = a + d where id = g.player_a_id;
    update players set elo = b - d where id = g.player_b_id;
  end loop;
end $$;

create or replace function add_player(p_name text)
returns players language plpgsql security definer set search_path = public as $$
declare r players;
begin
  insert into players (name) values (trim(p_name)) returning * into r;
  return r;
end $$;

create or replace function add_game(p_a bigint, p_b bigint, p_score_a integer, p_score_b integer)
returns games language plpgsql security definer set search_path = public as $$
declare
  a integer;
  b integer;
  d integer;
  r games;
begin
  perform pg_advisory_xact_lock(424242);
  select elo into a from players where id = p_a;
  select elo into b from players where id = p_b;
  if a is null or b is null then raise exception 'Unbekannter Spieler'; end if;
  d := elo_delta(a, b, p_score_a, p_score_b);
  insert into games (player_a_id, player_b_id, score_a, score_b, elo_a_before, elo_b_before, elo_a_after, elo_b_after)
  values (p_a, p_b, p_score_a, p_score_b, a, b, a + d, b - d)
  returning * into r;
  update players set elo = a + d where id = p_a;
  update players set elo = b - d where id = p_b;
  return r;
end $$;

-- Correcting or deleting a past game changes every later game, so both replay everything.
create or replace function update_game(p_id bigint, p_a bigint, p_b bigint, p_score_a integer, p_score_b integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(424242);
  update games set player_a_id = p_a, player_b_id = p_b, score_a = p_score_a, score_b = p_score_b where id = p_id;
  if not found then raise exception 'Spiel nicht gefunden'; end if;
  perform recompute_elo();
end $$;

create or replace function delete_game(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(424242);
  delete from games where id = p_id;
  perform recompute_elo();
end $$;

-- Only allowed while the database has no games, so the history can't be imported twice.
-- p_games: [["Lars","Michelle",12,0], ...] in chronological order.
create or replace function import_games(p_games jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  pa bigint;
  pb bigint;
  n integer := 0;
begin
  perform pg_advisory_xact_lock(424242);
  if exists (select 1 from games) then raise exception 'Es gibt schon Spiele, Import nur in eine leere Datenbank'; end if;
  for item in select * from jsonb_array_elements(p_games) loop
    insert into players (name) values (trim(item->>0)) on conflict (lower(trim(name))) do nothing;
    insert into players (name) values (trim(item->>1)) on conflict (lower(trim(name))) do nothing;
    select id into pa from players where lower(trim(name)) = lower(trim(item->>0));
    select id into pb from players where lower(trim(name)) = lower(trim(item->>1));
    perform add_game(pa, pb, (item->>2)::integer, (item->>3)::integer);
    n := n + 1;
  end loop;
  return n;
end $$;

alter table players enable row level security;
alter table games enable row level security;
drop policy if exists "read players" on players;
drop policy if exists "read games" on games;
create policy "read players" on players for select using (true);
create policy "read games" on games for select using (true);

revoke execute on function recompute_elo() from public, anon, authenticated;
grant execute on function add_player(text), add_game(bigint, bigint, integer, integer),
  update_game(bigint, bigint, bigint, integer, integer), delete_game(bigint), import_games(jsonb)
  to anon, authenticated;

-- Live updates for everyone who has the page open.
alter publication supabase_realtime add table players, games;
