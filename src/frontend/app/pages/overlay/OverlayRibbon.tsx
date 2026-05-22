import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { STAGES } from "../../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Team { id: number; name: string; members: string[]; captain: string | null }
interface GameMap { game_number: number; stage_name: string | null }
interface GameResult { game_number: number; winner: 1 | 2 }

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
  game_results: GameResult[];
}

function getRoundLabel(round: number, total: number): string {
  if (round === total) return "FINAL";
  if (round === total - 1 && total > 2) return "SEMIS";
  return `ROUND ${round}`;
}

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
      @keyframes splRibbonScorePop {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.22); }
        100% { transform: scale(1); }
      }
      @keyframes splRibbonStageSlide {
        from { opacity: 0; transform: translateX(8px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes splRibbonIconGlow {
        0%, 100% { box-shadow: 0 0 10px rgba(145,70,255,0.5), 0 0 28px rgba(145,70,255,0.25); }
        50%      { box-shadow: 0 0 20px rgba(145,70,255,0.9), 0 0 50px rgba(145,70,255,0.45), 0 0 80px rgba(145,70,255,0.15); }
      }
      @keyframes splRibbonShimmer {
        0%   { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      @keyframes splRibbonUrlBreathe {
        0%, 100% { opacity: 0.55; }
        50%      { opacity: 0.90; }
      }
      @keyframes splRibbonAccentCycle {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
      .spl-ribbon-accent-cycle {
        background: linear-gradient(90deg, rgba(59,130,246,0.65), rgba(145,70,255,0.65), rgba(99,179,255,0.65), rgba(145,70,255,0.65), rgba(59,130,246,0.65));
        background-size: 200% auto;
        animation: splRibbonAccentCycle 5s linear infinite;
      }
      @keyframes splRibbonScan {
        0%   { transform: translateX(-100%); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateX(100vw); opacity: 0; }
      }
      @keyframes splRibbonIdleFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .spl-ribbon-in           { animation: splRibbonIn 0.55s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-score-pop    { animation: splRibbonScorePop 0.45s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-stage-slide  { animation: splRibbonStageSlide 0.4s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-idle-in      { animation: splRibbonIdleFadeIn 0.7s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-icon-glow    { animation: splRibbonIconGlow 2.8s ease-in-out infinite; }
      .spl-ribbon-shimmer-text {
        background: linear-gradient(90deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.85) 35%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.85) 65%, rgba(255,255,255,0.85) 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: splRibbonShimmer 3.5s linear infinite;
      }
      .spl-ribbon-url-breathe  { animation: splRibbonUrlBreathe 2.4s ease-in-out infinite; }
      .spl-ribbon-scan         { animation: splRibbonScan 4.5s ease-in-out infinite; }
    `;
    document.head.appendChild(el);
  }, []);
}

function useMatchData() {
  const [match, setMatch] = useState<OverlayMatchData | null>(null);
  const [scoreFlash, setScoreFlash] = useState(false);
  const [stageKey, setStageKey] = useState(0);
  const scoreRef = useRef<[number, number]>([0, 0]);

  const fetchMatch = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay`, {
        params: { guild_id: GUILD_ID },
      });
      setMatch(data.match ?? null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchMatch(); }, [fetchMatch]);

  useEffect(() => {
    if (!match) return;
    const cur: [number, number] = [match.team1_games, match.team2_games];
    if (cur[0] !== scoreRef.current[0] || cur[1] !== scoreRef.current[1]) {
      scoreRef.current = cur;
      setScoreFlash(true);
      setTimeout(() => setScoreFlash(false), 500);
    }
  }, [match?.team1_games, match?.team2_games]);

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
            setMatch((prev) => {
              if (!prev || prev.match_id !== msg.match_id) return prev;
              return {
                ...prev,
                team1_games: msg.team1_games ?? 0,
                team2_games: msg.team2_games ?? 0,
                game_results: msg.game_results ?? prev.game_results,
              };
            });
          } else if (msg.event === "counterpick_stage") {
            setMatch((prev) => {
              if (!prev || prev.match_id !== msg.match_id) return prev;
              const games = prev.games.map((g) =>
                g.game_number === msg.game_number ? { ...g, stage_name: msg.stage_name } : g
              );
              const currentGame = prev.team1_games + prev.team2_games + 1;
              const stageName = msg.game_number === currentGame ? msg.stage_name : prev.stage_name;
              return { ...prev, games, stage_name: stageName };
            });
            setStageKey((k) => k + 1);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000); };
    };
    connect();
    return () => { dead = true; ws?.close(); };
  }, [fetchMatch]);

  return { match, scoreFlash, stageKey };
}

function Divider() {
  return (
    <div style={{
      width: 1,
      alignSelf: "stretch",
      margin: "0.9vh 0",
      background: "rgba(255,255,255,0.09)",
      flexShrink: 0,
    }} />
  );
}

function ScorePip({ filled, win }: { filled: boolean; win: boolean }) {
  return (
    <div style={{
      width: "clamp(5px, 0.55vw, 7px)",
      height: "clamp(5px, 0.55vw, 7px)",
      borderRadius: "9999px",
      border: filled
        ? win ? "1px solid rgba(52,211,153,0.9)" : "1px solid rgba(248,113,113,0.7)"
        : "1px solid rgba(255,255,255,0.15)",
      background: filled
        ? win ? "rgb(52,211,153)" : "rgb(248,113,113)"
        : "transparent",
      boxShadow: filled && win ? "0 0 5px rgba(52,211,153,0.8)" : "none",
      flexShrink: 0,
    }} />
  );
}

const CROWN = (
  <svg viewBox="0 0 20 14" style={{ width: "clamp(8px, 1vw, 11px)", height: "auto", flexShrink: 0 }} fill="none">
    <path d="M1 13L4 5L7.5 9L10 2L12.5 9L16 5L19 13H1Z" fill="rgb(250,204,21)" stroke="rgb(234,179,8)" strokeWidth="1" strokeLinejoin="round"/>
  </svg>
);

function PlayerTicker({ team, align }: { team: Team; align: "left" | "right" }) {
  const members = team.captain
    ? [team.captain, ...team.members.filter((m) => m !== team.captain)]
    : team.members;
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (members.length <= 1) return;
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % members.length);
        setVisible(true);
      }, 280);
    }, 2800);
    return () => clearInterval(t);
  }, [members.length]);

  const member = members[idx] ?? "";
  const isCaptain = member === team.captain;

  return (
    <div style={{
      flexShrink: 0,
      width: "clamp(80px, 11vw, 160px)",
      display: "flex",
      flexDirection: "column",
      alignItems: align === "left" ? "flex-end" : "flex-start",
      gap: "0.2vh",
    }}>
      <span style={{
        fontSize: "clamp(6px, 0.7vw, 8px)",
        fontWeight: 700,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.20)",
        lineHeight: 1,
      }}>
        {team.name}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35vw",
          flexDirection: align === "left" ? "row-reverse" : "row",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : `translateY(${align === "left" ? "-" : ""}4px)`,
          transition: "opacity 0.28s ease, transform 0.28s ease",
        }}
      >
        {isCaptain && CROWN}
        <span style={{
          fontSize: "clamp(9px, 1.1vw, 13px)",
          fontWeight: isCaptain ? 800 : 500,
          color: isCaptain ? "rgb(250,204,21)" : "rgba(255,255,255,0.72)",
          textShadow: isCaptain ? "0 0 10px rgba(250,204,21,0.4)" : "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1,
          maxWidth: "clamp(70px, 10vw, 145px)",
          direction: align === "left" ? "rtl" : "ltr",
        }}>
          {member}
        </span>
      </div>
    </div>
  );
}

export default function OverlayRibbon() {
  useRibbonKeyframes();

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const { match, scoreFlash, stageKey } = useMatchData();

  if (!match) {
    return (
      <div
        data-overlay
        className="spl-ribbon-idle-in"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "2vw",
          background: "rgba(6,6,18,0.93)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          borderTop: "1.5px solid rgba(145,70,255,0.35)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Scan line sweep */}
        <div
          className="spl-ribbon-scan"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "8vw",
            height: "100%",
            background: "linear-gradient(to right, transparent, rgba(145,70,255,0.12), transparent)",
            pointerEvents: "none",
          }}
        />

        {/* Top accent — cycling blue/purple */}
        <div className="spl-ribbon-accent-cycle" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, pointerEvents: "none" }} />

        {/* Icon */}
        <div
          className="spl-ribbon-icon-glow"
          style={{
            width: "clamp(32px, 4.5vh, 52px)",
            height: "clamp(32px, 4.5vh, 52px)",
            borderRadius: "50%",
            overflow: "hidden",
            border: "2px solid rgba(145,70,255,0.7)",
            flexShrink: 0,
          }}
        >
          <img
            src="/android-chrome-512x512.png"
            alt="sneakyonnightmode"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        {/* Name + URL */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25vh", alignItems: "flex-start" }}>
          <span
            className="spl-ribbon-shimmer-text"
            style={{
              fontSize: "clamp(14px, 2.4vh, 28px)",
              fontWeight: 900,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            sneakyonnightmode
          </span>
          <span
            className="spl-ribbon-url-breathe"
            style={{
              fontSize: "clamp(9px, 1.4vh, 14px)",
              fontWeight: 600,
              color: "rgb(145,70,255)",
              letterSpacing: "0.04em",
              lineHeight: 1,
            }}
          >
            twitch.tv/sneakyonnightmode
          </span>
        </div>
      </div>
    );
  }

  const bestOf       = match.best_of ?? 1;
  const winsNeeded   = Math.ceil(bestOf / 2);
  const currentGame  = match.team1_games + match.team2_games + 1;
  const roundLabel   = getRoundLabel(match.round, match.total_rounds);
  const isComplete   = match.status === "complete";
  const isT1Winner   = isComplete && match.team1_games > match.team2_games;
  const isT2Winner   = isComplete && match.team2_games > match.team1_games;
  const isLive       = !isComplete && match.status !== "awaiting_confirmation";

  const curGameMap   = match.games.find((g) => g.game_number === currentGame);
  const stageName    = match.stage_name ?? curGameMap?.stage_name ?? null;
  const stageData    = stageName ? STAGES.find((s) => s.name === stageName) : null;

  const pipsT1 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team1_games) : [];
  const pipsT2 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team2_games) : [];

  return (
    <div
      data-overlay
      className="spl-ribbon-in"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: "1.6vw",
        padding: "0 2vw",
        boxSizing: "border-box",
        background: "rgba(6,6,18,0.91)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        borderTop: "1.5px solid rgba(255,255,255,0.08)",
        position: "relative",
        overflow: "hidden",
      }}
    >
        {/* Stage art ambient bleed */}
        {stageData && (
          <img
            key={`ribbon-bg-${stageKey}`}
            src={stageData.image}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.05,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Cycling top accent line */}
        <div
          className={!isLive && !isComplete ? "spl-ribbon-accent-cycle" : undefined}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: isLive
              ? "linear-gradient(to right, transparent, rgba(239,68,68,0.55) 30%, rgba(239,68,68,0.55) 70%, transparent)"
              : isComplete
              ? "linear-gradient(to right, transparent, rgba(52,211,153,0.40) 30%, rgba(52,211,153,0.40) 70%, transparent)"
              : undefined,
            pointerEvents: "none",
          }}
        />

        {/* Team 1 player ticker */}
        <PlayerTicker team={match.team1} align="left" />

        <Divider />

        {/* Live / status + Round */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4vw" }}>
            {isLive && (
              <div style={{ position: "relative", width: "clamp(5px, 0.55vw, 6px)", height: "clamp(5px, 0.55vw, 6px)", flexShrink: 0 }}>
                <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
                <div className="absolute inset-0 rounded-full bg-red-500" />
              </div>
            )}
            <span style={{ fontSize: "clamp(7px, 0.8vw, 9px)", fontWeight: 900, letterSpacing: "0.28em", textTransform: "uppercase", color: isLive ? "rgba(239,68,68,0.90)" : isComplete ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.30)" }}>
              {isLive ? "LIVE" : isComplete ? "DONE" : "CONF"}
            </span>
          </div>
          <span style={{ fontSize: "clamp(6px, 0.72vw, 8px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", lineHeight: 1 }}>
            {roundLabel}{bestOf > 1 ? ` · BO${bestOf}` : ""}
          </span>
        </div>

        <Divider />

        {/* Team 1 name + pips */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3vh" }}>
          <span style={{ fontSize: "clamp(11px, 1.5vw, 17px)", fontWeight: 900, lineHeight: 1, color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)", textShadow: isT1Winner ? "0 0 20px rgba(52,211,153,0.5)" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {match.team1.name}
          </span>
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "0.3vw", flexDirection: "row-reverse" }}>
              {pipsT1.map((f, i) => <ScorePip key={i} filled={f} win={isT1Winner} />)}
            </div>
          )}
        </div>

        {/* Score */}
        <div className={scoreFlash ? "spl-ribbon-score-pop" : undefined} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.7vw" }}>
          <span style={{ fontSize: "clamp(18px, 2.8vw, 34px)", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.92)" }}>{match.team1_games}</span>
          <span style={{ fontSize: "clamp(10px, 1.2vw, 14px)", fontWeight: 100, color: "rgba(255,255,255,0.20)" }}>—</span>
          <span style={{ fontSize: "clamp(18px, 2.8vw, 34px)", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.92)" }}>{match.team2_games}</span>
        </div>

        {/* Team 2 name + pips */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.3vh" }}>
          <span style={{ fontSize: "clamp(11px, 1.5vw, 17px)", fontWeight: 900, lineHeight: 1, color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)", textShadow: isT2Winner ? "0 0 20px rgba(52,211,153,0.5)" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {match.team2.name}
          </span>
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "0.3vw" }}>
              {pipsT2.map((f, i) => <ScorePip key={i} filled={f} win={isT2Winner} />)}
            </div>
          )}
        </div>

        <Divider />

        {/* Team 2 player ticker */}
        <PlayerTicker team={match.team2} align="right" />

    </div>
  );
}
