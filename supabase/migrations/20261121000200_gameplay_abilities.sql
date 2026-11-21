alter table public.games add column if not exists last_kill_at timestamptz;
alter table public.game_private_state
  add column if not exists ability_used boolean not null default false,
  add column if not exists ability_target uuid,
  add column if not exists ability_result text;

create index if not exists games_host_id_idx on public.games(host_id);
create index if not exists game_private_state_user_id_idx on public.game_private_state(user_id);
create index if not exists game_votes_voter_id_idx on public.game_votes(voter_id);

-- Abilities are private to the player who owns the role. The server reads and writes them.
revoke all on public.game_private_state from anon;
