import { useEffect, useState, useCallback } from "react";
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
  {
    eyebrow: "sneakyonnightmode",
    headline: "twitch.tv/sneakyonnightmode",
    sub: null as string | null,
    accent: "rgba(145,70,255,0.85)",
    icon: "🎮",
  },
  {
    eyebrow: "WATCHING ON TWITCH? (1/2)",
    headline: "!splattag YourName#1234",
    sub: "then join Discord & do /profile link twitch:yourname",
    accent: "rgba(145,70,255,0.85)",
    icon: "🟣",
  },
  {
    eyebrow: "WATCHING ON TWITCH? (2/2)",
    headline: "!in  — you're entered!",
    sub: "sneakyofficial.com/tournament  to confirm results",
    accent: "rgba(145,70,255,0.85)",
    icon: "✅",
  },
  {
    eyebrow: "YOUTUBE / TIKTOK?",
    headline: DISCORD,
    sub: "/tournament signup  in Discord to enter",
    accent: "rgba(88,101,242,0.90)",
    icon: "💬",
  },
  {
    eyebrow: "HOW IT WORKS",
    headline: "Sign up solo · Play 4v4 · Win!",
    sub: "Auto-matched into teams  ·  climb the leaderboard",
    accent: "rgba(52,211,153,0.75)",
    icon: "🏆",
  },
];

const SLIDE_MS = 4800;
const FADE_MS  = 360;

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

function useMobileKeyframes() {
  useEffect(() => {
    const id = "spl-mob-kf";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes mobRibbonIn {
        from { opacity: 0; transform: translateY(100%); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes mobAccentCycle {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
      @keyframes mobIconGlow {
        0%, 100% { box-shadow: 0 0 12px rgba(145,70,255,0.6), 0 0 32px rgba(145,70,255,0.3); }
        50%      { box-shadow: 0 0 24px rgba(145,70,255,1), 0 0 60px rgba(145,70,255,0.5); }
      }
      @keyframes mobMapBg {
        from { opacity: 0; }
        to   { opacity: 0.22; }
      }
      .mob-ribbon-in  { animation: mobRibbonIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
      .mob-icon-glow  { animation: mobIconGlow 2.8s ease-in-out infinite; }
      .mob-map-bg     { animation: mobMapBg 0.8s ease both; }
      .mob-accent-cycle {
        background: linear-gradient(90deg, rgba(59,130,246,0.8), rgba(145,70,255,0.8), rgba(99,179,255,0.8), rgba(145,70,255,0.8), rgba(59,130,246,0.8));
        background-size: 200% auto;
        animation: mobAccentCycle 4s linear infinite;
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
              ? { ...prev, team1_games: msg.team1_games ?? 0, team2_games: msg.team2_games ?? 0 }
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

export default function OverlayRibbonMobile() {
  useMobileKeyframes();

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
        className="mob-ribbon-in"
        style={{
          width: "100%", height: "100%",
          display: "flex", flexDirection: "column",
          justifyContent: "center",
          padding: "clamp(10px,2vh,18px) clamp(14px,4vw,28px)",
          boxSizing: "border-box",
          background: "rgba(6,6,18,0.95)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          borderTop: "3px solid rgba(145,70,255,0.5)",
          position: "relative", overflow: "hidden",
          gap: "clamp(4px,0.9vh,9px)",
        }}
      >
        <div className="mob-accent-cycle" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, pointerEvents: "none" }} />

        {/* Avatar + slide */}
        <div style={{ display: "flex", alignItems: "center", gap: "clamp(10px,3vw,20px)" }}>
          <div className="mob-icon-glow" style={{ width: "clamp(36px,10vw,56px)", height: "clamp(36px,10vw,56px)", borderRadius: "50%", overflow: "hidden", border: "2.5px solid rgba(145,70,255,0.8)", flexShrink: 0 }}>
            <img src="/android-chrome-512x512.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>

          <div style={{
            flex: 1, minWidth: 0,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(4px)",
            transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
            display: "flex", flexDirection: "column", gap: "clamp(2px,0.5vh,5px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.7vw" }}>
              <span style={{ fontSize: "clamp(10px,1.4vh,15px)", lineHeight: 1 }}>{slide.icon}</span>
              <span style={{ fontSize: "clamp(8px,1.1vh,12px)", fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", color: slide.accent, lineHeight: 1 }}>
                {slide.eyebrow}
              </span>
            </div>
            <span style={{ fontSize: "clamp(14px,3vh,26px)", fontWeight: 900, color: "#fff", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Courier New', Courier, monospace" }}>
              {slide.headline}
            </span>
            {slide.sub && (
              <span style={{ fontSize: "clamp(10px,1.5vh,14px)", fontWeight: 600, color: "rgba(255,255,255,0.50)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {slide.sub}
              </span>
            )}
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: "clamp(4px,1vw,8px)", alignSelf: "flex-end" }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ width: i === idx ? "clamp(14px,3vw,20px)" : "clamp(5px,1vw,7px)", height: "clamp(5px,1vw,7px)", borderRadius: 9999, background: i === idx ? slide.accent : "rgba(255,255,255,0.18)", transition: "width 0.3s ease, background 0.3s ease" }} />
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
      className="mob-ribbon-in"
      style={{
        width: "100%", height: "100%",
        display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center",
        background: "rgba(6,6,18,0.90)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        borderTop: isLive ? "3px solid rgba(239,68,68,0.55)" : isComplete ? "3px solid rgba(52,211,153,0.45)" : "3px solid rgba(255,255,255,0.10)",
        position: "relative", overflow: "hidden",
        gap: "clamp(3px,0.7vh,7px)",
        padding: "clamp(8px,1.5vh,14px) clamp(14px,4vw,28px)",
        boxSizing: "border-box",
      }}
    >
      {/* Stage art */}
      {stageData && (
        <img
          key={`mob-bg-${stageKey}`}
          src={stageData.image}
          alt=""
          className="mob-map-bg"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
        />
      )}

      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2vw", zIndex: 1 }}>
        {isLive && (
          <div style={{ position: "relative", width: "clamp(6px,1.6vw,9px)", height: "clamp(6px,1.6vw,9px)", flexShrink: 0 }}>
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
            <div className="absolute inset-0 rounded-full bg-red-500" />
          </div>
        )}
        <span style={{ fontSize: "clamp(8px,2vw,12px)", fontWeight: 900, letterSpacing: "0.26em", textTransform: "uppercase", color: isLive ? "rgba(239,68,68,0.95)" : isComplete ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.30)" }}>
          {isLive ? "LIVE" : isComplete ? "DONE" : "CONF"}
        </span>
        <span style={{ fontSize: "clamp(7px,1.8vw,11px)", fontWeight: 700, letterSpacing: "0.16em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase" }}>
          {roundLabel}  ·  G{currentGame}{match.best_of > 1 ? `/${match.best_of}` : ""}
        </span>
      </div>

      {/* Stage name */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2vw", zIndex: 1 }}>
        {modeData && (
          <img src={modeData.icon} alt={modeData.name} style={{ width: "clamp(18px,5vw,30px)", height: "clamp(18px,5vw,30px)", objectFit: "contain", opacity: 0.85, filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.8))", flexShrink: 0 }} />
        )}
        <span style={{
          fontSize: "clamp(20px,6.5vw,42px)",
          fontWeight: 900,
          letterSpacing: "0.03em",
          color: "#fff",
          textShadow: "0 2px 12px rgba(0,0,0,0.95)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {stageName ?? (isLive ? "Counterpick pending…" : "—")}
        </span>
      </div>

      {/* Mode name */}
      {modeData && (
        <span style={{ fontSize: "clamp(8px,2.2vw,13px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", zIndex: 1 }}>
          {modeData.name}
        </span>
      )}
    </div>
  );
}
