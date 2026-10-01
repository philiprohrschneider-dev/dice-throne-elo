-- Characters (Dice Throne heroes). Run once in the Supabase SQL editor; safe to run again.
-- Already part of schema.sql for new setups.

create table if not exists characters (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists characters_name_unique on characters (lower(trim(name)));

alter table games add column if not exists character_a_id bigint references characters (id);
alter table games add column if not exists character_b_id bigint references characters (id);

alter table characters enable row level security;
drop policy if exists "read characters" on characters;
create policy "read characters" on characters for select using (true);

create or replace function add_character(p_name text)
returns characters language plpgsql security definer set search_path = public as $$
declare r characters;
begin
  select * into r from characters where lower(trim(name)) = lower(trim(p_name));
  if found then return r; end if;
  insert into characters (name) values (trim(p_name)) returning * into r;
  return r;
end $$;

-- add_game / update_game gain optional character parameters. The old signatures are dropped
-- so calls stay unambiguous; calls without characters keep working through the defaults.
drop function if exists add_game(bigint, bigint, integer, integer);
create or replace function add_game(
  p_a bigint, p_b bigint, p_score_a integer, p_score_b integer,
  p_char_a bigint default null, p_char_b bigint default null
)
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
  insert into games (player_a_id, player_b_id, score_a, score_b, elo_a_before, elo_b_before, elo_a_after, elo_b_after,
                     character_a_id, character_b_id)
  values (p_a, p_b, p_score_a, p_score_b, a, b, a + d, b - d, p_char_a, p_char_b)
  returning * into r;
  update players set elo = a + d where id = p_a;
  update players set elo = b - d where id = p_b;
  return r;
end $$;

drop function if exists update_game(bigint, bigint, bigint, integer, integer);
create or replace function update_game(
  p_id bigint, p_a bigint, p_b bigint, p_score_a integer, p_score_b integer,
  p_char_a bigint default null, p_char_b bigint default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(424242);
  update games set player_a_id = p_a, player_b_id = p_b, score_a = p_score_a, score_b = p_score_b,
                   character_a_id = p_char_a, character_b_id = p_char_b
   where id = p_id;
  if not found then raise exception 'Spiel nicht gefunden'; end if;
  perform recompute_elo();
end $$;

-- Import also accepts [A, B, scoreA, scoreB, characterA, characterB] (characters optional).
create or replace function import_games(p_games jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  pa bigint;
  pb bigint;
  ca bigint;
  cb bigint;
  n integer := 0;
begin
  perform pg_advisory_xact_lock(424242);
  if exists (select 1 from games) then raise exception 'Es gibt schon Spiele, Import nur in eine leere Datenbank'; end if;
  for item in select * from jsonb_array_elements(p_games) loop
    insert into players (name) values (trim(item->>0)) on conflict (lower(trim(name))) do nothing;
    insert into players (name) values (trim(item->>1)) on conflict (lower(trim(name))) do nothing;
    select id into pa from players where lower(trim(name)) = lower(trim(item->>0));
    select id into pb from players where lower(trim(name)) = lower(trim(item->>1));
    ca := null;
    cb := null;
    if coalesce(trim(item->>4), '') <> '' then ca := (add_character(item->>4)).id; end if;
    if coalesce(trim(item->>5), '') <> '' then cb := (add_character(item->>5)).id; end if;
    perform add_game(pa, pb, (item->>2)::integer, (item->>3)::integer, ca, cb);
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function add_character(text),
  add_game(bigint, bigint, integer, integer, bigint, bigint),
  update_game(bigint, bigint, bigint, integer, integer, bigint, bigint)
  to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table characters;
exception when duplicate_object then null;
end $$;
