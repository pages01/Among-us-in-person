import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function fail(message: string, status = 400) {
  return reply({ error: message }, status);
}

function cleanName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 18);
}

function safeCode(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => alphabet[byte % alphabet.length]).join("");
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

const TASK_BANK: Array<[string, string, string, "Easy" | "Medium" | "Hard"]> = [
  ["Sequence recall", "Memory", "Ask the host to show you five simple symbols. Look away, then repeat them in the same order.", "Easy"],
  ["Reverse recall", "Memory", "Listen to a five-word list and repeat the words in reverse order.", "Medium"],
  ["Color memory", "Memory", "Study six colored objects for ten seconds, then name as many colors as you remember.", "Easy"],
  ["Three-word story", "Memory", "Remember three unrelated words and use all three in a short sentence after a one-minute pause.", "Medium"],
  ["Object snapshot", "Memory", "Study a small group of objects, look away, and tell the host which object was moved.", "Easy"],
  ["Number echo", "Memory", "Listen to a six-digit number and repeat it without writing it down.", "Medium"],
  ["Pattern memory", "Memory", "Copy a four-step clap pattern after seeing it once.", "Easy"],
  ["Name chain", "Memory", "Remember the first names of four players and say them in the order they joined.", "Medium"],
  ["Position recall", "Memory", "Look at four objects on a table, turn around, then describe where each one was.", "Easy"],
  ["Detail detective", "Memory", "Look at a picture or room corner for fifteen seconds and recall five details.", "Medium"],
  ["Mini sudoku", "Logic", "Complete a small 4-by-4 number grid so every row and column contains each number once.", "Hard"],
  ["Odd one out", "Logic", "Explain which item does not belong in a group of five objects and give a reason.", "Easy"],
  ["Pattern next", "Logic", "Solve the sequence 2, 4, 8, 16 and tell the host what comes next and why.", "Easy"],
  ["Paper bridge", "Logic", "Use one sheet of paper to make a bridge that can hold a small empty cup for five seconds.", "Medium"],
  ["Riddle room", "Logic", "Solve a short riddle chosen by the host without using a phone.", "Medium"],
  ["Sort the set", "Logic", "Arrange five number cards from smallest to largest without speaking.", "Easy"],
  ["Two truths puzzle", "Logic", "From three clues, identify which of three statements must be true.", "Medium"],
  ["Shape count", "Logic", "Count all the triangles in a simple shape puzzle shown by the host.", "Hard"],
  ["Missing piece", "Logic", "Find which one of six shapes completes a simple visual pattern.", "Medium"],
  ["Word ladder", "Logic", "Change one letter at a time to turn COLD into WARM, using valid words.", "Hard"],
  ["Quick capitals", "Trivia", "Name the capitals of three countries chosen by the host.", "Medium"],
  ["Science sparks", "Trivia", "Answer three age-appropriate science questions from the host.", "Medium"],
  ["Movie categories", "Trivia", "Name five animated movies in twenty seconds.", "Easy"],
  ["Animal facts", "Trivia", "Name three mammals that lay eggs or explain why the category is unusual.", "Hard"],
  ["Space check", "Trivia", "Name the eight planets in order from the Sun.", "Medium"],
  ["History snapshot", "Trivia", "Answer a short history question chosen by the host.", "Medium"],
  ["Word meanings", "Trivia", "Explain the meaning of three words picked by the host.", "Medium"],
  ["Geography map", "Trivia", "Point out three countries on a map shown by the host.", "Medium"],
  ["Sports rules", "Trivia", "Answer two questions about the rules of a sport selected by the host.", "Easy"],
  ["Music knowledge", "Trivia", "Identify three instruments from their pictures.", "Easy"],
  ["Room scan", "Observation", "Find an object in the room that is smaller than your palm and tell the host where it is.", "Easy"],
  ["Spot the change", "Observation", "Notice one change the host makes to a small display of objects.", "Easy"],
  ["Silent signals", "Observation", "Watch a short sequence of hand signals and repeat the sequence.", "Medium"],
  ["Shape hunt", "Observation", "Find one circular, one triangular, and one rectangular object nearby.", "Easy"],
  ["Color count", "Observation", "Count how many blue items are visible in the agreed play area.", "Easy"],
  ["Clock check", "Observation", "Look at an analog clock and tell the host the approximate time.", "Easy"],
  ["Pattern finder", "Observation", "Find a repeating pattern in the room and describe it.", "Easy"],
  ["Sound source", "Observation", "Listen to a sound made by the host and identify the object that made it.", "Medium"],
  ["Shadow match", "Observation", "Match three objects to their shadows on a sheet of paper.", "Medium"],
  ["Tiny detail", "Observation", "Find a small detail in a room decoration that the host describes.", "Medium"],
  ["Paper plane design", "Creative", "Fold a paper airplane and explain one design choice you made.", "Easy"],
  ["Logo sketch", "Creative", "Draw a simple original symbol for your team in thirty seconds.", "Easy"],
  ["Invent a use", "Creative", "Suggest two harmless alternate uses for an empty cardboard tube.", "Easy"],
  ["Caption challenge", "Creative", "Write a funny, family-friendly caption for a picture shown by the host.", "Easy"],
  ["Build a tower", "Creative", "Build the tallest freestanding tower you can from five lightweight items.", "Medium"],
  ["One-line story", "Creative", "Create a one-sentence story using three words selected by the host.", "Easy"],
  ["Design a badge", "Creative", "Draw a small badge that represents your current team.", "Easy"],
  ["Paper sculpture", "Creative", "Fold a sheet of paper into a shape that can stand by itself.", "Medium"],
  ["Invent a planet", "Creative", "Give a fictional planet a name, climate, and one interesting feature.", "Easy"],
  ["Emoji translation", "Creative", "Translate a three-emoji clue into a short phrase.", "Medium"],
  ["Cup stack", "Hands-on", "Stack five lightweight cups into a pyramid, then return them to one stack.", "Easy"],
  ["Tidy relay", "Hands-on", "Move three agreed game objects from one marked spot to another, one at a time.", "Easy"],
  ["Paper fold", "Hands-on", "Fold a sheet of paper into four equal sections as neatly as you can.", "Medium"],
  ["Coin pattern", "Hands-on", "Arrange five coins into a pattern described by the host.", "Easy"],
  ["Desk organizer", "Hands-on", "Arrange six safe, lightweight objects from shortest to tallest.", "Easy"],
  ["Card match", "Hands-on", "Match four pairs of picture cards laid face down.", "Medium"],
  ["Puzzle pieces", "Hands-on", "Put together a small jigsaw section supplied by the host.", "Medium"],
  ["String shape", "Hands-on", "Use a short piece of string to make a square on a flat surface.", "Easy"],
  ["Book balance", "Hands-on", "Place a lightweight book flat on a table and balance a paper card on top.", "Easy"],
  ["Color sort", "Hands-on", "Sort a handful of colored paper pieces into matching groups.", "Easy"],
  ["Team alphabet", "Teamwork", "Work with another player to name one animal for each of five letters.", "Medium"],
  ["Mirror moves", "Teamwork", "Copy a partner's slow hand movements for ten seconds without getting out of sync.", "Easy"],
  ["Shared story", "Teamwork", "Take turns with another player to create a four-sentence story.", "Easy"],
  ["No-talk sort", "Teamwork", "Arrange yourselves by birthday month without speaking.", "Medium"],
  ["Pair memory", "Teamwork", "Work with another player to remember and repeat a six-item list.", "Medium"],
  ["Two-person drawing", "Teamwork", "Take turns adding lines to create one shared drawing.", "Easy"],
  ["Silent lineup", "Teamwork", "Form a line by shoe color shade without talking.", "Medium"],
  ["Common ground", "Teamwork", "Find three things you and another player have in common that are not personal secrets.", "Easy"],
  ["Group count", "Teamwork", "Count from one to ten as a group, with no two players speaking at once.", "Medium"],
  ["Pass the pattern", "Teamwork", "Pass a simple clap pattern around three players without changing it.", "Medium"],
  ["Word scramble", "Wordplay", "Unscramble the letters in LISTEN to make a related word.", "Easy"],
  ["Category sprint", "Wordplay", "Name four fruits that begin with different letters.", "Easy"],
  ["Rhyming pair", "Wordplay", "Give the host three pairs of words that rhyme.", "Easy"],
  ["Hidden word", "Wordplay", "Find a smaller word hidden inside the word NOTEBOOK.", "Easy"],
  ["Alliteration", "Wordplay", "Create a short alliterative phrase using the letter S.", "Easy"],
  ["Anagram solve", "Wordplay", "Rearrange the letters in EARTH to make another common word.", "Medium"],
  ["Word association", "Wordplay", "Give a sensible association for five words selected by the host.", "Easy"],
  ["Sentence shuffle", "Wordplay", "Rearrange five word cards to form a grammatical sentence.", "Medium"],
  ["Letter ladder", "Wordplay", "Change CAT into DOG by changing one letter at a time and making real words.", "Hard"],
  ["Describe it", "Wordplay", "Describe a common object without saying its name while the host guesses.", "Medium"],
  ["Estimate the count", "Math", "Estimate how many small objects are in a clear container, then compare with the host's count.", "Easy"],
  ["Mental addition", "Math", "Add three two-digit numbers in your head.", "Medium"],
  ["Fraction match", "Math", "Match three simple fraction cards to their equivalent pictures.", "Medium"],
  ["Shape angles", "Math", "Identify which of three drawn angles is the largest.", "Easy"],
  ["Number target", "Math", "Use 2, 3, 4, and 5 with basic operations to make 24.", "Hard"],
  ["Measure by steps", "Math", "Estimate the length of a table using hand spans, then check with a ruler.", "Easy"],
  ["Quick multiples", "Math", "Name the first five multiples of seven.", "Medium"],
  ["Price estimate", "Math", "Estimate the total of three simple prices and explain your rounding.", "Easy"],
  ["Grid coordinates", "Math", "Find a cell on a simple 4-by-4 grid from a coordinate clue.", "Medium"],
  ["Number mystery", "Math", "Solve a two-step number riddle supplied by the host.", "Medium"],
  ["Safe route map", "Navigation", "Trace the shortest route between two points on a paper map.", "Easy"],
  ["Landmark match", "Navigation", "Match three landmarks to their pictures on a simple map.", "Medium"],
  ["Compass clue", "Navigation", "Use a compass app only if the host permits it to identify north.", "Easy"],
  ["Route memory", "Navigation", "Study a simple route diagram and repeat the turns in order.", "Medium"],
  ["Map symbol", "Navigation", "Explain three common symbols on a paper map.", "Easy"],
  ["Find the station", "Navigation", "Locate the agreed safe game station using a written clue from the host.", "Medium"],
  ["Left or right", "Navigation", "Follow a four-turn route described by the host within the designated play area.", "Easy"],
  ["Landmark order", "Navigation", "Put three nearby, host-approved landmarks in the order they appear on a map.", "Medium"],
  ["Route sketch", "Navigation", "Sketch the route from the lobby meeting point to an agreed game station.", "Medium"],
  ["Map puzzle", "Navigation", "Solve a simple route puzzle on a printed map without leaving the play area.", "Hard"],
];

const COSMETICS: Record<string, number> = {
  classic: 0, arctic: 80, nebula: 140, solar: 200, mint: 260, stealth: 400,
};

async function addEvent(gameId: string, eventType: string, message: string, payload: Record<string, unknown> = {}) {
  await admin.from("game_events").insert({ game_id: gameId, event_type: eventType, message, payload });
}

async function requireGame(gameId: string) {
  const { data, error } = await admin.from("games").select("*").eq("id", gameId).maybeSingle();
  if (error || !data) throw new Error("Game room not found.");
  return data;
}

async function requireHost(gameId: string, userId: string) {
  const game = await requireGame(gameId);
  if (game.host_id !== userId) throw new Error("Only the host can do that.");
  return game;
}

async function requirePlayer(gameId: string, userId: string) {
  const { data, error } = await admin.from("game_players").select("*").eq("game_id", gameId).eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("You are not a member of this room.");
  return data;
}

async function finishGame(gameId: string, winner: "Crew" | "Impostor" | "Draw") {
  const game = await requireGame(gameId);
  if (game.status === "ended") return;
  const { data: players } = await admin.from("game_players").select("*").eq("game_id", gameId);
  const { data: secrets } = await admin.from("game_private_state").select("*").eq("game_id", gameId);
  const secretByUser = new Map((secrets || []).map((row) => [row.user_id, row]));
  const crewSecrets = (secrets || []).filter((row) => row.team === "Crew");
  const taskCount = crewSecrets.reduce((sum, row) => sum + (Array.isArray(row.tasks) ? row.tasks.filter((task: { completed?: boolean }) => task.completed).length : 0), 0);
  const duration = game.started_at ? Math.max(0, Math.floor((Date.now() - new Date(game.started_at).getTime()) / 1000)) : 0;
  const standings = (players || []).map((player) => ({
    user_id: player.user_id,
    player_name: player.player_name,
    color: player.color,
    alive: player.is_alive,
    role: secretByUser.get(player.user_id)?.role || "Crewmate",
  }));
  await admin.from("games").update({
    status: "ended",
    phase: "ended",
    winner_team: winner,
    ended_at: new Date().toISOString(),
    phase_ends_at: null,
  }).eq("id", gameId);
  await admin.from("game_results").upsert({
    game_id: gameId,
    winner_team: winner,
    duration_seconds: duration,
    tasks_completed: taskCount,
    meetings: game.meeting_number || 0,
    standings,
  });
  for (const player of players || []) {
    const won = winner !== "Draw" && secretByUser.get(player.user_id)?.team === winner;
    const { data: profile } = await admin.from("profiles").select("points,games_played,wins,losses").eq("id", player.user_id).maybeSingle();
    if (profile) {
      await admin.from("profiles").update({
        games_played: profile.games_played + 1,
        wins: profile.wins + (won ? 1 : 0),
        losses: profile.losses + (won ? 0 : 1),
        points: profile.points + (won ? 25 : 5),
        updated_at: new Date().toISOString(),
      }).eq("id", player.user_id);
    }
  }
  await addEvent(gameId, "game_end", winner === "Draw" ? "The round ended in a draw." : winner + " team wins the game!", { winner_team: winner, tasks_completed: taskCount });
}

async function checkForWinner(gameId: string) {
  const { data: players } = await admin.from("game_players").select("user_id,is_alive").eq("game_id", gameId);
  const { data: secrets } = await admin.from("game_private_state").select("user_id,team,tasks").eq("game_id", gameId);
  if (!players?.length || !secrets?.length) return;
  const secretByUser = new Map(secrets.map((secret) => [secret.user_id, secret]));
  const living = players.filter((player) => player.is_alive);
  const livingImpostors = living.filter((player) => secretByUser.get(player.user_id)?.team === "Impostor").length;
  const livingCrew = living.length - livingImpostors;
  const crewTasks = secrets.filter((secret) => secret.team === "Crew");
  const totalTasks = crewTasks.reduce((sum, secret) => sum + (Array.isArray(secret.tasks) ? secret.tasks.length : 0), 0);
  const finishedTasks = crewTasks.reduce((sum, secret) => sum + (Array.isArray(secret.tasks) ? secret.tasks.filter((task: { completed?: boolean }) => task.completed).length : 0), 0);
  if (livingImpostors === 0) return finishGame(gameId, "Crew");
  if (livingImpostors >= livingCrew) return finishGame(gameId, "Impostor");
  if (totalTasks > 0 && finishedTasks >= totalTasks) return finishGame(gameId, "Crew");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return fail("Use POST for game actions.", 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return fail("Sign in to continue.", 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return fail("Your player session is invalid. Rejoin the game.", 401);
    const userId = authData.user.id;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const gameId = String(body.game_id || "");

    if (action === "set_name") {
      const displayName = cleanName(body.display_name);
      if (displayName.length < 2) return fail("Choose a name with at least 2 characters.");
      const { error } = await admin.from("profiles").upsert({ id: userId, display_name: displayName, updated_at: new Date().toISOString() });
      if (error) throw error;
      return reply({ ok: true, display_name: displayName });
    }

    if (action === "create_game") {
      const displayName = cleanName((await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle()).data?.display_name || "Host");
      const requested = body.settings && typeof body.settings === "object" ? body.settings as Record<string, unknown> : {};
      const maxPlayers = clamp(requested.maxPlayers, 4, 20, 12);
      const settings = {
        maxPlayers,
        minPlayers: clamp(requested.minPlayers, 4, maxPlayers, Math.min(4, maxPlayers)),
        impostors: clamp(requested.impostors, 1, Math.max(1, Math.floor((maxPlayers - 1) / 2)), 1),
        tasksPerPlayer: clamp(requested.tasksPerPlayer, 3, 7, 4),
        discussionSeconds: clamp(requested.discussionSeconds, 30, 300, 90),
        votingSeconds: clamp(requested.votingSeconds, 20, 180, 60),
        allowSkip: requested.allowSkip !== false,
        mode: "Classic",
      };
      const gameName = String(body.game_name || "Game night").trim().slice(0, 32) || "Game night";
      let created: { id: string; room_code: string } | null = null;
      for (let attempt = 0; attempt < 12 && !created; attempt++) {
        const code = makeRoomCode();
        const { data, error } = await admin.from("games").insert({
          room_code: code,
          game_name: gameName,
          host_id: userId,
          settings,
          status: "lobby",
          phase: "lobby",
        }).select("id,room_code").single();
        if (data) created = data;
        else if (error && error.code !== "23505") throw error;
      }
      if (!created) return fail("Could not allocate a room code. Try again.", 503);
      const { error: playerError } = await admin.from("game_players").insert({
        game_id: created.id, user_id: userId, player_name: displayName,
        color: "#ff626b", is_host: true, is_ready: true, is_alive: true, connected: true,
      });
      if (playerError) throw playerError;
      await addEvent(created.id, "room_created", displayName + " opened the room.", {});
      return reply({ game_id: created.id, room_code: created.room_code });
    }

    if (action === "join_game") {
      const roomCode = safeCode(body.room_code);
      if (roomCode.length !== 6) return fail("Enter a valid 6-character room code.");
      const { data: game, error: gameError } = await admin.from("games").select("*").eq("room_code", roomCode).maybeSingle();
      if (gameError || !game) return fail("That room code was not found.", 404);
      const { data: profile } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      const displayName = cleanName(profile?.display_name || "Crewmate");
      const { data: existing } = await admin.from("game_players").select("id").eq("game_id", game.id).eq("user_id", userId).maybeSingle();
      if (!existing) {
        if (game.status !== "lobby") return fail("This game has already started.", 409);
        const { count } = await admin.from("game_players").select("id", { count: "exact", head: true }).eq("game_id", game.id);
        if ((count || 0) >= Number(game.settings.maxPlayers || 12)) return fail("This room is full.", 409);
        const requestedColor = String(body.color || "#ff626b");
        const validColor = /^#[0-9a-fA-F]{6}$/.test(requestedColor) ? requestedColor : "#ff626b";
        const { error: insertError } = await admin.from("game_players").insert({
          game_id: game.id, user_id: userId, player_name: displayName,
          color: validColor, is_host: false, is_ready: false, is_alive: true, connected: true,
        });
        if (insertError) throw insertError;
        await addEvent(game.id, "player_joined", displayName + " joined the room.", {});
      } else {
        await admin.from("game_players").update({ connected: true }).eq("game_id", game.id).eq("user_id", userId);
      }
      return reply({ game_id: game.id, room_code: game.room_code });
    }

    if (action === "set_ready") {
      const game = await requireGame(gameId);
      if (game.status !== "lobby") return fail("The lobby is already closed.", 409);
      await requirePlayer(gameId, userId);
      const { error } = await admin.from("game_players").update({ is_ready: body.is_ready === true }).eq("game_id", gameId).eq("user_id", userId);
      if (error) throw error;
      const { data: player } = await admin.from("game_players").select("player_name,is_ready").eq("game_id", gameId).eq("user_id", userId).single();
      await addEvent(gameId, "ready", player.player_name + (player.is_ready ? " is ready." : " is not ready."), {});
      return reply({ ok: true });
    }

    if (action === "start_game") {
      const game = await requireHost(gameId, userId);
      if (game.status !== "lobby") return fail("This game has already started.", 409);
      const { data: players, error } = await admin.from("game_players").select("*").eq("game_id", gameId);
      if (error) throw error;
      const minimum = Number(game.settings.minPlayers || 4);
      if ((players || []).length < minimum) return fail("You need at least " + minimum + " players to start.");
      if (!(players || []).every((player) => player.is_ready)) return fail("Everyone must be ready before the game starts.");
      const impostorCount = Math.min(Number(game.settings.impostors || 1), Math.max(1, (players!.length - 1) >> 1));
      const shuffled = shuffle(players || []);
      const impostors = new Set(shuffled.slice(0, impostorCount).map((player) => player.user_id));
      const taskCount = Number(game.settings.tasksPerPlayer || 4);
      const secrets = (players || []).map((player) => {
        const isImpostor = impostors.has(player.user_id);
        const chosenTasks = shuffle(TASK_BANK).slice(0, taskCount).map((task, index) => ({
          id: crypto.randomUUID(),
          title: task[0],
          category: task[1],
          instructions: task[2],
          difficulty: task[3],
          points: task[3] === "Hard" ? 12 : task[3] === "Medium" ? 8 : 5,
          completed: false,
          order: index + 1,
        }));
        return {
          game_id: gameId,
          user_id: player.user_id,
          role: isImpostor ? "Impostor" : "Crewmate",
          team: isImpostor ? "Impostor" : "Crew",
          role_description: isImpostor
            ? "Blend in, stay convincing, and avoid being identified. Your team wins when impostors match or outnumber the living crew."
            : "Complete your assigned tasks, pay attention to the group, and vote carefully. Your team wins by completing all crew tasks or ejecting every impostor.",
          tasks: chosenTasks,
        };
      });
      const { error: secretError } = await admin.from("game_private_state").upsert(secrets);
      if (secretError) throw secretError;
      await admin.from("game_players").update({ is_alive: true }).eq("game_id", gameId);
      const { error: updateError } = await admin.from("games").update({
        status: "active", phase: "active", started_at: new Date().toISOString(), phase_ends_at: null,
        meeting_number: 0, winner_team: null,
      }).eq("id", gameId);
      if (updateError) throw updateError;
      await addEvent(gameId, "game_started", "The game has started. Check your private role.", {});
      return reply({ ok: true });
    }

    if (action === "complete_task") {
      const game = await requireGame(gameId);
      if (game.status !== "active" || game.phase !== "active") return fail("Tasks can only be completed during an active round.", 409);
      const player = await requirePlayer(gameId, userId);
      if (!player.is_alive) return fail("Eliminated players cannot complete tasks.");
      const { data: secret, error } = await admin.from("game_private_state").select("*").eq("game_id", gameId).eq("user_id", userId).maybeSingle();
      if (error || !secret) return fail("Your private task list is not available.", 404);
      if (secret.team !== "Crew") return fail("Impostors do not complete crew tasks.");
      const tasks = Array.isArray(secret.tasks) ? secret.tasks as Array<Record<string, unknown>> : [];
      const taskIndex = tasks.findIndex((task) => task.id === body.task_id);
      if (taskIndex < 0) return fail("That task is not assigned to you.", 404);
      if (tasks[taskIndex].completed === true) return fail("That task has already been completed.", 409);
      tasks[taskIndex].completed = true;
      tasks[taskIndex].completed_at = new Date().toISOString();
      const { error: updateError } = await admin.from("game_private_state").update({ tasks }).eq("game_id", gameId).eq("user_id", userId);
      if (updateError) throw updateError;
      const reward = Number(tasks[taskIndex].points || 5);
      const { data: profile } = await admin.from("profiles").select("points,tasks_completed").eq("id", userId).maybeSingle();
      if (profile) await admin.from("profiles").update({
        points: profile.points + reward,
        tasks_completed: profile.tasks_completed + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      const { data: me } = await admin.from("game_players").select("player_name").eq("game_id", gameId).eq("user_id", userId).single();
      await addEvent(gameId, "task_completed", me.player_name + " completed a task.", { reward });
      await checkForWinner(gameId);
      return reply({ ok: true, reward });
    }

    if (action === "start_meeting") {
      const game = await requireGame(gameId);
      if (game.status !== "active" || game.phase !== "active") return fail("A meeting cannot start right now.", 409);
      const player = await requirePlayer(gameId, userId);
      if (!player.is_alive && !player.is_host) return fail("Eliminated players cannot call meetings.");
      const reason = String(body.reason || "Emergency meeting").slice(0, 60);
      const duration = Number(game.settings.discussionSeconds || 90);
      const { data: profile } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      const { error } = await admin.from("games").update({
        phase: "discussion",
        meeting_number: Number(game.meeting_number || 0) + 1,
        meeting_reason: reason,
        meeting_initiator: profile?.display_name || "A player",
        phase_ends_at: new Date(Date.now() + duration * 1000).toISOString(),
      }).eq("id", gameId);
      if (error) throw error;
      await addEvent(gameId, "meeting_started", (profile?.display_name || "A player") + " called a meeting.", { reason });
      return reply({ ok: true });
    }

    if (action === "start_voting") {
      const game = await requireHost(gameId, userId);
      if (game.phase !== "discussion") return fail("Discussion is not active.", 409);
      const duration = Number(game.settings.votingSeconds || 60);
      const { error } = await admin.from("games").update({
        phase: "voting",
        phase_ends_at: new Date(Date.now() + duration * 1000).toISOString(),
      }).eq("id", gameId);
      if (error) throw error;
      await addEvent(gameId, "voting_started", "Voting is now open.", {});
      return reply({ ok: true });
    }

    if (action === "cast_vote") {
      const game = await requireGame(gameId);
      if (game.phase !== "voting") return fail("Voting is closed.", 409);
      const player = await requirePlayer(gameId, userId);
      if (!player.is_alive) return fail("Eliminated players cannot vote.");
      const targetId = String(body.target_id || "");
      if (targetId === "skip") {
        if (game.settings.allowSkip === false) return fail("Skipping is disabled for this game.");
      } else {
        if (!targetId || targetId === userId) return fail("Choose another living player or skip.");
        const { data: target } = await admin.from("game_players").select("user_id,is_alive").eq("game_id", gameId).eq("user_id", targetId).maybeSingle();
        if (!target || !target.is_alive) return fail("That player cannot receive a vote.");
      }
      const { data: previous } = await admin.from("game_votes").select("locked").eq("game_id", gameId).eq("meeting_number", game.meeting_number).eq("voter_id", userId).maybeSingle();
      if (previous?.locked) return fail("Your vote is already locked.", 409);
      const { error } = await admin.from("game_votes").upsert({
        game_id: gameId,
        meeting_number: game.meeting_number,
        voter_id: userId,
        target_id: targetId,
        locked: body.locked === true,
        submitted_at: new Date().toISOString(),
      }, { onConflict: "game_id,meeting_number,voter_id" });
      if (error) throw error;
      const { count } = await admin.from("game_votes").select("voter_id", { count: "exact", head: true }).eq("game_id", gameId).eq("meeting_number", game.meeting_number);
      const { count: total } = await admin.from("game_players").select("user_id", { count: "exact", head: true }).eq("game_id", gameId).eq("is_alive", true);
      await addEvent(gameId, "vote_progress", "A vote was submitted.", { submitted: count || 0, total: total || 0 });
      return reply({ ok: true, submitted: count || 0, total: total || 0 });
    }

    if (action === "vote_status") {
      await requirePlayer(gameId, userId);
      const game = await requireGame(gameId);
      const { count: submitted } = await admin.from("game_votes").select("voter_id", { count: "exact", head: true }).eq("game_id", gameId).eq("meeting_number", game.meeting_number);
      const { count: total } = await admin.from("game_players").select("user_id", { count: "exact", head: true }).eq("game_id", gameId).eq("is_alive", true);
      return reply({ submitted: submitted || 0, total: total || 0 });
    }

    if (action === "resolve_vote") {
      const game = await requireHost(gameId, userId);
      if (game.phase !== "voting") return fail("Voting is not active.", 409);
      const { data: votes, error } = await admin.from("game_votes").select("target_id").eq("game_id", gameId).eq("meeting_number", game.meeting_number);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const vote of votes || []) counts.set(vote.target_id, (counts.get(vote.target_id) || 0) + 1);
      const skipVotes = counts.get("skip") || 0;
      const candidates = [...counts.entries()].filter(([target]) => target !== "skip").sort((a, b) => b[1] - a[1]);
      let ejected: string | null = null;
      if (candidates.length > 0) {
        const top = candidates[0][1];
        const tied = candidates.filter(([, amount]) => amount === top).length > 1;
        if (!tied && top > skipVotes) ejected = candidates[0][0];
      }
      if (ejected) {
        const { error: ejectError } = await admin.from("game_players").update({ is_alive: false }).eq("game_id", gameId).eq("user_id", ejected);
        if (ejectError) throw ejectError;
      }
      const { data: ejectedPlayer } = ejected
        ? await admin.from("game_players").select("player_name").eq("game_id", gameId).eq("user_id", ejected).maybeSingle()
        : { data: null };
      const { data: profiles } = await admin.from("game_players").select("user_id,player_name").eq("game_id", gameId);
      const label = ejectedPlayer?.player_name ? ejectedPlayer.player_name + " was ejected." : "No one was ejected.";
      const revealCounts = Object.fromEntries(counts.entries());
      await addEvent(gameId, "vote_result", label, { counts: revealCounts, ejected_user_id: ejected });
      await admin.from("games").update({ phase: "active", phase_ends_at: null, meeting_reason: null }).eq("id", gameId);
      await checkForWinner(gameId);
      return reply({ ok: true, ejected, message: label, player_count: profiles?.length || 0 });
    }

    if (action === "end_game") {
      await requireHost(gameId, userId);
      const winner = body.winner_team === "Impostor" ? "Impostor" : body.winner_team === "Crew" ? "Crew" : "Draw";
      await finishGame(gameId, winner);
      return reply({ ok: true, winner_team: winner });
    }

    if (action === "get_results") {
      await requirePlayer(gameId, userId);
      const game = await requireGame(gameId);
      if (game.status !== "ended") return fail("The game is not finished yet.", 409);
      const { data, error } = await admin.from("game_results").select("*").eq("game_id", gameId).single();
      if (error) throw error;
      return reply(data as Record<string, unknown>);
    }

    if (action === "buy_cosmetic") {
      const cosmeticId = String(body.cosmetic_id || "");
      const price = COSMETICS[cosmeticId];
      if (price === undefined) return fail("That cosmetic is not available.");
      const { data: profile } = await admin.from("profiles").select("points,owned_cosmetics").eq("id", userId).maybeSingle();
      if (!profile) return fail("Player profile not found.", 404);
      if ((profile.owned_cosmetics || []).includes(cosmeticId)) return fail("You already own this cosmetic.");
      const { data: updated, error } = await admin.from("profiles").update({
        points: profile.points - price,
        owned_cosmetics: [...(profile.owned_cosmetics || []), cosmeticId],
        updated_at: new Date().toISOString(),
      }).eq("id", userId).gte("points", price).select("id").maybeSingle();
      if (error) throw error;
      if (!updated) return fail("You do not have enough points.", 409);
      return reply({ ok: true });
    }

    if (action === "equip_cosmetic") {
      const cosmeticId = String(body.cosmetic_id || "");
      const { data: profile } = await admin.from("profiles").select("owned_cosmetics").eq("id", userId).maybeSingle();
      if (!profile || !(profile.owned_cosmetics || []).includes(cosmeticId)) return fail("Unlock that cosmetic before equipping it.");
      const { error } = await admin.from("profiles").update({ equipped_cosmetic: cosmeticId, updated_at: new Date().toISOString() }).eq("id", userId);
      if (error) throw error;
      return reply({ ok: true });
    }

    return fail("Unknown game action.", 404);
  } catch (error) {
    console.error("game-api error", error);
    return fail(error instanceof Error ? error.message : "Unexpected game server error.", 500);
  }
});
