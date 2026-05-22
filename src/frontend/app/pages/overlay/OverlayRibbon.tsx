import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { MODES, STAGES } from "../../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Team { id: number; name: string; members: string[] }
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
      .spl-ribbon-in         { animation: splRibbonIn 0.55s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-score-pop  { animation: splRibbonScorePop 0.45s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-stage-slide { animation: splRibbonStageSlide 0.4s cubic-bezier(0.22,1,0.36,1) both; }
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
      <div data-overlay style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end" }}>
        <div style={{
          width: "100%",
          padding: "0 2vw",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "clamp(52px, 9vh, 80px)",
          background: "rgba(6,6,18,0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}>
          <span style={{
            fontSize: "clamp(8px, 1vw, 11px)",
            fontWeight: 700,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.18)",
          }}>
            No match pinned
          </span>
        </div>
      </div>
    );
  }

  const bestOf       = match.best_of ?? 1;
  const winsNeeded   = Math.ceil(bestOf / 2);
  const currentGame  = match.team1_games + match.team2_games + 1;
  const modeData     = match.mode_name ? MODES.find((m) => m.name === match.mode_name) : null;
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
        alignItems: "flex-end",
      }}
    >
      <div style={{
        width: "100%",
        height: "clamp(52px, 9vh, 80px)",
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
      }}>
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

        {/* Subtle top accent line */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: isLive
            ? "linear-gradient(to right, transparent, rgba(239,68,68,0.55) 30%, rgba(239,68,68,0.55) 70%, transparent)"
            : isComplete
            ? "linear-gradient(to right, transparent, rgba(52,211,153,0.40) 30%, rgba(52,211,153,0.40) 70%, transparent)"
            : "linear-gradient(to right, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)",
          pointerEvents: "none",
        }} />

        {/* Live / status pill */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45vw",
          flexShrink: 0,
        }}>
          {isLive && (
            <div style={{ position: "relative", width: "clamp(5px, 0.6vw, 7px)", height: "clamp(5px, 0.6vw, 7px)", flexShrink: 0 }}>
              <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
              <div className="absolute inset-0 rounded-full bg-red-500" />
            </div>
          )}
          <span style={{
            fontSize: "clamp(7px, 0.85vw, 10px)",
            fontWeight: 900,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: isLive ? "rgba(239,68,68,0.90)" : isComplete ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.30)",
          }}>
            {isLive ? "LIVE" : isComplete ? "DONE" : "CONF"}
          </span>
        </div>

        <Divider />

        {/* Round + BO */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.2vh" }}>
          <span style={{
            fontSize: "clamp(7px, 0.82vw, 9px)",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.28)",
            lineHeight: 1,
          }}>
            {roundLabel}
          </span>
          {bestOf > 1 && (
            <span style={{
              fontSize: "clamp(6px, 0.7vw, 8px)",
              fontWeight: 600,
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.18)",
              lineHeight: 1,
            }}>
              BO{bestOf}
            </span>
          )}
        </div>

        <Divider />

        {/* Team 1 name + pips */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3vh" }}>
          <span style={{
            fontSize: "clamp(11px, 1.6vw, 18px)",
            fontWeight: 900,
            lineHeight: 1,
            color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)",
            textShadow: isT1Winner ? "0 0 20px rgba(52,211,153,0.5)" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}>
            {match.team1.name}
          </span>
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "0.3vw", flexDirection: "row-reverse" }}>
              {pipsT1.map((f, i) => <ScorePip key={i} filled={f} win={isT1Winner} />)}
            </div>
          )}
        </div>

        {/* Score */}
        <div
          className={scoreFlash ? "spl-ribbon-score-pop" : undefined}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.8vw",
          }}
        >
          <span style={{
            fontSize: "clamp(18px, 3vw, 36px)",
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.92)",
          }}>
            {match.team1_games}
          </span>
          <span style={{
            fontSize: "clamp(10px, 1.4vw, 16px)",
            fontWeight: 100,
            color: "rgba(255,255,255,0.20)",
          }}>
            —
          </span>
          <span style={{
            fontSize: "clamp(18px, 3vw, 36px)",
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.92)",
          }}>
            {match.team2_games}
          </span>
        </div>

        {/* Team 2 name + pips */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.3vh" }}>
          <span style={{
            fontSize: "clamp(11px, 1.6vw, 18px)",
            fontWeight: 900,
            lineHeight: 1,
            color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)",
            textShadow: isT2Winner ? "0 0 20px rgba(52,211,153,0.5)" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}>
            {match.team2.name}
          </span>
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "0.3vw" }}>
              {pipsT2.map((f, i) => <ScorePip key={i} filled={f} win={isT2Winner} />)}
            </div>
          )}
        </div>

        <Divider />

        {/* Mode + stage */}
        <div
          key={`stage-${stageKey}`}
          className="spl-ribbon-stage-slide"
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.6vw" }}
        >
          {stageData && (
            <div style={{
              width: "clamp(36px, 4.5vw, 56px)",
              height: "clamp(20px, 2.5vw, 32px)",
              borderRadius: "0.3vw",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.12)",
              flexShrink: 0,
            }}>
              <img
                src={stageData.image}
                alt={stageName ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15vh" }}>
            {modeData && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4vw" }}>
                <img
                  src={modeData.icon}
                  alt={modeData.name}
                  style={{ width: "clamp(9px, 1vw, 12px)", height: "clamp(9px, 1vw, 12px)", objectFit: "contain", opacity: 0.65 }}
                />
                <span style={{
                  fontSize: "clamp(7px, 0.8vw, 9px)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.40)",
                  lineHeight: 1,
                }}>
                  {modeData.name}
                </span>
              </div>
            )}
            <span style={{
              fontSize: "clamp(8px, 0.95vw, 11px)",
              fontWeight: 600,
              color: stageName ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.22)",
              fontStyle: stageName ? "normal" : "italic",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}>
              {stageName ?? "Counterpick pending…"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
