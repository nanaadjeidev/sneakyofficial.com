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
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl" style={{
      background: "rgba(6,6,16,0.72)",
      border: "1px solid rgba(255,255,255,0.06)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
    }}>
      <span className="text-[9px] font-black tracking-[0.3em] shrink-0 uppercase" style={{ color: "rgba(255,255,255,0.22)" }}>Other</span>
      <div className="w-px h-3 shrink-0" style={{ background: "rgba(255,255,255,0.10)" }} />
      <div className="flex-1 flex items-center gap-2 overflow-hidden transition-all duration-300"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(3px)" }}>
        <span className="text-[9px] uppercase tracking-wide shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>R{item.round}</span>
        <span className={`text-[11px] font-semibold truncate ${item.status === "complete" && item.winner === item.team1 ? "text-emerald-300" : "text-white/65"}`}>{item.team1}</span>
        <span className="text-[9px] shrink-0" style={{ color: "rgba(255,255,255,0.18)" }}>vs</span>
        <span className={`text-[11px] font-semibold truncate ${item.status === "complete" && item.winner === item.team2 ? "text-emerald-300" : "text-white/65"}`}>{item.team2}</span>
        {item.status === "complete" && item.winner && (
          <span className="text-[9px] shrink-0 ml-1" style={{ color: "rgba(52,211,153,0.55)" }}>· {item.winner} wins</span>
        )}
        {item.status === "pending" && <span className="text-[9px] shrink-0" style={{ color: "rgba(255,255,255,0.18)" }}>· upcoming</span>}
      </div>
      <div className="flex gap-0.5 shrink-0">
        {items.map((_, i) => (
          <div key={i} className={`rounded-full transition-all ${i === idx ? "bg-purple-400" : "bg-white/10"}`}
            style={{ width: i === idx ? 8 : 5, height: 5 }} />
        ))}
      </div>
    </div>
  );
}

// ── Individual game card (used in full overlay) ────────────────────────────────

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
      className="relative flex-1 rounded-2xl overflow-hidden flex flex-col"
      style={{
        border: isCurrent
          ? "1.5px solid rgba(239,68,68,0.55)"
          : isCompleted
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid rgba(255,255,255,0.06)",
        boxShadow: isCurrent ? "0 0 24px rgba(239,68,68,0.20), 0 4px 20px rgba(0,0,0,0.7)" : "0 4px 20px rgba(0,0,0,0.6)",
        opacity: isFuture && gameNum > currentGame + 1 ? 0.5 : 1,
      }}
    >
      {/* ── Background: map image or dark placeholder ── */}
      {stageData ? (
        <img
          src={stageData.image}
          alt={stageName ?? ""}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: isCompleted ? 0.55 : isCurrent ? 0.9 : 0.25 }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(8,8,20,0.95)" }} />
      )}

      {/* ── Gradient overlay: darken top + bottom ── */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, transparent 28%, transparent 52%, rgba(0,0,0,0.72) 100%)",
      }} />

      {/* ── Top bar: "Game N" + mode icon ── */}
      <div className="relative z-10 flex items-center justify-between px-2.5 pt-2.5 pb-1 shrink-0">
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
          style={{ background: "rgba(0,0,0,0.50)", backdropFilter: "blur(8px)" }}
        >
          <span
            className="text-[10px] font-black tracking-[0.18em] uppercase"
            style={{ color: isCurrent ? "rgba(239,68,68,0.95)" : isCompleted ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.28)" }}
          >
            G{gameNum}
          </span>
        </div>
        {modeData && (
          <img
            src={modeData.icon}
            alt={modeData.name}
            className="w-4 h-4 object-contain shrink-0"
            style={{
              opacity: isCurrent ? 0.85 : isCompleted ? 0.55 : 0.25,
              filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))",
            }}
          />
        )}
      </div>

      {/* ── Middle: ? placeholder when no stage selected ── */}
      {!stageData && (
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <span className="text-4xl font-thin" style={{ color: "rgba(255,255,255,0.12)" }}>?</span>
        </div>
      )}
      {stageData && <div className="flex-1" />}

      {/* ── Bottom: stage name + winner / LIVE ── */}
      <div className="relative z-10 flex flex-col items-center pb-2.5 px-2 gap-0.5 shrink-0">
        {/* Stage name */}
        <span
          className="text-[8px] font-medium truncate w-full text-center"
          style={{ color: "rgba(255,255,255,0.38)" }}
        >
          {stageName ?? (isCurrent ? "Counterpick pending…" : "—")}
        </span>

        {/* Winner overlay */}
        {isCompleted && winnerName && (
          <div className="flex flex-col items-center gap-0">
            <span className="text-[7px] font-bold tracking-[0.15em] uppercase" style={{ color: "rgba(255,255,255,0.40)" }}>
              won by
            </span>
            <span
              className="text-[11px] font-black leading-tight truncate w-full text-center"
              style={{
                color: winnerIsT1 ? "rgb(110,231,183)" : "rgb(129,140,248)",
                textShadow: winnerIsT1
                  ? "0 0 14px rgba(52,211,153,0.85)"
                  : "0 0 14px rgba(99,102,241,0.85)",
              }}
            >
              {winnerName}
            </span>
          </div>
        )}

        {/* Live indicator */}
        {isCurrent && (
          <div className="flex items-center gap-1.5">
            <div className="relative w-2 h-2 shrink-0">
              <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
              <div className="absolute inset-0 rounded-full bg-red-500" />
            </div>
            <span className="text-[9px] font-black tracking-[0.3em] uppercase" style={{ color: "rgba(239,68,68,0.95)" }}>
              LIVE
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Full overlay (800 × 600) ───────────────────────────────────────────────────
// Layout: compact score header → hero game cards → ticker

function FullMatchOverlay({ match, scoreFlash }: {
  match: OverlayMatchData;
  scoreFlash: boolean;
}) {
  const bestOf      = match.best_of ?? 1;
  const winsNeeded  = Math.ceil(bestOf / 2);
  const currentGame = match.team1_games + match.team2_games + 1;

  const modeData   = match.mode_name ? MODES.find((m) => m.name === match.mode_name) : null;
  const roundLabel = getRoundLabel(match.round, match.total_rounds);

  const isComplete = match.status === "complete";
  const isT1Winner = isComplete && match.team1_games > match.team2_games;
  const isT2Winner = isComplete && match.team2_games > match.team1_games;
  const isLive     = !isComplete && match.status !== "awaiting_confirmation";

  const pipsT1 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team1_games) : [];
  const pipsT2 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team2_games) : [];

  return (
    <div
      data-overlay
      style={{ width: 800, height: 600, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {/* ── Score header ── */}
      <div
        className="shrink-0 flex items-center gap-3 px-5"
        style={{
          height: 52,
          background: "rgba(6,6,18,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Tournament + round meta */}
        <span className="text-[9px] font-bold tracking-[0.22em] text-white/35 uppercase shrink-0">
          {match.tournament_name}
        </span>
        <span className="text-white/15 shrink-0">·</span>
        <span className="text-[9px] font-bold tracking-[0.22em] text-white/35 uppercase shrink-0">
          {roundLabel}
        </span>
        {bestOf > 1 && (
          <><span className="text-white/15 shrink-0">·</span>
          <span className="text-[9px] font-bold text-white/30 uppercase shrink-0">BO{bestOf}</span></>
        )}
        {modeData && (
          <><span className="text-white/15 shrink-0">·</span>
          <img src={modeData.icon} alt={modeData.name} className="w-3.5 h-3.5 object-contain shrink-0" style={{ opacity: 0.50 }} />
          <span className="text-[9px] font-bold text-white/30 uppercase shrink-0">{modeData.name}</span></>
        )}

        <div className="flex-1" />

        {/* Teams + score (compact, right-aligned) */}
        <div className={`flex items-center gap-2.5 transition-transform duration-300 ${scoreFlash ? "scale-105" : "scale-100"}`}>
          {/* Team 1 */}
          <span
            className="text-[13px] font-black truncate max-w-[110px]"
            style={{ color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.85)" }}
          >
            {match.team1.name}
          </span>

          {bestOf > 1 && (
            <div className="flex gap-0.5 flex-row-reverse">
              {pipsT1.map((f, i) => <ScorePip key={i} filled={f} win={isT1Winner} />)}
            </div>
          )}

          {/* Score numbers */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[20px] font-black tabular-nums leading-none"
              style={{ color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.88)" }}>
              {match.team1_games}
            </span>
            <span className="font-thin" style={{ color: "rgba(255,255,255,0.18)" }}>—</span>
            <span className="text-[20px] font-black tabular-nums leading-none"
              style={{ color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.88)" }}>
              {match.team2_games}
            </span>
          </div>

          {bestOf > 1 && (
            <div className="flex gap-0.5">
              {pipsT2.map((f, i) => <ScorePip key={i} filled={f} win={isT2Winner} />)}
            </div>
          )}

          {/* Team 2 */}
          <span
            className="text-[13px] font-black truncate max-w-[110px]"
            style={{ color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.85)" }}
          >
            {match.team2.name}
          </span>
        </div>

        {/* Live dot */}
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {isLive && (
            <div className="relative w-2 h-2 shrink-0">
              <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
              <div className="absolute inset-0 rounded-full bg-red-500" />
            </div>
          )}
          <span
            className="text-[9px] font-black tracking-[0.28em] uppercase"
            style={{ color: isLive ? "rgba(239,68,68,0.9)" : "rgba(255,255,255,0.28)" }}
          >
            {isLive ? "LIVE" : isComplete ? "COMPLETE" : "CONFIRMING"}
          </span>
        </div>
      </div>

      {/* ── Game cards: hero section ── */}
      <div className="flex-1 flex gap-2 px-5 py-4">
        {Array.from({ length: bestOf }, (_, i) => i + 1).map((gameNum) => (
          <GameCard
            key={gameNum}
            gameNum={gameNum}
            match={match}
            modeData={modeData}
            currentGame={currentGame}
            isMatchOver={isComplete}
          />
        ))}
      </div>

      {/* ── Ticker ── */}
      <div className="shrink-0 px-5 pb-3">
        <MatchTicker pinnedId={match.match_id} />
      </div>
    </div>
  );
}

// ── Corner overlay (~360px wide) ──────────────────────────────────────────────
// Header row: meta + map thumbnail
// Score row: team1 | pips + score + pips | team2 (no overlap)
// Live indicator clearly separated

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
      <div data-overlay style={{ width: 800, height: 600 }} className="flex items-center justify-center">
        <p className="text-white/20 text-xs font-bold tracking-[0.35em] uppercase">No match pinned</p>
      </div>
    );
  }

  if (style === "corner") {
    return <CornerMatchOverlay match={match} scoreFlash={scoreFlash} stageKey={stageKey} />;
  }

  return <FullMatchOverlay match={match} scoreFlash={scoreFlash} />;
}
