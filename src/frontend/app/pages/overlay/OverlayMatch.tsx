import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { MODES, STAGES } from "../../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Team {
  id: number;
  name: string;
  members: string[];
}

interface GameMap {
  game_number: number;
  stage_name: string | null;
}

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
}

function getRoundLabel(round: number, total: number): string {
  if (round === total) return "FINAL";
  if (round === total - 1 && total > 2) return "SEMI-FINALS";
  return `ROUND ${round}`;
}

function ScorePip({ filled, win }: { filled: boolean; win: boolean }) {
  return (
    <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all duration-500 ${
      filled
        ? win
          ? "bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
          : "bg-red-400 border-red-300 shadow-[0_0_6px_rgba(248,113,113,0.7)]"
        : "bg-transparent border-white/20"
    }`} />
  );
}

export default function OverlayMatch() {
  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const [match, setMatch] = useState<OverlayMatchData | null>(null);
  const [scoreFlash, setScoreFlash] = useState(false);
  const scoreRef = useRef<[number, number]>([0, 0]);
  const [stageKey, setStageKey] = useState(0);

  const fetchMatch = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay`, {
        params: { guild_id: GUILD_ID },
      });
      setMatch(data.match ?? null);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchMatch(); }, []);

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
          if (msg.event === "match_pinned" || msg.event === "match_complete" || msg.event === "match_reported") {
            fetchMatch();
          } else if (msg.event === "game_score") {
            setMatch((prev) => {
              if (!prev || prev.match_id !== msg.match_id) return prev;
              return { ...prev, team1_games: msg.team1_games ?? 0, team2_games: msg.team2_games ?? 0 };
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
  }, []);

  // ── Canvas: 800 × 600 ──────────────────────────────────────────────────────

  if (!match) {
    return (
      <div data-overlay style={{ width: 800, height: 600 }} className="relative flex items-end pb-16 justify-center">
        <p className="text-white/20 text-xs font-bold tracking-[0.35em] uppercase">No match pinned</p>
      </div>
    );
  }

  const bestOf      = match.best_of ?? 1;
  const winsNeeded  = Math.ceil(bestOf / 2);
  const currentGame = match.team1_games + match.team2_games + 1;
  const games       = match.games ?? [];
  const curGameMap  = games.find((g) => g.game_number === currentGame);
  const stageName   = match.stage_name ?? curGameMap?.stage_name ?? null;

  const modeData  = match.mode_name  ? MODES.find((m) => m.name === match.mode_name)  : null;
  const stageData = stageName        ? STAGES.find((s) => s.name === stageName)        : null;
  const roundLabel = getRoundLabel(match.round, match.total_rounds);

  const isComplete  = match.status === "complete";
  const isT1Winner  = isComplete && match.team1_games > match.team2_games;
  const isT2Winner  = isComplete && match.team2_games > match.team1_games;
  const statusLabel = match.status === "awaiting_confirmation" ? "CONFIRMING" : isComplete ? "COMPLETE" : "LIVE";

  const pipsT1 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team1_games) : [];
  const pipsT2 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team2_games) : [];

  const showScore = bestOf > 1 || match.team1_games > 0 || match.team2_games > 0;

  return (
    <div data-overlay style={{ width: 800, height: 600, position: "relative", overflow: "hidden" }}>

      {/* ── Full-canvas stage art ─────────────────────────────────────────── */}
      {stageData ? (
        <div key={`bg-${stageKey}`} className="absolute inset-0 stage-bg-enter pointer-events-none">
          <img
            src={stageData.image}
            alt=""
            className="w-full h-full object-cover"
            style={{ transform: "scale(1.06)", opacity: 0.22 }}
          />
          {/* Transparent top → dark bottom gradient */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to bottom, transparent 0%, transparent 25%, rgba(4,4,14,0.55) 55%, rgba(4,4,14,0.92) 78%, rgba(4,4,14,0.98) 100%)"
          }} />
          {/* Subtle left/right vignette */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to right, rgba(4,4,14,0.4) 0%, transparent 18%, transparent 82%, rgba(4,4,14,0.4) 100%)"
          }} />
        </div>
      ) : (
        /* Fallback dark gradient when no stage is set */
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(4,4,14,0.7) 60%, rgba(4,4,14,0.96) 85%)"
        }} />
      )}

      {/* ── Match card ────────────────────────────────────────────────────── */}
      <div className="absolute left-5 right-5" style={{ bottom: 56 }}>
        <div style={{
          background: "linear-gradient(160deg, rgba(12,12,28,0.80) 0%, rgba(8,8,20,0.76) 100%)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 18,
          backdropFilter: "blur(32px) saturate(160%)",
          WebkitBackdropFilter: "blur(32px) saturate(160%)",
          boxShadow: "0 20px 70px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.2)",
          overflow: "hidden",
          position: "relative",
        }}>

          {/* Stage art bleed inside card */}
          {stageData && (
            <div key={`card-bg-${stageKey}`} className="absolute inset-0 pointer-events-none stage-bg-enter">
              <img src={stageData.image} alt="" className="w-full h-full object-cover" style={{ opacity: 0.06 }} />
            </div>
          )}

          <div style={{ position: "relative", zIndex: 10 }}>

            {/* Meta bar */}
            <div className="flex items-center justify-center gap-2 px-6 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-[10px] font-bold tracking-[0.25em] text-white/35 uppercase">{match.tournament_name}</span>
              <span className="text-white/15">·</span>
              <span className="text-[10px] font-bold tracking-[0.25em] text-white/35 uppercase">{roundLabel}</span>
              {bestOf > 1 && (
                <><span className="text-white/15">·</span><span className="text-[10px] font-bold text-white/35 uppercase">BO{bestOf}</span></>
              )}
              {modeData && (
                <><span className="text-white/15">·</span>
                <img src={modeData.icon} alt={modeData.name} className="w-3.5 h-3.5 object-contain" style={{ opacity: 0.55 }} />
                <span className="text-[10px] font-bold text-white/35 uppercase tracking-wide">{modeData.name}</span></>
              )}
              {stageName ? (
                <><span className="text-white/15">·</span>
                <span key={`stage-${stageKey}`} className="text-[10px] font-bold uppercase tracking-wide stage-name-enter" style={{ color: "rgba(255,255,255,0.62)" }}>
                  {stageName}
                </span></>
              ) : match.mode_name ? (
                <><span className="text-white/15">·</span>
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,190,60,0.65)" }}>?</span></>
              ) : null}
            </div>

            {/* Teams + score */}
            <div className="flex items-center px-8 py-5 gap-6">

              {/* Team 1 */}
              <div className="flex-1 min-w-0">
                <div
                  className="text-[26px] font-black tracking-tight leading-none truncate transition-all duration-300"
                  style={isT1Winner
                    ? { color: "rgb(110,231,183)", textShadow: "0 0 24px rgba(52,211,153,0.45)" }
                    : { color: "rgba(255,255,255,0.92)" }}
                >
                  {match.team1.name}
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  {match.team1.members.map((name) => (
                    <span key={name} className="text-[11px] font-medium leading-tight" style={{ color: "rgba(255,255,255,0.38)" }}>{name}</span>
                  ))}
                </div>
              </div>

              {/* Score centrepiece */}
              <div className="shrink-0 flex flex-col items-center">
                {showScore ? (
                  <div className={`flex items-center gap-3.5 transition-transform duration-300 ${scoreFlash ? "scale-110" : "scale-100"}`}>
                    <span
                      className="text-[56px] font-black tabular-nums leading-none transition-all duration-300"
                      style={{ color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.88)" }}
                    >
                      {match.team1_games}
                    </span>
                    <span className="text-3xl font-thin" style={{ color: "rgba(255,255,255,0.18)" }}>–</span>
                    <span
                      className="text-[56px] font-black tabular-nums leading-none transition-all duration-300"
                      style={{ color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.88)" }}
                    >
                      {match.team2_games}
                    </span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.22)", letterSpacing: "0.2em" }}>VS</div>
                )}

                {/* Pips + status */}
                <div className="flex items-center gap-4 mt-2.5">
                  {bestOf > 1 && (
                    <div className="flex gap-1.5 flex-row-reverse">
                      {pipsT1.map((filled, i) => <ScorePip key={i} filled={filled} win={isT1Winner} />)}
                    </div>
                  )}
                  <span className="text-[9px] font-black tracking-[0.32em]" style={{ color: "rgba(255,255,255,0.22)" }}>
                    {statusLabel}
                  </span>
                  {bestOf > 1 && (
                    <div className="flex gap-1.5">
                      {pipsT2.map((filled, i) => <ScorePip key={i} filled={filled} win={isT2Winner} />)}
                    </div>
                  )}
                </div>
              </div>

              {/* Team 2 */}
              <div className="flex-1 min-w-0 flex flex-col items-end">
                <div
                  className="text-[26px] font-black tracking-tight leading-none truncate transition-all duration-300"
                  style={isT2Winner
                    ? { color: "rgb(110,231,183)", textShadow: "0 0 24px rgba(52,211,153,0.45)" }
                    : { color: "rgba(255,255,255,0.92)" }}
                >
                  {match.team2.name}
                </div>
                <div className="mt-2 flex flex-col gap-0.5 items-end">
                  {match.team2.members.map((name) => (
                    <span key={name} className="text-[11px] font-medium leading-tight" style={{ color: "rgba(255,255,255,0.38)" }}>{name}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom accent */}
            <div className="mx-7 mb-4 h-px" style={{
              background: "linear-gradient(to right, transparent, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.11) 50%, rgba(255,255,255,0.05) 70%, transparent)"
            }} />
          </div>
        </div>
      </div>

      {/* ── Ticker ────────────────────────────────────────────────────────── */}
      <div className="absolute left-5 right-5" style={{ bottom: 8 }}>
        <MatchTicker pinnedId={match.match_id} />
      </div>
    </div>
  );
}

// ── Live ticker ───────────────────────────────────────────────────────────────

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
            id: m.id,
            round: r.round,
            team1: m.team1?.name ?? "TBD",
            team2: m.team2?.name ?? "TBD",
            status: m.status,
            winner: m.winner_id == null ? null : (m.winner_id === m.team1?.id ? m.team1?.name : m.team2?.name),
          }))
      );
      setItems(all);
    } catch { /* ignore */ }
  }, [pinnedId]);

  useEffect(() => { fetchItems(); const id = setInterval(fetchItems, 20_000); return () => clearInterval(id); }, [fetchItems]);

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
    <div
      className="flex items-center gap-3 px-4 py-2 rounded-xl"
      style={{
        background: "rgba(6,6,16,0.72)",
        border: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <span className="text-[9px] font-black tracking-[0.3em] shrink-0 uppercase" style={{ color: "rgba(255,255,255,0.22)" }}>Other</span>
      <div className="w-px h-3 shrink-0" style={{ background: "rgba(255,255,255,0.10)" }} />
      <div
        className="flex-1 flex items-center gap-2 overflow-hidden transition-all duration-300"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(3px)" }}
      >
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
