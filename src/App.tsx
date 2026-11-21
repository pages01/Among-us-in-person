import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle, ArrowLeft, ArrowRight, Award, Check, CheckCircle2, ChevronDown,
  CircleHelp, Clock3, Coins, Copy, Crown, Gamepad2, History, Home, LogOut,
  Medal, Menu, MessageCircle, Plus, QrCode, RefreshCw, Shield, ShoppingBag,
  Sparkles, Star, Swords, Ticket, Trophy, Users, Vote, Zap
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { gameAction, messageOf } from "./lib/api";
import {
  supabase, supabaseConfigured, type Game, type GameEvent, type GamePlayer,
  type GameResult, type PlayerSecret, type Profile, type PrivateTask
} from "./lib/supabase";

const COLORS = [
  { name: "Coral", value: "#ff626b" }, { name: "Azure", value: "#4ea8ff" },
  { name: "Lime", value: "#a6e36b" }, { name: "Violet", value: "#a78bfa" },
  { name: "Sun", value: "#ffd166" }, { name: "Rose", value: "#fb8bc7" },
  { name: "Teal", value: "#4dd8c6" }, { name: "Orange", value: "#ff9b54" },
  { name: "Ice", value: "#d8e7f7" }, { name: "Indigo", value: "#6574e8" },
  { name: "Mint", value: "#7de2b8" }, { name: "Slate", value: "#8998ae" },
];
const SKINS = [
  { id: "classic", name: "Classic Suit", price: 0, color: "#ff626b", detail: "The original everyday look" },
  { id: "arctic", name: "Arctic", price: 80, color: "#8ed7ff", detail: "Cool, calm, collected" },
  { id: "nebula", name: "Nebula", price: 140, color: "#aa8bfa", detail: "A little cosmic mystery" },
  { id: "solar", name: "Solar Flare", price: 200, color: "#ffc857", detail: "Bright enough to be suspicious" },
  { id: "mint", name: "Mint Circuit", price: 260, color: "#70e0bd", detail: "Fresh from the future" },
  { id: "stealth", name: "Stealth", price: 400, color: "#8393ac", detail: "Low profile, high style" },
];

type Screen = "home" | "create" | "join" | "lobby" | "game" | "profile" | "shop" | "history";
type HistoryItem = { game_id: string; games: { game_name: string; created_at: string; winner_team: string | null; status: string; meeting_number: number } | null };

const DEFAULT_SETTINGS = {
  maxPlayers: 12,
  minPlayers: 4,
  impostors: 1,
  tasksPerPlayer: 4,
  discussionSeconds: 90,
  votingSeconds: 60,
  allowSkip: true,
  mode: "Classic",
};

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  return Math.floor(safe / 60).toString().padStart(2, "0") + ":" + Math.floor(safe % 60).toString().padStart(2, "0");
}

function getJoinUrl(code: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", code);
  url.hash = "";
  return url.toString();
}

function CrewBadge({ color, size = "md" }: { color: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={"crew-badge crew-" + size} style={{ "--crew-color": color } as React.CSSProperties}>
      <span className="crew-glass" />
    </span>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={"glass-panel " + className}>{children}</section>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [secret, setSecret] = useState<PlayerSecret | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [results, setResults] = useState<GameResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState(new URLSearchParams(window.location.search).get("room") || "");
  const [gameName, setGameName] = useState("Game night");
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [color, setColor] = useState(COLORS[0].value);
  const [voteTarget, setVoteTarget] = useState("");
  const [voteLocked, setVoteLocked] = useState(false);
  const [voteConfirm, setVoteConfirm] = useState(false);
  const [voteStatus, setVoteStatus] = useState({ submitted: 0, total: 0 });
  const [tab, setTab] = useState<"overview" | "tasks" | "players">("overview");
  const [hostTools, setHostTools] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());

  const userId = profile?.id || null;
  const isHost = Boolean(game && game.host_id === userId);
  const me = players.find((p) => p.user_id === userId) || null;
  const joinUrl = game ? getJoinUrl(game.room_code) : "";
  const remaining = game?.phase_ends_at ? Math.ceil((new Date(game.phase_ends_at).getTime() - clock) / 1000) : null;
  const taskList = secret?.tasks || [];
  const doneTasks = taskList.filter((task) => task.completed).length;
  const ownVote = voteLocked;

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  const loadProfile = useCallback(async () => {
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData.session?.user;
    if (!currentUser) return null;
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (data) setProfile(data as Profile);
    return (data as Profile | null) || null;
  }, []);

  const refreshGame = useCallback(async (gameId: string) => {
    if (!supabase) return;
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    if (!currentUser) return;
    const [gameQuery, playerQuery, secretQuery, eventQuery] = await Promise.all([
      supabase.from("games").select("*").eq("id", gameId).single(),
      supabase.from("game_players").select("*").eq("game_id", gameId).order("joined_at", { ascending: true }),
      supabase.from("game_private_state").select("*").eq("game_id", gameId).eq("user_id", currentUser.id).maybeSingle(),
      supabase.from("game_events").select("*").eq("game_id", gameId).order("created_at", { ascending: false }).limit(30),
    ]);
    if (gameQuery.error) throw gameQuery.error;
    if (playerQuery.error) throw playerQuery.error;
    setGame(gameQuery.data as Game);
    setPlayers((playerQuery.data || []) as GamePlayer[]);
    setSecret((secretQuery.data as PlayerSecret | null) || null);
    setEvents((eventQuery.data || []) as GameEvent[]);
    if (gameQuery.data?.phase === "voting") {
      const status = await gameAction<{ submitted: number; total: number }>("vote_status", { game_id: gameId });
      setVoteStatus(status);
      const { data: ownVote } = await supabase.from("game_votes").select("target_id,locked").eq("game_id", gameId).eq("meeting_number", gameQuery.data.meeting_number).eq("voter_id", currentUser.id).maybeSingle();
      setVoteTarget(ownVote?.target_id || "");
      setVoteLocked(Boolean(ownVote?.locked));
    } else {
      setVoteTarget("");
      setVoteLocked(false);
    }
    if (gameQuery.data?.phase === "ended") {
      const final = await gameAction<GameResult>("get_results", { game_id: gameId });
      setResults(final);
      setScreen("game");
      await loadProfile();
    }
  }, [loadProfile]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    loadProfile().then((existing) => {
      if (!alive) return;
      if (existing && roomCode) setScreen("join");
    }).catch((e) => setError(messageOf(e)));
    return () => { alive = false; };
  }, [loadProfile, roomCode]);

  useEffect(() => {
    if (!game?.id || !supabase || !userId) return;
    const refresh = () => refreshGame(game.id).catch((e) => setError(messageOf(e)));
    const channel = supabase.channel("game-live-" + game.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: "id=eq." + game.id }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: "game_id=eq." + game.id }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_events", filter: "game_id=eq." + game.id }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_private_state", filter: "user_id=eq." + userId }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_votes", filter: "voter_id=eq." + userId }, refresh)
      .subscribe();
    refresh();
    return () => { supabase.removeChannel(channel); };
  }, [game?.id, userId, refreshGame]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && isHost && game?.phase === "voting") {
      gameAction("resolve_vote", { game_id: game.id }).then(() => refreshGame(game.id)).catch((e) => setError(messageOf(e)));
    }
  }, [remaining, isHost, game, refreshGame]);

  async function loadHistory() {
    if (!supabase || !profile) return;
    const { data, error: historyError } = await supabase.from("game_players").select("game_id,games(game_name,created_at,winner_team,status,meeting_number)").eq("user_id", profile.id).order("joined_at", { ascending: false }).limit(25);
    if (historyError) throw historyError;
    setHistory((data || []) as unknown as HistoryItem[]);
  }

  useEffect(() => {
    if (screen === "history" && profile) loadHistory().catch((e) => setError(messageOf(e)));
  }, [screen, profile]);

  async function enterWithName() {
    if (!supabase) {
      setError("The Supabase project is not connected yet. Add the project URL and publishable key to the GitHub Pages environment.");
      return;
    }
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 18);
    if (clean.length < 2) {
      setError("Choose a name with at least 2 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user) {
        const { error: signInError } = await supabase.auth.signInAnonymously({
          options: { data: { display_name: clean } },
        });
        if (signInError) throw signInError;
      }
      await gameAction("set_name", { display_name: clean });
      const loaded = await loadProfile();
      if (!loaded) throw new Error("Your player profile was created, but it could not be loaded. Please refresh.");
      setName(clean);
      notify("Player profile ready. Your stats are now saved.");
      if (roomCode) setScreen("join");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function createGame() {
    setBusy(true);
    setError("");
    try {
      const created = await gameAction<{ game_id: string; room_code: string }>("create_game", {
        game_name: gameName.trim().slice(0, 32) || "Game night",
        settings,
      });
      await refreshGame(created.game_id);
      setScreen("lobby");
      notify("Your room is ready. Share the code or QR.");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function joinGame() {
    const cleanCode = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (cleanCode.length !== 6) {
      setError("Enter the 6-character room code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const joined = await gameAction<{ game_id: string; status: string }>("join_game", { room_code: cleanCode, color });
      await refreshGame(joined.game_id);
      setScreen(joined.status === "lobby" ? "lobby" : "game");
      notify(joined.status === "lobby" ? "You're in. Make sure everyone is ready." : "Reconnected to your live game.");
      window.history.replaceState({}, "", window.location.pathname);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: string, payload: Record<string, unknown> = {}, success?: string) {
    if (!game) return;
    setBusy(true);
    setError("");
    try {
      await gameAction(action, { game_id: game.id, ...payload });
      await refreshGame(game.id);
      await loadProfile();
      if (action === "start_game") setScreen("game");
      if (success) notify(success);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyRoom() {
    if (!game) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      notify("Join link copied.");
    } catch {
      notify("Room code: " + game.room_code);
    }
  }

  async function equipSkin(skinId: string) {
    try {
      await gameAction("equip_cosmetic", { cosmetic_id: skinId });
      await loadProfile();
      notify("Cosmetic equipped.");
    } catch (e) {
      setError(messageOf(e));
    }
  }

  async function buySkin(skinId: string) {
    setBusy(true);
    try {
      await gameAction("buy_cosmetic", { cosmetic_id: skinId });
      await loadProfile();
      notify("New cosmetic unlocked.");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  function selectVote(target: string) {
    setVoteTarget(target);
    setVoteConfirm(false);
  }

  async function castVote() {
    if (!game || !voteTarget) return;
    setBusy(true);
    try {
      await gameAction("cast_vote", { game_id: game.id, target_id: voteTarget, locked: true });
      setVoteLocked(true);
      setVoteConfirm(false);
      const status = await gameAction<{ submitted: number; total: number }>("vote_status", { game_id: game.id });
      setVoteStatus(status);
      await refreshGame(game.id);
      notify("Vote locked in.");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function goHome() {
    if (game?.id) {
      try { await gameAction("leave_game", { game_id: game.id }); } catch { /* Keep local navigation available during a disconnect. */ }
    }
    setGame(null);
    setPlayers([]);
    setSecret(null);
    setResults(null);
    setEvents([]);
    setScreen("home");
    setHostTools(false);
    window.history.replaceState({}, "", window.location.pathname);
  }

  const sortedEvents = useMemo(() => [...events].reverse(), [events]);
  const completedCount = players.length ? players.length : 0;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />
      <header className="topbar">
        <button className="brand" onClick={goHome} aria-label="AMONG IRL home">
          <span className="brand-mark"><span /></span>
          <span>AMONG<span className="brand-colon">:</span>IRL</span>
        </button>
        <div className="topbar-right">
          {profile && <button className="points-pill" onClick={() => setScreen("shop")}><Coins size={15} /> {profile.points} <span>PTS</span></button>}
          {profile && <button className="profile-mini" onClick={() => setScreen("profile")}><span className="profile-dot">{(profile.display_name || "?").slice(0, 1).toUpperCase()}</span><span>{profile.display_name}</span></button>}
        </div>
      </header>

      <main className="main-content">
        {!supabaseConfigured && (
          <div className="setup-banner">
            <AlertCircle size={18} />
            <div><strong>Backend connection needed</strong><span>The app is in setup mode. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to build a working multiplayer deployment.</span></div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!profile ? (
            <motion.section key="entry" className="entry-screen" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <div className="hero-orbit">
                <div className="orbit orbit-a" /><div className="orbit orbit-b" />
                <CrewBadge color="#ff626b" size="lg" />
                <span className="orbit-star star-a">✦</span><span className="orbit-star star-b">✧</span><span className="orbit-star star-c">·</span>
              </div>
              <div className="eyebrow"><span className="live-dot" /> THE IN-PERSON MULTIPLAYER GAME</div>
              <h1>Trust is a<br /><span>dangerous game.</span></h1>
              <p className="hero-copy">Bring your crew together. Complete your tasks. Find the impostor before it's too late.</p>
              <Panel className="entry-card">
                <label className="field-label" htmlFor="player-name">YOUR PLAYER NAME</label>
                <input id="player-name" className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" maxLength={18} onKeyDown={(e) => e.key === "Enter" && enterWithName()} />
                <button className="primary-button full-button" onClick={enterWithName} disabled={busy || !supabaseConfigured || name.trim().length < 2}>
                  {busy ? <span className="spinner" /> : <>Enter the game <ArrowRight size={17} /></>}
                </button>
                <div className="privacy-note"><Shield size={13} /> No email or password needed. Your guest profile is created automatically.</div>
              </Panel>
              <div className="feature-strip">
                <span><Users size={15} /> Real-time rooms</span><span><QrCode size={15} /> QR joining</span><span><Sparkles size={15} /> Unlockable suits</span>
              </div>
            </motion.section>
          ) : (
            <motion.div key={screen} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              {screen === "home" && (
                <section className="dashboard">
                  <div className="welcome-row">
                    <div><div className="eyebrow">WELCOME BACK, {profile.display_name.toUpperCase()}</div><h1>Ready for a<br /><span>little deception?</span></h1></div>
                    <div className="daily-orb"><CrewBadge color={SKINS.find(s => s.id === profile.equipped_cosmetic)?.color || color} size="lg" /></div>
                  </div>
                  <div className="home-actions">
                    <button className="create-card" onClick={() => setScreen("create")}>
                      <div className="action-icon"><Plus size={22} /></div>
                      <div><span className="action-kicker">HOST A SESSION</span><strong>Create game</strong><small>Set the rules. Gather your crew.</small></div>
                      <ArrowRight size={20} className="action-arrow" />
                    </button>
                    <button className="join-card" onClick={() => setScreen("join")}>
                      <div className="action-icon join-icon"><Ticket size={22} /></div>
                      <div><span className="action-kicker">JOIN YOUR CREW</span><strong>Join a game</strong><small>Enter a room code or scan a QR.</small></div>
                      <ArrowRight size={20} className="action-arrow" />
                    </button>
                  </div>
                  <div className="section-heading"><div><span className="eyebrow">YOUR PROGRESS</span><h2>Player overview</h2></div><button className="text-button" onClick={() => setScreen("profile")}>Full profile <ArrowRight size={14} /></button></div>
                  <div className="stats-grid">
                    <Panel className="stat-card"><span className="stat-icon"><Gamepad2 size={17} /></span><strong>{profile.games_played || 0}</strong><small>Games played</small></Panel>
                    <Panel className="stat-card"><span className="stat-icon"><Trophy size={17} /></span><strong>{profile.wins || 0}</strong><small>Victories</small></Panel>
                    <Panel className="stat-card"><span className="stat-icon"><CheckCircle2 size={17} /></span><strong>{profile.tasks_completed || 0}</strong><small>Tasks completed</small></Panel>
                    <Panel className="stat-card"><span className="stat-icon"><Coins size={17} /></span><strong>{profile.points || 0}</strong><small>Available points</small></Panel>
                  </div>
                  <Panel className="tip-card"><div className="tip-icon"><Sparkles size={18} /></div><div><strong>Make every round count</strong><p>Complete tasks and win matches to earn points. Spend them on new suit styles in the cosmetic shop.</p></div><button className="icon-button" onClick={() => setScreen("shop")}><ArrowRight size={18} /></button></Panel>
                </section>
              )}

              {screen === "create" && (
                <section className="narrow-screen">
                  <button className="back-button" onClick={() => setScreen("home")}><ArrowLeft size={16} /> Back</button>
                  <div className="eyebrow">HOST SETUP · STEP 01</div><h1>Create your<br /><span>game room.</span></h1>
                  <Panel className="form-panel">
                    <label className="field-label">GAME NAME</label>
                    <input className="text-input" value={gameName} onChange={(e) => setGameName(e.target.value)} maxLength={32} />
                    <div className="form-divider" />
                    <div className="settings-title"><div><span className="eyebrow">LOBBY</span><strong>Room settings</strong></div><span className="settings-tag">CLASSIC MODE</span></div>
                    <div className="setting-row"><div><strong>Maximum players</strong><small>How many people can join?</small></div><select value={settings.maxPlayers} onChange={(e) => setSettings({ ...settings, maxPlayers: Number(e.target.value), minPlayers: Math.min(settings.minPlayers, Number(e.target.value)) })}>{[6, 8, 10, 12, 15, 20].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                    <div className="setting-row"><div><strong>Impostors</strong><small>Hidden opposing players</small></div><select value={settings.impostors} onChange={(e) => setSettings({ ...settings, impostors: Number(e.target.value) })}>{[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                    <div className="setting-row"><div><strong>Tasks per player</strong><small>Personal objectives</small></div><select value={settings.tasksPerPlayer} onChange={(e) => setSettings({ ...settings, tasksPerPlayer: Number(e.target.value) })}>{[3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                    <div className="setting-row"><div><strong>Discussion time</strong><small>Time to talk before voting</small></div><select value={settings.discussionSeconds} onChange={(e) => setSettings({ ...settings, discussionSeconds: Number(e.target.value) })}>{[45, 60, 90, 120, 180, 240].map(n => <option key={n} value={n}>{n / 60 < 1 ? n + " sec" : n / 60 + " min"}</option>)}</select></div>
                    <div className="setting-row"><div><strong>Voting time</strong><small>Time to lock in a vote</small></div><select value={settings.votingSeconds} onChange={(e) => setSettings({ ...settings, votingSeconds: Number(e.target.value) })}>{[30, 45, 60, 90, 120].map(n => <option key={n} value={n}>{n / 60 < 1 ? n + " sec" : n / 60 + " min"}</option>)}</select></div>
                    <div className="setting-row"><div><strong>Allow skip vote</strong><small>Players can abstain from ejecting</small></div><button className={"toggle " + (settings.allowSkip ? "is-on" : "")} onClick={() => setSettings({ ...settings, allowSkip: !settings.allowSkip })}><span /></button></div>
                    <button className="primary-button full-button" onClick={createGame} disabled={busy}>{busy ? <span className="spinner" /> : <>Create room <ArrowRight size={17} /></>}</button>
                  </Panel>
                  <p className="footnote">You can manage the room and player list once everyone has joined.</p>
                </section>
              )}

              {screen === "join" && (
                <section className="narrow-screen">
                  <button className="back-button" onClick={() => setScreen("home")}><ArrowLeft size={16} /> Back</button>
                  <div className="eyebrow">JOIN YOUR CREW</div><h1>Enter the<br /><span>room code.</span></h1>
                  <Panel className="form-panel join-form">
                    <label className="field-label">6-CHARACTER ROOM CODE</label>
                    <input className="code-input" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ABC123" maxLength={6} autoCapitalize="characters" />
                    <label className="field-label color-label">CHOOSE YOUR SUIT COLOR</label>
                    <div className="color-grid">{COLORS.map((c) => <button key={c.value} aria-label={c.name} title={c.name} onClick={() => setColor(c.value)} className={"color-choice " + (color === c.value ? "selected" : "")} style={{ "--swatch": c.value } as React.CSSProperties}><span>{color === c.value && <Check size={15} />}</span></button>)}</div>
                    <button className="primary-button full-button" onClick={joinGame} disabled={busy || roomCode.length !== 6}>{busy ? <span className="spinner" /> : <>Join game <ArrowRight size={17} /></>}</button>
                    <p className="privacy-note"><QrCode size={13} /> Or scan the host's QR code with your phone camera.</p>
                  </Panel>
                </section>
              )}

              {screen === "lobby" && game && (
                <section className="lobby-screen">
                  <div className="lobby-top"><button className="back-button" onClick={goHome}><ArrowLeft size={16} /> Leave room</button><span className="status-pill"><span className="live-dot" /> WAITING FOR CREW</span></div>
                  <div className="lobby-title"><div className="eyebrow">ROOM {game.room_code}</div><h1>{game.game_name}</h1><p>Share the invite. The more the merrier.</p></div>
                  <div className="lobby-grid">
                    <Panel className="qr-panel"><div className="qr-frame"><QRCodeSVG value={joinUrl} size={176} bgColor="transparent" fgColor="#f3f6ff" level="H" includeMargin /></div><span className="eyebrow">SCAN TO JOIN</span><div className="room-code">{game.room_code}</div><button className="secondary-button full-button" onClick={copyRoom}><Copy size={15} /> Copy invite link</button></Panel>
                    <Panel className="crew-panel"><div className="panel-head"><div><span className="eyebrow">THE CREW</span><h2>{players.length}<span> / {game.settings.maxPlayers}</span></h2></div><span className="live-tag"><span className="live-dot" /> LIVE</span></div><div className="crew-list">{players.map((p) => <div className="crew-row" key={p.id}><CrewBadge color={p.color} size="sm" /><div className="crew-name"><strong>{p.player_name}</strong><small>{p.is_host ? "Host" : p.is_ready ? "Ready" : "Getting ready"}</small></div>{p.is_host && <Crown size={15} className="host-crown" />}{p.is_ready && <CheckCircle2 size={16} className="ready-check" />}</div>)}</div><div className="crew-footer"><span>{players.filter(p => p.is_ready).length} ready to launch</span><span>{players.length >= game.settings.minPlayers ? "Minimum reached" : (game.settings.minPlayers - players.length) + " more needed"}</span></div></Panel>
                  </div>
                  <Panel className="lobby-controls"><div className="settings-summary"><div><span className="eyebrow">GAME RULES</span><strong>Classic · {game.settings.impostors} impostor{game.settings.impostors === 1 ? "" : "s"}</strong><small>{game.settings.tasksPerPlayer} tasks each · {game.settings.discussionSeconds}s discussion · {game.settings.votingSeconds}s voting</small></div><span className="settings-tag">HOST SET</span></div>{isHost ? <button className="primary-button full-button" onClick={() => runAction("start_game", {}, "Game started. Check your private role.")} disabled={busy || players.length < game.settings.minPlayers || !players.every(p => p.is_ready)}>{busy ? <span className="spinner" /> : <>Start game <Zap size={17} /></>}</button> : <button className="secondary-button full-button" onClick={() => runAction("set_ready", { is_ready: !me?.is_ready }, me?.is_ready ? "You're not ready." : "You're ready.")}>{me?.is_ready ? <><Check size={17} /> You're ready · Tap to undo</> : <>I'm ready <ArrowRight size={17} /></>}</button>}<p className="footnote">{isHost ? "Everyone must be ready and the minimum player count must be reached." : "Let the host know when you're ready to start."}</p></Panel>
                </section>
              )}

              {screen === "game" && game && (
                <section className="game-screen">
                  <div className="game-topline"><button className="back-button" onClick={goHome}><ArrowLeft size={16} /> Exit</button><span className={"phase-pill phase-" + game.phase}>{game.phase === "active" ? "IN PROGRESS" : game.phase.toUpperCase()}</span><button className="icon-button" onClick={() => setHostTools(!hostTools)}>{isHost ? <Menu size={18} /> : <CircleHelp size={18} />}</button></div>
                  {game.status === "ended" ? (
                    <div className="result-view">
                      <div className="result-glow"><Trophy size={42} /></div><div className="eyebrow">ROUND COMPLETE</div><h1>{game.winner_team === "Crew" ? "Crew wins." : game.winner_team === "Impostor" ? "Impostors win." : "Game over."}</h1><p>{game.winner_team === "Crew" ? "The crew found the impostor or completed the tasks." : "The impostors outsmarted the crew."}</p>
                      <Panel className="result-panel"><div className="panel-head"><div><span className="eyebrow">FINAL STANDINGS</span><h2>All players</h2></div><span className="settings-tag">{game.winner_team} victory</span></div>{(results?.standings || players.map(p => ({ user_id:p.user_id, player_name:p.player_name, role:"—", color:p.color, alive:p.is_alive }))).map((p) => <div className="crew-row result-row" key={p.user_id}><CrewBadge color={p.color} size="sm" /><div className="crew-name"><strong>{p.player_name}</strong><small>{p.role} · {p.alive ? "Survived" : "Eliminated"}</small></div>{p.user_id === userId && <span className="you-tag">YOU</span>}</div>)}</Panel>
                      <button className="primary-button full-button" onClick={goHome}>Back to home <ArrowRight size={17} /></button>
                      {isHost && <button className="secondary-button full-button" onClick={() => { setGame(null); setPlayers([]); setSecret(null); setResults(null); setScreen("create"); }}>Host another game <ArrowRight size={17} /></button>}
                    </div>
                  ) : (
                    <>
                      <Panel className="mission-panel">
                        <div className="mission-head"><div><span className="eyebrow">GAME CLOCK</span><div className="timer-value">{remaining === null ? "••:••" : formatClock(remaining)}</div></div><div className="phase-meta"><span>{game.phase === "discussion" ? "DISCUSSION" : game.phase === "voting" ? "VOTING" : "ROUND " + Math.max(1, game.meeting_number + 1)}</span><small>{game.game_name}</small></div></div>
                        {secret && <div className={"role-strip " + (secret.team === "Impostor" ? "role-impostor" : "")}><div className="role-mark"><Shield size={18} /></div><div><span className="eyebrow">YOUR SECRET ROLE</span><strong>{secret.role}</strong><small>{secret.role_description}</small></div><span className="private-tag">PRIVATE</span></div>}
                      </Panel>
                      {game.phase === "active" && (
                        <>
                          <div className="game-tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button><button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>My tasks <span>{doneTasks}/{taskList.length}</span></button><button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}>Players</button></div>
                          {tab === "overview" && <div className="overview-grid"><Panel className="progress-panel"><div className="panel-head"><div><span className="eyebrow">YOUR OBJECTIVES</span><h2>{doneTasks} of {taskList.length}</h2></div><span className="progress-ring"><CheckCircle2 size={19} /></span></div><div className="progress-track"><span style={{ width: (taskList.length ? doneTasks / taskList.length * 100 : 0) + "%" }} /></div><p>Complete your assigned tasks to help the crew secure a win.</p><button className="secondary-button full-button" onClick={() => setTab("tasks")}>View tasks <ArrowRight size={15} /></button></Panel><Panel className="live-panel"><div className="panel-head"><div><span className="eyebrow">YOUR STATUS</span><h2>{me?.is_alive ? "Alive" : "Out"}</h2></div><CrewBadge color={me?.color || "#ff626b"} size="md" /></div><p>{me?.is_alive ? "Stay alert. Watch what happens around you." : "You're out for this round. Follow the host's dead-player rules."}</p><div className="tiny-stat"><Users size={14} /> {players.filter(p => p.is_alive).length} players remain</div></Panel></div>}
                          {tab === "tasks" && <Panel className="tasks-panel"><div className="panel-head"><div><span className="eyebrow">PERSONAL TASK LIST</span><h2>{secret?.team === "Impostor" ? "Stay undercover" : "Things to do"}</h2></div><span className="settings-tag">{doneTasks}/{taskList.length} DONE</span></div>{secret?.team === "Impostor" && <p className="impostor-hint">You are not completing crew tasks. Blend in, observe, and avoid drawing attention.</p>}{secret?.team === "Crew" && taskList.map((task) => <div className={"task-row " + (task.completed ? "task-done" : "")} key={task.id}><span className="task-check">{task.completed ? <Check size={16} /> : <Zap size={15} />}</span><div className="task-copy"><strong>{task.title}</strong><small>{task.category} · {task.difficulty} · +{task.points} pts</small><p>{task.instructions}</p></div>{!task.completed && me?.is_alive && secret?.team === "Crew" && <button className="task-complete" onClick={() => runAction("complete_task", { task_id: task.id }, "Task completed. Points added.")} disabled={busy}>Complete</button>}</div>)}</Panel>}
                          {tab === "players" && <Panel className="players-panel"><div className="panel-head"><div><span className="eyebrow">IN THIS ROUND</span><h2>Players</h2></div><span className="settings-tag">{players.length} TOTAL</span></div>{players.map(p => <div className={"crew-row " + (!p.is_alive ? "muted-row" : "")} key={p.id}><CrewBadge color={p.color} size="sm" /><div className="crew-name"><strong>{p.player_name}{p.user_id === userId ? " (you)" : ""}</strong><small>{p.is_alive ? "Alive" : "Eliminated"}</small></div>{p.is_host && <Crown size={15} className="host-crown" />}</div>)}</Panel>}
                          <button className="emergency-button" onClick={() => runAction("start_meeting", { reason: "Emergency meeting" }, "Meeting called.")} disabled={busy || !me?.is_alive}><MessageCircle size={18} /> Call an emergency meeting</button>
                        </>
                      )}
                      {game.phase === "discussion" && <Panel className="meeting-panel"><div className="meeting-symbol"><MessageCircle size={26} /></div><span className="eyebrow">MEETING CALLED</span><h2>Time to talk.</h2><p>{game.meeting_initiator || "A player"} called a meeting. Share what you saw and listen closely.</p><div className="meeting-timer">{remaining === null ? "—" : formatClock(remaining)}</div>{isHost ? <button className="primary-button full-button" onClick={() => runAction("start_voting", {}, "Voting is now open.")}>Start voting <Vote size={17} /></button> : <div className="wait-chip"><Clock3 size={15} /> Waiting for the host to start voting</div>}</Panel>}
                      {game.phase === "voting" && <Panel className="voting-panel"><div className="meeting-symbol vote-symbol"><Vote size={26} /></div><span className="eyebrow">CAST YOUR VOTE</span><h2>Who seems suspicious?</h2><p>Your vote stays private until voting closes.</p><div className="vote-options">{players.filter(p => p.is_alive).map(p => <button key={p.id} className={"vote-option " + (voteTarget === p.user_id ? "vote-selected" : "")} onClick={() => selectVote(p.user_id)} disabled={voteLocked || p.user_id === userId}><CrewBadge color={p.color} size="sm" /><span>{p.player_name}{p.user_id === userId ? " (you)" : ""}</span>{voteTarget === p.user_id && <CheckCircle2 size={16} />}</button>)}{game.settings.allowSkip && <button className={"vote-option skip-option " + (voteTarget === "skip" ? "vote-selected" : "")} onClick={() => selectVote("skip")} disabled={voteLocked}><span className="skip-mark">Ⅱ</span><span>Skip vote</span>{voteTarget === "skip" && <CheckCircle2 size={16} />}</button>}</div>{!voteLocked && me?.is_alive ? <><div className="vote-confirm-line">{voteConfirm ? <><strong>{voteTarget === "skip" ? "Skip vote" : "Your selection: " + (players.find(p => p.user_id === voteTarget)?.player_name || "selected player")}</strong><button className="text-button" onClick={() => setVoteConfirm(false)}>Change</button></> : <span>Choose a player, then review your selection.</span>}</div><button className="primary-button full-button" onClick={() => voteConfirm ? castVote() : setVoteConfirm(true)} disabled={busy || !voteTarget}>{voteConfirm ? <>Confirm & lock vote <Check size={17} /></> : <>Review vote <ArrowRight size={17} /></>}</button></> : <div className="wait-chip"><CheckCircle2 size={15} /> Vote locked · {voteStatus.submitted} of {voteStatus.total} submitted</div>}{isHost && <button className="secondary-button full-button" onClick={() => runAction("resolve_vote", {}, "Votes counted.")}>Close voting & count votes</button>}</Panel>}
                      {hostTools && isHost && <Panel className="host-tools"><div className="panel-head"><div><span className="eyebrow">HOST CONTROL CENTER</span><h2>Round controls</h2></div><Crown size={19} className="host-crown" /></div><div className="host-actions"><button onClick={() => runAction("start_meeting", { reason: "Host initiated" })}><MessageCircle size={16} /> Start meeting</button><button onClick={() => runAction("end_game", { winner_team: "Crew" })}><Trophy size={16} /> End · Crew wins</button><button onClick={() => runAction("end_game", { winner_team: "Impostor" })}><Swords size={16} /> End · Impostors win</button></div></Panel>}
                      {game.phase === "active" && events.find(ev => ev.event_type === "vote_result") && (() => {
                        const lastResult = events.find(ev => ev.event_type === "vote_result")!;
                        const counts = (lastResult.payload?.counts || {}) as Record<string, number>;
                        return <Panel className="vote-result-panel"><div className="panel-head"><div><span className="eyebrow">MEETING RESULT</span><h2>{lastResult.message}</h2></div><Vote size={18} /></div>{Object.entries(counts).sort((a,b) => b[1] - a[1]).map(([target,count]) => <div className="vote-tally-row" key={target}><span>{target === "skip" ? "Skipped" : players.find(p => p.user_id === target)?.player_name || "Player"}</span><strong>{count} vote{count === 1 ? "" : "s"}</strong></div>)}</Panel>;
                      })()}{sortedEvents.length > 0 && <Panel className="event-feed"><div className="panel-head"><div><span className="eyebrow">GAME ACTIVITY</span><h2>Latest events</h2></div><History size={17} /></div>{sortedEvents.slice(-5).map(ev => <div className="event-row" key={ev.id}><span className="event-dot" /><span>{ev.message}</span><small>{new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>)}</Panel>}
                    </>
                  )}
                </section>
              )}

              {screen === "profile" && (
                <section className="narrow-screen">
                  <button className="back-button" onClick={() => setScreen("home")}><ArrowLeft size={16} /> Back</button>
                  <div className="eyebrow">PLAYER IDENTITY</div><h1>Your player<br /><span>profile.</span></h1>
                  <Panel className="profile-card"><div className="profile-hero"><CrewBadge color={SKINS.find(s => s.id === profile.equipped_cosmetic)?.color || "#ff626b"} size="lg" /><div><h2>{profile.display_name}</h2><span className="online-tag"><span className="live-dot" /> GUEST PLAYER</span></div></div><div className="profile-stats"><div><strong>{profile.games_played || 0}</strong><small>Games</small></div><div><strong>{profile.wins || 0}</strong><small>Wins</small></div><div><strong>{profile.tasks_completed || 0}</strong><small>Tasks</small></div></div><div className="points-balance"><Coins size={20} /><div><strong>{profile.points || 0} points</strong><small>Use points to unlock suit cosmetics.</small></div><button className="text-button" onClick={() => setScreen("shop")}>Shop <ArrowRight size={14} /></button></div></Panel>
                  <Panel className="account-note"><Shield size={18} /><div><strong>Guest profile</strong><p>Your stats are saved to this browser's anonymous account. Clearing browser data or switching devices can make this guest identity inaccessible. An account-linking option can be added for recovery.</p></div></Panel>
                  <button className="secondary-button full-button" onClick={() => { supabase?.auth.signOut(); setProfile(null); setGame(null); setScreen("home"); }}><LogOut size={16} /> Sign out on this device</button>
                </section>
              )}

              {screen === "shop" && (
                <section className="shop-screen">
                  <button className="back-button" onClick={() => setScreen("home")}><ArrowLeft size={16} /> Back</button>
                  <div className="shop-heading"><div><div className="eyebrow">THE ARMORY</div><h1>Suit up.</h1><p>Earn points from tasks and matches. Make your next entrance count.</p></div><div className="shop-balance"><Coins size={17} /> {profile.points} <small>PTS</small></div></div>
                  <div className="skin-grid">{SKINS.map((skin) => {
                    const owned = (profile.owned_cosmetics || []).includes(skin.id);
                    const equipped = profile.equipped_cosmetic === skin.id;
                    return <Panel className={"skin-card " + (equipped ? "skin-equipped" : "")} key={skin.id}><div className="skin-preview" style={{ "--skin-color": skin.color } as React.CSSProperties}><CrewBadge color={skin.color} size="lg" />{equipped && <span className="equipped-label"><Check size={12} /> EQUIPPED</span>}</div><div className="skin-info"><strong>{skin.name}</strong><small>{skin.detail}</small><div className="skin-action">{owned ? <button className={equipped ? "owned-button" : "secondary-button"} onClick={() => equipSkin(skin.id)} disabled={equipped}>{equipped ? "Equipped" : "Equip skin"}</button> : <button className="buy-button" onClick={() => buySkin(skin.id)} disabled={busy || profile.points < skin.price}><Coins size={14} /> {skin.price} pts</button>}</div></div></Panel>;
                  })}</div>
                </section>
              )}

              {screen === "history" && (
                <section className="narrow-screen">
                  <button className="back-button" onClick={() => setScreen("home")}><ArrowLeft size={16} /> Back</button>
                  <div className="eyebrow">YOUR MATCH RECORD</div><h1>Game<br /><span>history.</span></h1>
                  <Panel className="history-panel"><div className="panel-head"><div><span className="eyebrow">SAVED TO YOUR PLAYER ACCOUNT</span><h2>Recent matches</h2></div><History size={18} /></div>{history.filter(item => item.games?.status === "ended").length === 0 ? <p className="empty-history">No completed matches yet. Your finished rounds will appear here.</p> : history.filter(item => item.games?.status === "ended").map(item => <div className="history-row" key={item.game_id}><div><strong>{item.games?.game_name || "Game night"}</strong><small>{item.games?.created_at ? new Date(item.games.created_at).toLocaleDateString() : "Saved match"} · {item.games?.meeting_number || 0} meetings</small></div><span className={"history-result " + (item.games?.winner_team === "Crew" ? "crew-win" : "impostor-win")}>{item.games?.winner_team || "Draw"} win</span></div>)}</Panel>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && <motion.div className="toast toast-error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><AlertCircle size={16} />{error}<button onClick={() => setError("")}>×</button></motion.div>}
        {notice && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><CheckCircle2 size={16} />{notice}</motion.div>}
      </main>

      {profile && !game && <nav className="bottom-nav"><button className={screen === "home" ? "nav-active" : ""} onClick={() => setScreen("home")}><Home size={18} /><span>Home</span></button><button className={screen === "shop" ? "nav-active" : ""} onClick={() => setScreen("shop")}><ShoppingBag size={18} /><span>Shop</span></button><button className={screen === "profile" ? "nav-active" : ""} onClick={() => setScreen("profile")}><Award size={18} /><span>Profile</span></button><button className={screen === "history" ? "nav-active" : ""} onClick={() => setScreen("history")}><History size={18} /><span>History</span></button></nav>}
      <footer className="site-footer"><span>AMONG:IRL</span><span>Made for your crew.</span></footer>
    </div>
  );
}
