import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { MODES, STAGES } from "../../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

function useQueryParam(key: string) {
  return new URLSearchParams(window.location.search).get(key);
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
  if (round === total - 1 && total > 2) return "SEMI-FINALS";
  return `ROUND ${round}`;
}

function ScorePip({ filled, win }: { filled: boolean; win: boolean }) {
  return (
    <div className={`w-2 h-2 rounded-full border transition-all duration-500 ${
      filled
        ? win
          ? "bg-emerald-400 border-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
          : "bg-red-400 border-red-300"
        : "bg-transparent border-white/20"
    }`} />
  );
}

// ── Inject CSS keyframes for map card entry animation ──────────────────────────

function useMapEnterKeyframes() {
  useEffect(() => {
    const id = "spl-map-enter-kf";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes splMapEnter {
        from { opacity: 0; transform: translateY(8%) scale(0.93); }
        to   { opacity: 1; transform: translateY(0)   scale(1);   }
      }
      .spl-map-enter { animation: splMapEnter 0.55s cubic-bezier(0.22,1,0.36,1) both; }
    `;
    document.head.appendChild(el);
  }, []);
}

// ── Track per-game stage versions to re-key cards on new stage assignment ──────

function useGameStageVersions(games: GameMap[]) {
  const [versions, setVersions] = useState<Record<number, number>>({});
  const prevStagesRef = useRef<Record<number, string | null>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      games.forEach(g => { prevStagesRef.current[g.game_number] = g.stage_name; });
      return;
    }
    let changed = false;
    const updates: Record<number, number> = {};
    games.forEach(g => {
      const prev = prevStagesRef.current[g.game_number] ?? null;
      if (g.stage_name && g.stage_name !== prev) {
        changed = true;
        updates[g.game_number] = 1;
      }
      prevStagesRef.current[g.game_number] = g.stage_name;
    });
    if (changed) {
      setVersions(v => {
        const next = { ...v };
        Object.keys(updates).forEach(k => {
          const gn = Number(k);
          next[gn] = (v[gn] ?? 0) + 1;
        });
        return next;
      });
    }
  }, [games]);

  return versions;
}

// ── Shared data hook ───────────────────────────────────────────────────────────

function useMatchData() {
  const [match, setMatch] = useState<OverlayMatchData | null>(null);
  const [scoreFlash, setScoreFlash] = useState(false);
  const scoreRef = useRef<[number, number]>([0, 0]);
  const [stageKey, setStageKey] = useState(0);

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
      setTimeout(() => setScoreFlash(false), 700);
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

// ── Ticker ─────────────────────────────────────────────────────────────────────

interface TickerMatch { id: number; round: number; team1: string; team2: string; status: string; winner?: string | null }

function MatchTicker({ pinnedId }: { pinnedId: number }) {
  const [items, setItems] = useState<TickerMatch[]>([]);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament`, { params: { guild_id: GUILD_ID } });
      const all: TickerMatch[] = (data.rounds ?? []).flatMap((r: { round: number; matches: { id: number; team1?: { name: string; id?: number } | null; team2?: { name: string; id?: number } | null; status: string; winner_id?: number | null }[] }) =>
        r.matches
          .filter((m) => m.id !== pinnedId && m.team1 && m.team2)
          .map((m) => ({
            id: m.id, round: r.round,
            team1: m.team1?.name ?? "TBD", team2: m.team2?.name ?? "TBD",
            status: m.status,
            winner: m.winner_id == null ? null : (m.winner_id === m.team1?.id ? m.team1?.name : m.team2?.name),
          }))
      );
      setItems(all);
    } catch { /* ignore */ }
  }, [pinnedId]);

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 20_000);
    return () => clearInterval(id);
  }, [fetchItems]);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx((i) => (i + 1) % items.length); setVisible(true); }, 350);
    }, 4500);
    return () => clearInterval(t);
  }, [items.length]);

  if (items.length === 0) return null;
  const item = items[idx];

  return (
    <div className="flex items-center gap-3 rounded-xl" style={{
      padding: "1.4vh 2vw",
      background: "rgba(6,6,16,0.72)",
      border: "1px solid rgba(255,255,255,0.06)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
    }}>
      <span style={{ fontSize: "clamp(8px, 1.1vw, 11px)", fontWeight: 900, letterSpacing: "0.3em", flexShrink: 0, textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>Other</span>
      <div className="w-px shrink-0" style={{ height: "clamp(12px, 1.8vh, 18px)", background: "rgba(255,255,255,0.10)" }} />
      <div className="flex-1 flex items-center gap-2 overflow-hidden transition-all duration-300"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(3px)" }}>
        <span style={{ fontSize: "clamp(8px, 1.1vw, 11px)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0, color: "rgba(255,255,255,0.28)" }}>R{item.round}</span>
        <span className={`font-semibold truncate ${item.status === "complete" && item.winner === item.team1 ? "text-emerald-300" : "text-white/65"}`} style={{ fontSize: "clamp(10px, 1.4vw, 14px)" }}>{item.team1}</span>
        <span style={{ fontSize: "clamp(8px, 1.1vw, 11px)", flexShrink: 0, color: "rgba(255,255,255,0.18)" }}>vs</span>
        <span className={`font-semibold truncate ${item.status === "complete" && item.winner === item.team2 ? "text-emerald-300" : "text-white/65"}`} style={{ fontSize: "clamp(10px, 1.4vw, 14px)" }}>{item.team2}</span>
        {item.status === "complete" && item.winner && (
          <span className="shrink-0 ml-1" style={{ fontSize: "clamp(8px, 1.1vw, 11px)", color: "rgba(52,211,153,0.55)" }}>· {item.winner} wins</span>
        )}
        {item.status === "pending" && <span className="shrink-0" style={{ fontSize: "clamp(8px, 1.1vw, 11px)", color: "rgba(255,255,255,0.18)" }}>· upcoming</span>}
      </div>
      <div className="flex gap-1 shrink-0">
        {items.map((_, i) => (
          <div key={i} className={`rounded-full transition-all ${i === idx ? "bg-purple-400" : "bg-white/10"}`}
            style={{ width: i === idx ? 10 : 6, height: 6 }} />
        ))}
      </div>
    </div>
  );
}

// ── Game card ──────────────────────────────────────────────────────────────────
// Designed to fill its flex slot in the card row.
// Winner shown large in the centre. Entry animation via .spl-map-enter on remount.

function GameCard({
  gameNum, match, modeData, currentGame, isMatchOver,
}: {
  gameNum: number;
  match: OverlayMatchData;
  modeData: { icon: string; name: string } | null | undefined;
  currentGame: number;
  isMatchOver: boolean;
}) {
  const gameMap   = match.games.find((g) => g.game_number === gameNum);
  const stageName = gameMap?.stage_name ?? null;
  const stageData = stageName ? STAGES.find((s) => s.name === stageName) : null;
  const result    = match.game_results.find((r) => r.game_number === gameNum);

  const isCompleted = !!result;
  const isCurrent   = !isCompleted && gameNum === currentGame && !isMatchOver;
  const isFuture    = !isCompleted && !isCurrent;
  const winnerName  = result ? (result.winner === 1 ? match.team1.name : match.team2.name) : null;
  const winnerIsT1  = result?.winner === 1;

  return (
    <div
      className="spl-map-enter relative flex-1 rounded-xl overflow-hidden flex flex-col"
      style={{
        border: isCurrent
          ? "1.5px solid rgba(239,68,68,0.58)"
          : isCompleted
          ? "1px solid rgba(255,255,255,0.13)"
          : "1px solid rgba(255,255,255,0.05)",
        boxShadow: isCurrent
          ? "0 0 28px rgba(239,68,68,0.22), 0 4px 20px rgba(0,0,0,0.7)"
          : "0 4px 20px rgba(0,0,0,0.6)",
        opacity: isFuture && gameNum > currentGame + 1 ? 0.42 : 1,
        minWidth: 0,
      }}
    >
      {/* Background map image */}
      {stageData ? (
        <img
          src={stageData.image}
          alt={stageName ?? ""}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: isCompleted ? 0.52 : isCurrent ? 0.92 : 0.32 }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(8,8,20,0.95)" }} />
      )}

      {/* Gradient scrim — darken top + bottom, leave centre clear */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 28%, transparent 58%, rgba(0,0,0,0.80) 100%)",
      }} />

      {/* Top: game label + live dot */}
      <div className="relative z-10 flex items-center justify-between shrink-0" style={{ padding: "4% 5% 0" }}>
        <span style={{
          fontSize: "clamp(8px, 1.6vw, 14px)",
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: isCurrent ? "rgba(239,68,68,0.95)" : isCompleted ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.22)",
        }}>
          G{gameNum}
        </span>
        {isCurrent && (
          <div className="relative shrink-0" style={{ width: "clamp(6px, 1vw, 9px)", height: "clamp(6px, 1vw, 9px)" }}>
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
            <div className="absolute inset-0 rounded-full bg-red-500" />
          </div>
        )}
        {modeData && !isCurrent && (
          <img
            src={modeData.icon}
            alt={modeData.name}
            style={{
              width: "clamp(10px, 1.4vw, 14px)",
              height: "clamp(10px, 1.4vw, 14px)",
              objectFit: "contain",
              opacity: isCompleted ? 0.45 : 0.22,
              filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))",
            }}
          />
        )}
      </div>

      {/* Centre: winner (large) / LIVE / ? */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center" style={{ padding: "0 6%" }}>
        {isCompleted && winnerName ? (
          <div className="flex flex-col items-center gap-[2%] text-center w-full">
            <span style={{
              fontSize: "clamp(6px, 0.9vw, 9px)",
              fontWeight: 700,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.38)",
            }}>
              WON BY
            </span>
            <span style={{
              fontSize: "clamp(11px, 2.5vw, 22px)",
              fontWeight: 900,
              lineHeight: 1.1,
              color: winnerIsT1 ? "rgb(110,231,183)" : "rgb(129,140,248)",
              textShadow: winnerIsT1
                ? "0 0 22px rgba(52,211,153,0.95), 0 2px 8px rgba(0,0,0,0.9)"
                : "0 0 22px rgba(99,102,241,0.95), 0 2px 8px rgba(0,0,0,0.9)",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {winnerName}
            </span>
          </div>
        ) : isCurrent ? (
          <span style={{
            fontSize: "clamp(8px, 1.7vw, 15px)",
            fontWeight: 900,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: "rgba(239,68,68,0.85)",
          }}>
            LIVE
          </span>
        ) : !stageData ? (
          <span style={{
            fontSize: "clamp(18px, 3.8vw, 34px)",
            fontWeight: 100,
            color: "rgba(255,255,255,0.10)",
          }}>
            ?
          </span>
        ) : null}
      </div>

      {/* Bottom: stage name */}
      <div className="relative z-10 shrink-0 text-center" style={{ padding: "0 5% 4%" }}>
        <span style={{
          display: "block",
          fontSize: "clamp(6px, 0.85vw, 8px)",
          fontWeight: 500,
          color: "rgba(255,255,255,0.32)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {stageName ?? (isCurrent ? "Counterpick pending…" : "—")}
        </span>
      </div>
    </div>
  );
}

// ── Full overlay ───────────────────────────────────────────────────────────────
// Fluid layout: fills 100% × 100% of whatever the browser source is set to.
// Designed for 4:3 aspect ratio. All sizing uses vw/vh/clamp so it scales.

function FullMatchOverlay({ match, scoreFlash }: {
  match: OverlayMatchData;
  scoreFlash: boolean;
}) {
  useMapEnterKeyframes();

  const bestOf      = match.best_of ?? 1;
  const winsNeeded  = Math.ceil(bestOf / 2);
  const currentGame = match.team1_games + match.team2_games + 1;
  const modeData    = match.mode_name ? MODES.find((m) => m.name === match.mode_name) : null;
  const roundLabel  = getRoundLabel(match.round, match.total_rounds);

  const isComplete = match.status === "complete";
  const isT1Winner = isComplete && match.team1_games > match.team2_games;
  const isT2Winner = isComplete && match.team2_games > match.team1_games;
  const isLive     = !isComplete && match.status !== "awaiting_confirmation";

  const pipsT1 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team1_games) : [];
  const pipsT2 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team2_games) : [];

  // Stage for current game (shown in header footer row)
  const currentGameMap  = match.games.find((g) => g.game_number === currentGame);
  const currentStage    = match.stage_name ?? currentGameMap?.stage_name ?? null;

  // Per-game versions — when a stage is newly assigned the card re-keys and re-animates
  const stageVersions = useGameStageVersions(match.games);

  return (
    <div
      data-overlay
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── HEADER: prominent team names, big score, mode ── ~27% height */}
      <div
        style={{
          flex: "0 0 27%",
          background: "rgba(6,6,18,0.93)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "1.2vh 4vw 1.2vh",
          boxSizing: "border-box",
        }}
      >
        {/* Row 1: meta info + live status */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.8vw", flexWrap: "nowrap" }}>
          <span style={{
            fontSize: "clamp(7px, 1.05vw, 10px)",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.30)",
            whiteSpace: "nowrap",
          }}>
            {match.tournament_name}
          </span>
          <span style={{ color: "rgba(255,255,255,0.13)" }}>·</span>
          <span style={{
            fontSize: "clamp(7px, 1.05vw, 10px)",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.30)",
            whiteSpace: "nowrap",
          }}>
            {roundLabel}
          </span>
          {bestOf > 1 && (
            <>
              <span style={{ color: "rgba(255,255,255,0.13)" }}>·</span>
              <span style={{
                fontSize: "clamp(7px, 1.05vw, 10px)",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.24)",
              }}>
                BO{bestOf}
              </span>
            </>
          )}
          <div style={{ flex: 1 }} />
          {/* Live indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5vw", flexShrink: 0 }}>
            {isLive && (
              <div style={{ position: "relative", width: "clamp(5px, 0.75vw, 8px)", height: "clamp(5px, 0.75vw, 8px)", flexShrink: 0 }}>
                <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
                <div className="absolute inset-0 rounded-full bg-red-500" />
              </div>
            )}
            <span style={{
              fontSize: "clamp(7px, 1.05vw, 10px)",
              fontWeight: 900,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: isLive ? "rgba(239,68,68,0.9)" : "rgba(255,255,255,0.28)",
            }}>
              {isLive ? "LIVE" : isComplete ? "COMPLETE" : "CONFIRMING"}
            </span>
          </div>
        </div>

        {/* Row 2: big team names + massive score */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2vw",
            transform: scoreFlash ? "scale(1.015)" : "scale(1)",
            transition: "transform 0.3s ease",
          }}
        >
          {/* Team 1 — right-aligned, fills available space */}
          <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
            <span style={{
              display: "block",
              fontSize: "clamp(14px, 4vw, 38px)",
              fontWeight: 900,
              lineHeight: 1,
              color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)",
              textShadow: isT1Winner ? "0 0 28px rgba(52,211,153,0.50)" : "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {match.team1.name}
            </span>
          </div>

          {/* Score */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "1.2vw" }}>
            <span style={{
              fontSize: "clamp(22px, 7.5vw, 68px)",
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)",
            }}>
              {match.team1_games}
            </span>
            <span style={{
              fontSize: "clamp(12px, 2.5vw, 24px)",
              fontWeight: 100,
              color: "rgba(255,255,255,0.18)",
            }}>
              —
            </span>
            <span style={{
              fontSize: "clamp(22px, 7.5vw, 68px)",
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)",
            }}>
              {match.team2_games}
            </span>
          </div>

          {/* Team 2 — left-aligned */}
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <span style={{
              display: "block",
              fontSize: "clamp(14px, 4vw, 38px)",
              fontWeight: 900,
              lineHeight: 1,
              color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)",
              textShadow: isT2Winner ? "0 0 28px rgba(52,211,153,0.50)" : "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {match.team2.name}
            </span>
          </div>
        </div>

        {/* Row 3: pips + mode + current map */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
          {/* T1 pips */}
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "0.4vw", flexDirection: "row-reverse", flexShrink: 0 }}>
              {pipsT1.map((f, i) => <ScorePip key={i} filled={f} win={isT1Winner} />)}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Mode + current stage */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.7vw", flexShrink: 0 }}>
            {modeData && (
              <>
                <img
                  src={modeData.icon}
                  alt={modeData.name}
                  style={{ width: "clamp(12px, 1.9vw, 18px)", height: "clamp(12px, 1.9vw, 18px)", objectFit: "contain", opacity: 0.65 }}
                />
                <span style={{
                  fontSize: "clamp(7px, 1.1vw, 11px)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.42)",
                }}>
                  {modeData.name}
                </span>
              </>
            )}
            {currentStage && (
              <>
                <span style={{ color: "rgba(255,255,255,0.14)" }}>·</span>
                <span style={{
                  fontSize: "clamp(7px, 1.1vw, 11px)",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.30)",
                }}>
                  {currentStage}
                </span>
              </>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* T2 pips */}
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "0.4vw", flexShrink: 0 }}>
              {pipsT2.map((f, i) => <ScorePip key={i} filled={f} win={isT2Winner} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── GAME CARDS ── fill remaining space */}
      <div style={{
        flex: 1,
        display: "flex",
        gap: "1vw",
        padding: "1.8vh 3vw 1.2vh",
        boxSizing: "border-box",
        minHeight: 0,
      }}>
        {Array.from({ length: bestOf }, (_, i) => i + 1).map((gameNum) => (
          <GameCard
            key={`${gameNum}-${stageVersions[gameNum] ?? 0}`}
            gameNum={gameNum}
            match={match}
            modeData={modeData}
            currentGame={currentGame}
            isMatchOver={isComplete}
          />
        ))}
      </div>

      {/* ── TICKER ── */}
      <div style={{ flexShrink: 0, padding: "0 3vw 1.5vh" }}>
        <MatchTicker pinnedId={match.match_id} />
      </div>
    </div>
  );
}

// ── Corner overlay (~360px wide) ──────────────────────────────────────────────

function CornerMatchOverlay({ match, scoreFlash, stageKey }: {
  match: OverlayMatchData;
  scoreFlash: boolean;
  stageKey: number;
}) {
  const bestOf     = match.best_of ?? 1;
  const winsNeeded = Math.ceil(bestOf / 2);
  const currentGame = match.team1_games + match.team2_games + 1;
  const games      = match.games ?? [];
  const curGameMap = games.find((g) => g.game_number === currentGame);
  const stageName  = match.stage_name ?? curGameMap?.stage_name ?? null;

  const modeData  = match.mode_name ? MODES.find((m) => m.name === match.mode_name) : null;
  const stageData = stageName       ? STAGES.find((s) => s.name === stageName)       : null;
  const roundLabel = getRoundLabel(match.round, match.total_rounds);

  const isComplete  = match.status === "complete";
  const isT1Winner  = isComplete && match.team1_games > match.team2_games;
  const isT2Winner  = isComplete && match.team2_games > match.team1_games;
  const isLive      = !isComplete && match.status !== "awaiting_confirmation";

  const pipsT1 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team1_games) : [];
  const pipsT2 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team2_games) : [];

  return (
    <div data-overlay className="p-3" style={{ width: 360 }}>
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, rgba(10,10,24,0.90) 0%, rgba(7,7,18,0.87) 100%)",
          border: "1px solid rgba(255,255,255,0.09)",
          backdropFilter: "blur(28px) saturate(150%)",
          WebkitBackdropFilter: "blur(28px) saturate(150%)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07)",
        }}
      >
        {/* Stage art bleed */}
        {stageData && (
          <div key={`corner-bg-${stageKey}`} className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
            <img src={stageData.image} alt="" className="w-full h-full object-cover" style={{ opacity: 0.06 }} />
          </div>
        )}

        <div className="relative">
          {/* ── Row 1: meta + map thumbnail ── */}
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            {/* Meta text */}
            <div className="flex-1 flex items-center gap-1.5 min-w-0 overflow-hidden">
              <span className="text-[9px] font-bold tracking-[0.18em] text-white/28 uppercase truncate">
                {match.tournament_name}
              </span>
              <span className="text-white/15 shrink-0">·</span>
              <span className="text-[9px] font-bold tracking-[0.18em] text-white/28 uppercase shrink-0">
                {roundLabel}
              </span>
              {bestOf > 1 && (
                <><span className="text-white/15 shrink-0">·</span>
                <span className="text-[9px] font-bold text-white/22 uppercase shrink-0">BO{bestOf}</span></>
              )}
              {modeData && (
                <img src={modeData.icon} alt={modeData.name}
                  className="w-3 h-3 object-contain shrink-0" style={{ opacity: 0.40 }} />
              )}
            </div>

            {/* Current map thumbnail */}
            {stageData ? (
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <div
                  className="rounded-md overflow-hidden"
                  style={{
                    width: 60, height: 34,
                    border: "1px solid rgba(255,255,255,0.14)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.55)",
                  }}
                >
                  <img
                    key={`thumb-${stageKey}`}
                    src={stageData.image}
                    alt={stageName ?? ""}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[7px] text-white/32 font-medium truncate" style={{ maxWidth: 60 }}>
                  {stageName}
                </span>
              </div>
            ) : match.mode_name ? (
              <div
                className="shrink-0 rounded-md flex items-center justify-center"
                style={{ width: 60, height: 34, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <span className="text-white/18 text-sm font-thin">?</span>
              </div>
            ) : null}
          </div>

          {/* ── Row 2: live dot + team names on separate lines ── */}
          <div className="px-3 pt-2.5 pb-1">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 mb-2">
              {isLive ? (
                <>
                  <div className="relative w-2 h-2 shrink-0">
                    <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
                    <div className="absolute inset-0 rounded-full bg-red-500" />
                  </div>
                  <span className="text-[9px] font-black tracking-[0.3em] uppercase" style={{ color: "rgba(239,68,68,0.95)" }}>
                    LIVE
                  </span>
                </>
              ) : (
                <span className="text-[9px] font-black tracking-[0.3em] uppercase text-white/25">
                  {isComplete ? "COMPLETE" : "CONFIRMING"}
                </span>
              )}
            </div>

            {/* Teams row — fixed columns so score never touches names */}
            <div className="flex items-center" style={{ gap: 0 }}>
              {/* Team 1 name — left-aligned, fixed width */}
              <div style={{ width: 98, minWidth: 0 }}>
                <span
                  className="block text-[14px] font-black leading-tight truncate"
                  style={isT1Winner
                    ? { color: "rgb(110,231,183)", textShadow: "0 0 14px rgba(52,211,153,0.4)" }
                    : { color: "rgba(255,255,255,0.90)" }}
                >
                  {match.team1.name}
                </span>
              </div>

              {/* Centre: pips + score + pips — fixed width, centred */}
              <div
                className={`flex flex-col items-center transition-transform duration-300 ${scoreFlash ? "scale-110" : "scale-100"}`}
                style={{ flex: "0 0 120px" }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[22px] font-black tabular-nums leading-none"
                    style={{ color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.88)" }}
                  >
                    {match.team1_games}
                  </span>
                  <span className="text-base font-thin" style={{ color: "rgba(255,255,255,0.18)" }}>—</span>
                  <span
                    className="text-[22px] font-black tabular-nums leading-none"
                    style={{ color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.88)" }}
                  >
                    {match.team2_games}
                  </span>
                </div>

                {bestOf > 1 && (
                  <div className="flex items-center gap-1 mt-1">
                    <div className="flex gap-0.5 flex-row-reverse">
                      {pipsT1.map((f, i) => <ScorePip key={i} filled={f} win={isT1Winner} />)}
                    </div>
                    <div className="flex gap-0.5">
                      {pipsT2.map((f, i) => <ScorePip key={i} filled={f} win={isT2Winner} />)}
                    </div>
                  </div>
                )}
              </div>

              {/* Team 2 name — right-aligned, fixed width */}
              <div style={{ width: 98, minWidth: 0, textAlign: "right" }}>
                <span
                  className="block text-[14px] font-black leading-tight truncate"
                  style={isT2Winner
                    ? { color: "rgb(110,231,183)", textShadow: "0 0 14px rgba(52,211,153,0.4)" }
                    : { color: "rgba(255,255,255,0.90)" }}
                >
                  {match.team2.name}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom rule */}
          <div className="mx-3 mb-3 h-px" style={{
            background: "linear-gradient(to right, transparent, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.06) 60%, transparent)"
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Root export ────────────────────────────────────────────────────────────────

export default function OverlayMatch() {
  const style = useQueryParam("style") ?? "full";

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const { match, scoreFlash, stageKey } = useMatchData();

  if (!match) {
    if (style === "corner") {
      return (
        <div data-overlay style={{ width: 360 }} className="p-3">
          <div className="rounded-2xl flex items-center justify-center px-4 py-3"
            style={{ background: "rgba(6,6,16,0.72)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(20px)" }}>
            <p className="text-white/20 text-[10px] font-bold tracking-[0.3em] uppercase">No match pinned</p>
          </div>
        </div>
      );
    }
    return (
      <div data-overlay style={{ width: "100%", height: "100%" }} className="flex items-center justify-center">
        <p className="text-white/20 text-xs font-bold tracking-[0.35em] uppercase">No match pinned</p>
      </div>
    );
  }

  if (style === "corner") {
    return <CornerMatchOverlay match={match} scoreFlash={scoreFlash} stageKey={stageKey} />;
  }

  return <FullMatchOverlay match={match} scoreFlash={scoreFlash} />;
}
