import { createClient } from "@supabase/supabase-js";

const url = "https://zsqbiaasmhmymeoixbfn.supabase.co";
const key = "sb_publishable_z93AWttCdiz2SYovl6gNtA_mLa6xBKp";

export const supabaseConfigured = Boolean(url && key && !url.includes("YOUR_PROJECT"));
export const supabase = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    })
  : null;

export type Profile = {
  id: string;
  display_name: string;
  points: number;
  games_played: number;
  wins: number;
  losses: number;
  tasks_completed: number;
  owned_cosmetics: string[];
  equipped_cosmetic: string;
};

export type Game = {
  id: string;
  room_code: string;
  game_name: string;
  host_id: string;
  status: "lobby" | "active" | "ended";
  phase: "lobby" | "active" | "discussion" | "voting" | "ended";
  settings: {
    maxPlayers: number;
    minPlayers: number;
    impostors: number;
    tasksPerPlayer: number;
    discussionSeconds: number;
    votingSeconds: number;
    allowSkip: boolean;
    mode: string;
  };
  meeting_number: number;
  meeting_reason: string | null;
  meeting_initiator: string | null;
  phase_ends_at: string | null;
  winner_team: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export type GamePlayer = {
  id: string;
  game_id: string;
  user_id: string;
  player_name: string;
  color: string;
  is_host: boolean;
  is_ready: boolean;
  is_alive: boolean;
  connected: boolean;
  joined_at: string;
};

export type PrivateTask = {
  id: string;
  title: string;
  instructions: string;
  category: string;
  difficulty: "Easy" | "Medium" | "Hard";
  points: number;
  completed: boolean;
};

export type PlayerSecret = {
  game_id: string;
  user_id: string;
  role: string;
  team: "Crew" | "Impostor";
  role_description: string;
  tasks: PrivateTask[];
};

export type GameEvent = {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
  payload: Record<string, unknown>;
};

export type GameResult = {
  winner_team: string;
  duration_seconds: number;
  tasks_completed: number;
  meetings: number;
  standings: Array<{
    user_id: string;
    player_name: string;
    role: string;
    color: string;
    alive: boolean;
  }>;
};