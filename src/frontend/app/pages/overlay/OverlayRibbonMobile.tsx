import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Team { id: number; name: string; members: string[]; captain: string | null }
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
  game_results: GameResult[];
}

function getRoundLabel(round: number, total: number): string {
  if (round === total) return "FINAL";
  if (round === total - 1 && total > 2) return "SEMIS";
  return `R${round}`;
}

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
      @keyframes mobScorePop {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.18); }
        100% { transform: scale(1); }
      }
      @keyframes mobScan {
        0%   { transform: translateX(-100%); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateX(200vw); opacity: 0; }
      }
      @keyframes mobIdlePulse {
        0%, 100% { opacity: 0.7; }
        50%      { opacity: 1; }
      }
      @keyframes mobAccentCycle {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
      @keyframes mobIconGlow {
        0%, 100% { box-shadow: 0 0 12px rgba(145,70,255,0.6), 0 0 32px rgba(145,70,255,0.3); }
        50%      { box-shadow: 0 0 24px rgba(145,70,255,1), 0 0 60px rgba(145,70,255,0.5); }
      }
      .mob-ribbon-in      { animation: mobRibbonIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
      .mob-score-pop      { animation: mobScorePop 0.4s cubic-bezier(0.22,1,0.36,1) both; }
      .mob-scan           { animation: mobScan 5s ease-in-out infinite; }
      .mob-idle-pulse     { animation: mobIdlePulse 2.5s ease-in-out infinite; }
      .mob-accent-cycle {
        background: linear-gradient(90deg, rgba(59,130,246,0.8), rgba(145,70,255,0.8), rgba(99,179,255,0.8), rgba(145,70,255,0.8), rgba(59,130,246,0.8));
        background-size: 200% auto;
        animation: mobAccentCycle 4s linear infinite;
      }
      .mob-icon-glow { animation: mobIconGlow 2.8s ease-in-out infinite; }
    `;
    document.head.appendChild(el);
  }, []);
}

function useMatchData() {
  const [match, setMatch] = useState<OverlayMatchData | null>(null);
  const [scoreFlash, setScoreFlash] = useState(false);
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
              return { ...prev, team1_games: msg.team1_games ?? 0, team2_games: msg.team2_games ?? 0 };
            });
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000); };
    };
    connect();
    return () => { dead = true; ws?.close(); };
  }, [fetchMatch]);

  return { match, scoreFlash };
}

export default function OverlayRibbonMobile() {
  useMobileKeyframes();

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const { match, scoreFlash } = useMatchData();

  if (!match) {
    return (
      <div
        data-overlay
        className="mob-ribbon-in"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "3vw",
          background: "rgba(6,6,18,0.95)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          borderTop: "3px solid rgba(145,70,255,0.5)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="mob-accent-cycle" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, pointerEvents: "none" }} />
        <div className="mob-scan" style={{ position: "absolute", top: 0, left: 0, width: "12vw", height: "100%", background: "linear-gradient(to right, transparent, rgba(145,70,255,0.15), transparent)", pointerEvents: "none" }} />

        <div className="mob-icon-glow" style={{ width: "clamp(44px, 12vw, 72px)", height: "clamp(44px, 12vw, 72px)", borderRadius: "50%", overflow: "hidden", border: "2.5px solid rgba(145,70,255,0.8)", flexShrink: 0 }}>
          <img src="/android-chrome-512x512.png" alt="sneakyonnightmode" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6vh", alignItems: "flex-start" }}>
          <span
            className="mob-idle-pulse"
            style={{
              fontSize: "clamp(20px, 6vw, 40px)",
              fontWeight: 900,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "#fff",
              lineHeight: 1,
            }}
          >
            sneakyonnightmode
          </span>
          <span style={{ fontSize: "clamp(12px, 3.5vw, 22px)", fontWeight: 700, color: "rgb(145,70,255)", letterSpacing: "0.04em", lineHeight: 1 }}>
            twitch.tv/sneakyonnightmode
          </span>
        </div>
      </div>
    );
  }

  const bestOf     = match.best_of ?? 1;
  const winsNeeded = Math.ceil(bestOf / 2);
  const roundLabel = getRoundLabel(match.round, match.total_rounds);
  const isComplete = match.status === "complete";
  const isT1Winner = isComplete && match.team1_games > match.team2_games;
  const isT2Winner = isComplete && match.team2_games > match.team1_games;
  const isLive     = !isComplete && match.status !== "awaiting_confirmation";

  const pipsT1 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team1_games) : [];
  const pipsT2 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team2_games) : [];

  const accentTop = isLive
    ? "linear-gradient(to right, transparent, rgba(239,68,68,0.7) 30%, rgba(239,68,68,0.7) 70%, transparent)"
    : isComplete
    ? "linear-gradient(to right, transparent, rgba(52,211,153,0.5) 30%, rgba(52,211,153,0.5) 70%, transparent)"
    : undefined;

  return (
    <div
      data-overlay
      className="mob-ribbon-in"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "rgba(6,6,18,0.95)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        borderTop: "3px solid rgba(255,255,255,0.10)",
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Top accent */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accentTop, pointerEvents: "none" }} />
      {!accentTop && <div className="mob-accent-cycle" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, pointerEvents: "none" }} />}

      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2vw", paddingTop: "1.2vh", paddingBottom: "0.4vh", flexShrink: 0 }}>
        {/* Live dot */}
        {isLive && (
          <div style={{ position: "relative", width: "clamp(7px, 2vw, 10px)", height: "clamp(7px, 2vw, 10px)", flexShrink: 0 }}>
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
            <div className="absolute inset-0 rounded-full bg-red-500" />
          </div>
        )}
        <span style={{
          fontSize: "clamp(9px, 2.8vw, 15px)",
          fontWeight: 900,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: isLive ? "rgba(239,68,68,0.95)" : isComplete ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.35)",
        }}>
          {isLive ? "LIVE" : isComplete ? "DONE" : "CONF"}
        </span>
        <span style={{ fontSize: "clamp(8px, 2.4vw, 13px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>
          {roundLabel}{bestOf > 1 ? ` · BO${bestOf}` : ""}
        </span>
        <span style={{ fontSize: "clamp(8px, 2.2vw, 12px)", fontWeight: 600, color: "rgba(145,70,255,0.7)", letterSpacing: "0.05em" }}>
          {match.tournament_name}
        </span>
      </div>

      {/* Main score row */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3vw", gap: "2vw", minHeight: 0 }}>

        {/* Team 1 */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4vh" }}>
          <span style={{
            fontSize: "clamp(15px, 5.2vw, 32px)",
            fontWeight: 900,
            lineHeight: 1,
            color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.95)",
            textShadow: isT1Winner ? "0 0 24px rgba(52,211,153,0.6)" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
            textAlign: "right",
          }}>
            {match.team1.name}
          </span>
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "1.2vw", flexDirection: "row-reverse" }}>
              {pipsT1.map((f, i) => (
                <div key={i} style={{
                  width: "clamp(6px, 1.8vw, 10px)",
                  height: "clamp(6px, 1.8vw, 10px)",
                  borderRadius: "9999px",
                  background: f ? (isT1Winner ? "rgb(52,211,153)" : "rgb(248,113,113)") : "transparent",
                  border: f ? (isT1Winner ? "1.5px solid rgba(52,211,153,0.9)" : "1.5px solid rgba(248,113,113,0.7)") : "1.5px solid rgba(255,255,255,0.18)",
                  boxShadow: f && isT1Winner ? "0 0 6px rgba(52,211,153,0.9)" : "none",
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Score */}
        <div
          className={scoreFlash ? "mob-score-pop" : undefined}
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "1.5vw" }}
        >
          <span style={{
            fontSize: "clamp(28px, 9vw, 56px)",
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.95)",
          }}>
            {match.team1_games}
          </span>
          <span style={{ fontSize: "clamp(14px, 3.5vw, 22px)", fontWeight: 100, color: "rgba(255,255,255,0.22)" }}>—</span>
          <span style={{
            fontSize: "clamp(28px, 9vw, 56px)",
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.95)",
          }}>
            {match.team2_games}
          </span>
        </div>

        {/* Team 2 */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.4vh" }}>
          <span style={{
            fontSize: "clamp(15px, 5.2vw, 32px)",
            fontWeight: 900,
            lineHeight: 1,
            color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.95)",
            textShadow: isT2Winner ? "0 0 24px rgba(52,211,153,0.6)" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}>
            {match.team2.name}
          </span>
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "1.2vw" }}>
              {pipsT2.map((f, i) => (
                <div key={i} style={{
                  width: "clamp(6px, 1.8vw, 10px)",
                  height: "clamp(6px, 1.8vw, 10px)",
                  borderRadius: "9999px",
                  background: f ? (isT2Winner ? "rgb(52,211,153)" : "rgb(248,113,113)") : "transparent",
                  border: f ? (isT2Winner ? "1.5px solid rgba(52,211,153,0.9)" : "1.5px solid rgba(248,113,113,0.7)") : "1.5px solid rgba(255,255,255,0.18)",
                  boxShadow: f && isT2Winner ? "0 0 6px rgba(52,211,153,0.9)" : "none",
                }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
