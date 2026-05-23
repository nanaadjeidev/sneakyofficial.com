import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { MODES, STAGES } from "../../components/tournament/splatoonData";

const API_URL  = import.meta.env.VITE_API_URL  ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const DISCORD  = "discord.gg/gmJeQefe5X";

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Team { id: number; name: string; members: string[]; captain: string | null }
interface GameMap { game_number: number; stage_name: string | null }

interface OverlayMatchData {
  match_id: number;
  round: number;
  total_rounds: number;
  tournament_name: string;
  status: string;
  team1: Team;
  team2: Team;
  team1_games: number;
  team2_games: number;
  best_of: number;
  stage_name: string | null;
  mode_name: string | null;
  games: GameMap[];
  game_results: { game_number: number; winner: 1 | 2 }[];
}

function getRoundLabel(round: number, total: number): string {
  if (round === total) return "FINAL";
  if (round === total - 1 && total > 2) return "SEMIS";
  return `R${round}`;
}

// ── Idle slides ────────────────────────────────────────────────────────────────

const IDLE_SLIDES = [
  { icon: "🎮", left: "sneakyonnightmode", right: "twitch.tv/sneakyonnightmode", accent: "rgba(145,70,255,0.85)" },
  { icon: "🟣", left: "TWITCH  →  !splattag YourName#1234", right: "then  !in  to enter", accent: "rgba(145,70,255,0.85)" },
  { icon: "4️⃣", left: "Need to link Discord first?", right: "/profile link twitch:yourname  in Discord", accent: "rgba(145,70,255,0.70)" },
  { icon: "💬", left: "YouTube / TikTok viewers:", right: `Join ${DISCORD}  →  /tournament signup`, accent: "rgba(88,101,242,0.90)" },
  { icon: "🌐", left: "In a match?", right: "sneakyofficial.com/tournament  —  confirm results here", accent: "rgba(52,211,153,0.75)" },
];

const SLIDE_MS  = 4500;
const FADE_MS   = 320;

function useIdleSlide() {
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % IDLE_SLIDES.length); setVisible(true); }, FADE_MS + 20);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  return { slide: IDLE_SLIDES[idx], visible, total: IDLE_SLIDES.length, idx };
}

// ── Keyframes ─────────────────────────────────────────────────────────────────

function useRibbonKeyframes() {
  useEffect(() => {
    const id = "spl-ribbon-kf";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes splRibbonIn {
        from { opacity: 0; transform: translateY(100%); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes splRibbonScan {
        0%   { transform: translateX(-100%); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateX(100vw); opacity: 0; }
      }
      @keyframes splRibbonIconGlow {
        0%, 100% { box-shadow: 0 0 10px rgba(145,70,255,0.5), 0 0 28px rgba(145,70,255,0.25); }
        50%      { box-shadow: 0 0 20px rgba(145,70,255,0.9), 0 0 50px rgba(145,70,255,0.45); }
      }
      @keyframes splRibbonAccentCycle {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
      @keyframes splRibbonMapBg {
        from { opacity: 0; }
        to   { opacity: 0.10; }
      }
      .spl-ribbon-in           { animation: splRibbonIn 0.55s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-icon-glow    { animation: splRibbonIconGlow 2.8s ease-in-out infinite; }
      .spl-ribbon-scan         { animation: splRibbonScan 4.5s ease-in-out infinite; }
      .spl-ribbon-map-bg       { animation: splRibbonMapBg 0.8s ease both; }
      .spl-ribbon-accent-cycle {
        background: linear-gradient(90deg, rgba(59,130,246,0.65), rgba(145,70,255,0.65), rgba(99,179,255,0.65), rgba(145,70,255,0.65), rgba(59,130,246,0.65));
        background-size: 200% auto;
        animation: splRibbonAccentCycle 5s linear infinite;
      }
    `;
    document.head.appendChild(el);
  }, []);
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useMatchData() {
  const [match,    setMatch]    = useState<OverlayMatchData | null>(null);
  const [stageKey, setStageKey] = useState(0);

  const fetchMatch = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay`, { params: { guild_id: GUILD_ID } });
      setMatch(data.match ?? null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchMatch(); }, [fetchMatch]);

  useEffect(() => {
    if (!GUILD_ID) return;
    let ws: WebSocket | null = null;
    let dead = false;
    const connect = () => {
      if (dead) return;
      ws = new WebSocket(`${getWsUrl()}?guild_id=${GUILD_ID}`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (["match_pinned", "match_complete", "match_reported"].includes(msg.event)) {
            fetchMatch();
          } else if (msg.event === "game_score") {
            setMatch(prev => prev && prev.match_id === msg.match_id
              ? { ...prev, team1_games: msg.team1_games ?? 0, team2_games: msg.team2_games ?? 0, game_results: msg.game_results ?? prev.game_results }
              : prev);
          } else if (msg.event === "counterpick_stage") {
            setMatch(prev => {
              if (!prev || prev.match_id !== msg.match_id) return prev;
              const games = prev.games.map(g => g.game_number === msg.game_number ? { ...g, stage_name: msg.stage_name } : g);
              const currentGame = prev.team1_games + prev.team2_games + 1;
              return { ...prev, games, stage_name: msg.game_number === currentGame ? msg.stage_name : prev.stage_name };
            });
            setStageKey(k => k + 1);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000); };
    };
    connect();
    return () => { dead = true; ws?.close(); };
  }, [fetchMatch]);

  return { match, stageKey };
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function OverlayRibbon() {
  useRibbonKeyframes();

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const { match, stageKey } = useMatchData();
  const { slide, visible, total, idx } = useIdleSlide();

  // ── Idle ────────────────────────────────────────────────────────────────────
  if (!match) {
    return (
      <div
        data-overlay
        className="spl-ribbon-in"
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center",
          gap: "1.8vw", padding: "0 2.2vw",
          boxSizing: "border-box",
          background: "rgba(6,6,18,0.93)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          borderTop: "1.5px solid rgba(145,70,255,0.35)",
          position: "relative", overflow: "hidden",
        }}
      >
        <div className="spl-ribbon-accent-cycle" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, pointerEvents: "none" }} />
        <div className="spl-ribbon-scan" style={{ position: "absolute", top: 0, left: 0, width: "8vw", height: "100%", background: "linear-gradient(to right, transparent, rgba(145,70,255,0.12), transparent)", pointerEvents: "none" }} />

        {/* Avatar */}
        <div className="spl-ribbon-icon-glow" style={{ width: "clamp(28px, 4vh, 44px)", height: "clamp(28px, 4vh, 44px)", borderRadius: "50%", overflow: "hidden", border: "2px solid rgba(145,70,255,0.7)", flexShrink: 0 }}>
          <img src="/android-chrome-512x512.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        {/* Slide content */}
        <div style={{
          flex: 1, minWidth: 0,
          display: "flex", alignItems: "center", gap: "1.2vw",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(3px)",
          transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
        }}>
          <span style={{ fontSize: "clamp(11px, 1.5vh, 16px)", lineHeight: 1, flexShrink: 0 }}>{slide.icon}</span>
          <span style={{ fontSize: "clamp(10px, 1.45vh, 15px)", fontWeight: 700, color: "rgba(255,255,255,0.80)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {slide.left}
          </span>
          <span style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0, fontSize: "clamp(8px, 1.1vh, 11px)" }}>·</span>
          <span style={{ fontSize: "clamp(10px, 1.45vh, 15px)", fontWeight: 600, color: slide.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
            {slide.right}
          </span>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: "0.35vw", alignItems: "center", flexShrink: 0 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ width: i === idx ? "clamp(10px, 1.4vw, 14px)" : "clamp(4px, 0.5vw, 6px)", height: "clamp(4px, 0.5vw, 6px)", borderRadius: 9999, background: i === idx ? slide.accent : "rgba(255,255,255,0.15)", transition: "width 0.3s ease, background 0.3s ease" }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Active match — map pick only ────────────────────────────────────────────
  const currentGame = match.team1_games + match.team2_games + 1;
  const curGameMap  = match.games.find(g => g.game_number === currentGame);
  const stageName   = match.stage_name ?? curGameMap?.stage_name ?? null;
  const stageData   = stageName ? STAGES.find(s => s.name === stageName) : null;
  const modeData    = match.mode_name ? MODES.find(m => m.name === match.mode_name) : null;
  const roundLabel  = getRoundLabel(match.round, match.total_rounds);
  const isComplete  = match.status === "complete";
  const isLive      = !isComplete && match.status !== "awaiting_confirmation";

  return (
    <div
      data-overlay
      className="spl-ribbon-in"
      style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center",
        gap: "1.6vw", padding: "0 2.4vw",
        boxSizing: "border-box",
        background: "rgba(6,6,18,0.91)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        borderTop: isLive
          ? "1.5px solid rgba(239,68,68,0.45)"
          : isComplete
          ? "1.5px solid rgba(52,211,153,0.35)"
          : "1.5px solid rgba(255,255,255,0.08)",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Stage art bleed */}
      {stageData && (
        <img
          key={`ribbon-bg-${stageKey}`}
          src={stageData.image}
          alt=""
          className="spl-ribbon-map-bg"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
        />
      )}

      {/* Status pill */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5vw", flexShrink: 0 }}>
        {isLive && (
          <div style={{ position: "relative", width: "clamp(5px, 0.6vw, 7px)", height: "clamp(5px, 0.6vw, 7px)" }}>
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
            <div className="absolute inset-0 rounded-full bg-red-500" />
          </div>
        )}
        <span style={{ fontSize: "clamp(7px, 0.85vw, 10px)", fontWeight: 900, letterSpacing: "0.26em", textTransform: "uppercase", color: isLive ? "rgba(239,68,68,0.90)" : isComplete ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.30)" }}>
          {isLive ? "LIVE" : isComplete ? "DONE" : "CONF"}
        </span>
        <span style={{ fontSize: "clamp(6px, 0.75vw, 9px)", fontWeight: 700, letterSpacing: "0.16em", color: "rgba(255,255,255,0.22)", textTransform: "uppercase" }}>
          {roundLabel}
        </span>
      </div>

      <div style={{ width: 1, alignSelf: "stretch", margin: "0.9vh 0", background: "rgba(255,255,255,0.09)", flexShrink: 0 }} />

      {/* Mode icon */}
      {modeData && (
        <img src={modeData.icon} alt={modeData.name} style={{ width: "clamp(14px, 2vh, 22px)", height: "clamp(14px, 2vh, 22px)", objectFit: "contain", opacity: 0.75, flexShrink: 0 }} />
      )}

      {/* Stage name — centred, takes up the bulk of the bar */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.15vh" }}>
        <span style={{
          fontSize: "clamp(13px, 2.1vh, 26px)",
          fontWeight: 900,
          letterSpacing: "0.04em",
          color: "#fff",
          textShadow: "0 1px 8px rgba(0,0,0,0.9)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}>
          {stageName ?? (isLive ? "Counterpick pending…" : "—")}
        </span>
        {modeData && (
          <span style={{ fontSize: "clamp(7px, 0.9vh, 10px)", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
            {modeData.name}
          </span>
        )}
      </div>

      <div style={{ width: 1, alignSelf: "stretch", margin: "0.9vh 0", background: "rgba(255,255,255,0.09)", flexShrink: 0 }} />

      {/* Game counter */}
      <span style={{ fontSize: "clamp(8px, 1.1vh, 13px)", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.28)", flexShrink: 0, textTransform: "uppercase" }}>
        G{currentGame}{match.best_of > 1 ? ` / ${match.best_of}` : ""}
      </span>
    </div>
  );
}
