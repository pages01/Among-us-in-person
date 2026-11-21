-- AMONG: IRL core multiplayer schema.
-- All authoritative game writes are made by the authenticated game-api Edge Function.
create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Crewmate' check (char_length(display_name) between 2 and 18),
  points integer not null default 0 check (points >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  tasks_completed integer not null default 0 check (tasks_completed >= 0),
  owned_cosmetics text[] not null default array['classic']::text[],
  equipped_cosmetic text not null default 'classic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  game_name text not null default 'Game night' check (char_length(game_name) between 1 and 32),
  host_id uuid not null references auth.users(id),
  status text not null default 'lobby' check (status in ('lobby', 'active', 'ended')),
  phase text not null default 'lobby' check (phase in ('lobby', 'active', 'discussion', 'voting', 'ended')),
  settings jsonb not null default '{}'::jsonb,
  meeting_number integer not null default 0,
  meeting_reason text,
  meeting_initiator text,
  phase_ends_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  winner_team text check (winner_team in ('Crew', 'Impostor', 'Draw') or winner_team is null),
  created_at timestamptz not null default now()
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 2 and 18),
  color text not null default '#ff626b',
  is_host boolean not null default false,
  is_ready boolean not null default false,
  is_alive boolean not null default true,
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create table if not exists public.game_private_state (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  team text not null check (team in ('Crew', 'Impostor')),
  role_description text not null default '',
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table if not exists public.game_votes (
  game_id uuid not null references public.games(id) on delete cascade,
  meeting_number integer not null,
  voter_id uuid not null references auth.users(id) on delete cascade,
  target_id text not null,
  locked boolean not null default false,
  submitted_at timestamptz not null default now(),
  primary key (game_id, meeting_number, voter_id)
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  event_type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.game_results (
  game_id uuid primary key references public.games(id) on delete cascade,
  winner_team text not null check (winner_team in ('Crew', 'Impostor', 'Draw')),
  duration_seconds integer not null default 0,
  tasks_completed integer not null default 0,
  meetings integer not null default 0,
  standings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_players_game_id_idx on public.game_players(game_id);
create index if not exists game_players_user_id_idx on public.game_players(user_id);
create index if not exists game_events_game_created_idx on public.game_events(game_id, created_at desc);
create index if not exists games_created_at_idx on public.games(created_at desc);
create index if not exists game_votes_game_meeting_idx on public.game_votes(game_id, meeting_number);

-- The profile is created automatically when a name-only guest signs in anonymously.
create or replace function public.handle_new_guest_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitted_name text;
begin
  submitted_name := coalesce(new.raw_user_meta_data->>'display_name', 'Crewmate');
  submitted_name := left(regexp_replace(trim(submitted_name), '\s+', ' ', 'g'), 18);
  if char_length(submitted_name) < 2 then
    submitted_name := 'Crewmate';
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, submitted_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_among_irl on auth.users;
create trigger on_auth_user_created_among_irl
  after insert on auth.users
  for each row execute function public.handle_new_guest_profile();

revoke execute on function public.handle_new_guest_profile() from public, anon, authenticated;

-- RLS helper functions live outside exposed schemas. They read only membership/host data,
-- and never return any hidden role, task, vote, or impostor information.
create or replace function private.is_game_member(target_game uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_players p
    where p.game_id = target_game and p.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_game_host(target_game uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.games g
    where g.id = target_game and g.host_id = (select auth.uid())
  );
$$;

revoke all on function private.is_game_member(uuid) from public, anon;
revoke all on function private.is_game_host(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_game_member(uuid) to authenticated;
grant execute on function private.is_game_host(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_private_state enable row level security;
alter table public.game_votes enable row level security;
alter table public.game_events enable row level security;
alter table public.game_results enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "games_select_members" on public.games;
create policy "games_select_members" on public.games
  for select to authenticated
  using (private.is_game_member(id));

drop policy if exists "game_players_select_members" on public.game_players;
create policy "game_players_select_members" on public.game_players
  for select to authenticated
  using (private.is_game_member(game_id));

drop policy if exists "private_state_select_owner" on public.game_private_state;
create policy "private_state_select_owner" on public.game_private_state
  for select to authenticated
  using ((select auth.uid()) = user_id and private.is_game_member(game_id));

drop policy if exists "votes_select_own" on public.game_votes;
create policy "votes_select_own" on public.game_votes
  for select to authenticated
  using ((select auth.uid()) = voter_id);

drop policy if exists "events_select_members" on public.game_events;
create policy "events_select_members" on public.game_events
  for select to authenticated
  using (private.is_game_member(game_id));

drop policy if exists "results_select_members" on public.game_results;
create policy "results_select_members" on public.game_results
  for select to authenticated
  using (private.is_game_member(game_id));

-- No browser-side writes to authoritative game state or points.
revoke all on public.profiles, public.games, public.game_players,
  public.game_private_state, public.game_votes, public.game_events, public.game_results
  from anon, authenticated;
grant select on public.profiles, public.games, public.game_players,
  public.game_private_state, public.game_votes, public.game_events, public.game_results
  to authenticated;
grant all on public.profiles, public.games, public.game_players,
  public.game_private_state, public.game_votes, public.game_events, public.game_results
  to service_role;

-- Enable RLS-filtered Realtime updates for each player's own visible rows.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.games; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.game_players; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.game_private_state; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.game_votes; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.game_events; exception when duplicate_object then null; end;
  end if;
end;
$$;


-- Atomic task completion and cosmetic purchases prevent double rewards and negative balances.
create or replace function public.complete_task_and_reward(
  target_game uuid,
  target_user uuid,
  target_task uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_player public.game_players%rowtype;
  v_secret public.game_private_state%rowtype;
  v_task jsonb;
  v_task_index integer;
  v_reward integer;
begin
  select * into v_game from public.games where id = target_game;
  if not found or v_game.status <> 'active' or v_game.phase <> 'active' then
    raise exception 'Tasks can only be completed during an active round.';
  end if;

  select * into v_player
  from public.game_players
  where game_id = target_game and user_id = target_user
  for update;
  if not found or not v_player.is_alive then
    raise exception 'You are not an active living player in this room.';
  end if;

  select * into v_secret
  from public.game_private_state
  where game_id = target_game and user_id = target_user
  for update;
  if not found or v_secret.team <> 'Crew' then
    raise exception 'Only living crew players can complete crew tasks.';
  end if;

  select (task_row.ordinality - 1)::integer, task_row.value
  into v_task_index, v_task
  from jsonb_array_elements(v_secret.tasks) with ordinality as task_row(value, ordinality)
  where task_row.value->>'id' = target_task::text
  limit 1;
  if v_task_index is null then
    raise exception 'That task is not assigned to you.';
  end if;
  if coalesce((v_task->>'completed')::boolean, false) then
    raise exception 'That task has already been completed.';
  end if;

  v_reward := greatest(0, least(50, coalesce((v_task->>'points')::integer, 5)));
  update public.game_private_state
  set tasks = jsonb_set(
    jsonb_set(v_secret.tasks, array[v_task_index::text, 'completed'], 'true'::jsonb, false),
    array[v_task_index::text, 'completed_at'],
    to_jsonb(now()::text),
    true
  )
  where game_id = target_game and user_id = target_user;

  update public.profiles
  set points = points + v_reward,
      tasks_completed = tasks_completed + 1,
      updated_at = now()
  where id = target_user;

  return jsonb_build_object('ok', true, 'reward', v_reward);
end;
$$;

create or replace function public.purchase_cosmetic(
  target_user uuid,
  target_cosmetic text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_price integer;
begin
  v_price := case target_cosmetic
    when 'classic' then 0
    when 'arctic' then 80
    when 'nebula' then 140
    when 'solar' then 200
    when 'mint' then 260
    when 'stealth' then 400
    else null
  end;
  if v_price is null then
    raise exception 'That cosmetic is not available.';
  end if;

  select * into v_profile from public.profiles where id = target_user for update;
  if not found then
    raise exception 'Player profile not found.';
  end if;
  if target_cosmetic = any(v_profile.owned_cosmetics) then
    raise exception 'You already own this cosmetic.';
  end if;
  if v_profile.points < v_price then
    raise exception 'You do not have enough points.';
  end if;

  update public.profiles
  set points = points - v_price,
      owned_cosmetics = array_append(owned_cosmetics, target_cosmetic),
      updated_at = now()
  where id = target_user;

  return jsonb_build_object('ok', true, 'price', v_price);
end;
$$;

revoke all on function public.complete_task_and_reward(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.purchase_cosmetic(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_task_and_reward(uuid, uuid, uuid) to service_role;
grant execute on function public.purchase_cosmetic(uuid, text) to service_role;
