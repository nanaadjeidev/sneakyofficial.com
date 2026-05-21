import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Trophy } from "lucide-react";
import { MODES, STAGES } from "../../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const ALL_WS_EVENTS = ["match_complete","match_reported","match_pinned","tournament_locked","game_score","counterpick_stage"];

function getWsUrl() {
  return ((API_URL as string) || window.location.origin).replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Team { id: number; name: string; members: string[]; captain?: string | null }
interface Match {
  id: number;
  match_number: number;
  team1: Team | null;
  team2: Team | null;
  winner_id: number | null;
  status: string;
  is_bye: boolean;
  team1_games?: number;
  team2_games?: number;
}
interface Round {
  round: number;
  matches: Match[];
  schedule?: { stage_name?: string | null; mode_id?: string | null; mode_name?: string | null; best_of?: number } | null;
}
interface BracketData {
  tournament: { id: number; name: string; status: string };
  rounds: Round[];
}

function useQueryParam(key: string) {
  return new URLSearchParams(window.location.search).get(key);
}

function useWsRefresh(onRefresh: () => void) {
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
          if (ALL_WS_EVENTS.includes(msg.event)) onRefresh();
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000); };
    };
    connect();
    return () => { dead = true; ws?.close(); };
  }, [onRefresh]);
}

// ─── Corner overlay ───────────────────────────────────────────────────────────

function CornerMatchRow({ match, isFinal }: { match: Match; isFinal: boolean }) {
  const t1Won = match.winner_id === match.team1?.id;
  const t2Won = match.winner_id === match.team2?.id;
  const done = match.status === "complete";
  if (match.is_bye || (!match.team1 && !match.team2)) return null;
  return (
    <div className={`rounded-lg px-2.5 py-1.5 border text-xs ${isFinal ? "border-yellow-500/40 bg-yellow-900/10" : "border-white/10 bg-white/5"}`}>
      <div className={`font-semibold truncate leading-snug ${done && t1Won ? "text-emerald-300" : done && !t1Won ? "text-white/35" : "text-white/80"}`}>
        {match.team1?.name ?? "TBD"}
      </div>
      <div className="text-[9px] text-white/20 text-center my-0.5 tracking-widest">VS</div>
      <div className={`font-semibold truncate leading-snug ${done && t2Won ? "text-emerald-300" : done && !t2Won ? "text-white/35" : "text-white/80"}`}>
        {match.team2?.name ?? "TBD"}
      </div>
    </div>
  );
}

function CornerOverlay({ data }: { data: BracketData }) {
  const rounds = data.rounds;
  const total = rounds.length;
  const active = rounds.find((r) => r.matches.some((m) => m.status !== "complete" && !m.is_bye)) ?? rounds[total - 1];
  if (!active) return null;
  const isFinal = active.round === total;
  const modeData = active.schedule?.mode_id ? MODES.find((m) => m.id === active.schedule!.mode_id) : null;
  const stageData = active.schedule?.stage_name ? STAGES.find((s) => s.name === active.schedule!.stage_name) : null;
  const roundLabel = isFinal ? "Final" : active.round === total - 1 && total > 2 ? "Semis" : `Round ${active.round}`;
  const visible = active.matches.filter((m) => !m.is_bye);

  return (
    <div className="p-3 w-64">
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(10,10,20,0.88)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)", boxShadow: "0 4px 32px rgba(0,0,0,0.5)" }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase truncate flex-1">{data.tournament.name}</span>
          <span className={`text-[10px] font-bold tracking-wider uppercase ${isFinal ? "text-yellow-400" : "text-white/40"}`}>{roundLabel}</span>
        </div>
        {modeData && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5">
            {stageData && <img src={stageData.image} alt="" className="h-6 w-10 object-cover rounded shrink-0 opacity-80" />}
            <img src={modeData.icon} alt={modeData.name} className="w-3.5 h-3.5 object-contain opacity-60" />
            <span className="text-[10px] text-white/40 truncate">{active.schedule?.stage_name ?? "?"}</span>
          </div>
        )}
        <div className="p-2 flex flex-col gap-1.5">
          {visible.map((m) => <CornerMatchRow key={m.id} match={m} isFinal={isFinal} />)}
        </div>
        <div className="flex justify-center gap-1 pb-2">
          {rounds.map((r) => {
            const done = r.matches.every((m) => m.status === "complete" || m.is_bye);
            const cur = r.round === active.round;
            return <div key={r.round} className={`rounded-full transition-all ${cur ? "w-3 h-1.5 bg-purple-400" : done ? "w-1.5 h-1.5 bg-white/30" : "w-1.5 h-1.5 bg-white/10"}`} />;
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Full butterfly bracket ───────────────────────────────────────────────────

const CELL_H = 82;   // vertical slot height per R1 match
const CARD_H = 66;   // match card height
const CARD_W = 192;  // match card width
const GAP    = 52;   // gap between round columns
const ARM    = GAP / 2;

function cy(roundIdx: number, matchIdx: number) {
  return CELL_H * Math.pow(2, roundIdx) * (matchIdx + 0.5);
}
function rx(roundIdx: number) {
  return roundIdx * (CARD_W + GAP);
}

function BracketCard({ match, isFinal, isLive }: { match: Match; isFinal: boolean; isLive: boolean }) {
  const t1Won = match.winner_id === match.team1?.id;
  const t2Won = match.winner_id === match.team2?.id;
  const done = match.status === "complete";
  const cap1 = match.team1?.captain ?? match.team1?.members?.[0] ?? null;
  const cap2 = match.team2?.captain ?? match.team2?.members?.[0] ?? null;

  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-xl transition-all duration-500"
      style={{
        width: CARD_W,
        height: CARD_H,
        border: isLive
          ? "1px solid rgba(167,139,250,0.5)"
          : isFinal
          ? "1px solid rgba(234,179,8,0.35)"
          : "1px solid rgba(255,255,255,0.10)",
        background: isLive
          ? "rgba(88,28,220,0.12)"
          : isFinal
          ? "rgba(120,80,0,0.12)"
          : "rgba(10,10,22,0.85)",
        backdropFilter: "blur(16px)",
        boxShadow: isLive ? "0 0 16px rgba(139,92,246,0.25)" : "0 2px 12px rgba(0,0,0,0.5)",
      }}
    >
      {/* Team 1 */}
      <div className={`flex-1 flex items-center gap-2 px-3 border-b ${isFinal ? "border-yellow-500/20" : "border-white/8"}`}>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-bold truncate leading-tight ${done && t1Won ? "text-emerald-300" : done && t2Won ? "text-white/30" : "text-white/90"}`}>
            {match.team1?.name ?? <span className="text-white/25 italic">TBD</span>}
          </div>
          {cap1 && (
            <div className={`text-[9px] truncate leading-tight mt-0.5 ${done && t1Won ? "text-emerald-400/60" : "text-white/30"}`}>
              ★ {cap1}
            </div>
          )}
        </div>
        {done && t1Won && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />}
      </div>
      {/* Team 2 */}
      <div className="flex-1 flex items-center gap-2 px-3">
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-bold truncate leading-tight ${done && t2Won ? "text-emerald-300" : done && t1Won ? "text-white/30" : "text-white/90"}`}>
            {match.team2?.name ?? <span className="text-white/25 italic">TBD</span>}
          </div>
          {cap2 && (
            <div className={`text-[9px] truncate leading-tight mt-0.5 ${done && t2Won ? "text-emerald-400/60" : "text-white/30"}`}>
              ★ {cap2}
            </div>
          )}
        </div>
        {done && t2Won && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />}
      </div>
    </div>
  );
}

function FullOverlay({ data }: { data: BracketData }) {
  const rounds = data.rounds;
  const totalRounds = rounds.length;
  const numR1 = rounds[0]?.matches.filter((m) => !m.is_bye || m.team1 || m.team2).length ?? 1;
  const totalH = numR1 * CELL_H;
  const totalW = totalRounds * (CARD_W + GAP) - GAP;
  const svgW = totalW + ARM;

  // Build connector paths
  const lines: { d: string; winner: boolean }[] = [];
  for (let r = 0; r < totalRounds - 1; r++) {
    const nextMatches = rounds[r + 1]?.matches ?? [];
    nextMatches.forEach((nm, j) => {
      const f0idx = 2 * j;
      const f1idx = 2 * j + 1;
      const f0 = rounds[r]?.matches[f0idx];
      const f1 = rounds[r]?.matches[f1idx];
      if (!f0 && !f1) return;
      const f0cy = cy(r, f0idx);
      const f1cy = cy(r, f1idx);
      const tcy  = cy(r + 1, j);
      const xRight = rx(r) + CARD_W;
      const xArm   = xRight + ARM;
      const xNext  = rx(r + 1);
      const winner = !!nm.winner_id;
      const d = [
        `M ${xRight} ${f0cy} H ${xArm}`,
        `M ${xRight} ${f1cy} H ${xArm}`,
        `M ${xArm} ${f0cy} V ${f1cy}`,
        `M ${xArm} ${tcy} H ${xNext}`,
      ].join(" ");
      lines.push({ d, winner });
    });
  }

  return (
    <div className="w-screen h-screen flex flex-col" style={{ background: "rgba(6,6,14,0.92)", backdropFilter: "blur(24px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/8 shrink-0">
        <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
        <span className="text-sm font-bold tracking-[0.2em] text-white/60 uppercase">{data.tournament.name}</span>
        <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        {/* Round labels */}
        <div className="flex gap-2">
          {rounds.map((r) => {
            const lbl = r.round === totalRounds ? "Final" : r.round === totalRounds - 1 && totalRounds > 2 ? "Semis" : `R${r.round}`;
            const active = r.matches.some((m) => m.status !== "complete" && !m.is_bye);
            const modeData = r.schedule?.mode_id ? MODES.find((m) => m.id === r.schedule!.mode_id) : null;
            return (
              <div key={r.round} className="flex items-center gap-1">
                {modeData && <img src={modeData.icon} alt="" className="w-3 h-3 object-contain opacity-50" />}
                <span className={`text-[10px] font-bold tracking-widest uppercase ${active ? "text-purple-400" : r.round === totalRounds ? "text-yellow-400/70" : "text-white/25"}`}>{lbl}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bracket canvas */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <div className="relative" style={{ width: svgW, height: totalH }}>
          {/* SVG connectors */}
          <svg className="absolute inset-0 pointer-events-none overflow-visible" width={svgW} height={totalH}>
            {lines.map((l, i) => (
              <path key={i} d={l.d} fill="none"
                stroke={l.winner ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.12)"}
                strokeWidth={1.5} strokeLinecap="round" />
            ))}
          </svg>
          {/* Match cards */}
          {rounds.map((r, ri) =>
            r.matches.map((m, mi) => {
              if (m.is_bye && !m.team1 && !m.team2) return null;
              const centerY = cy(ri, mi);
              const left = rx(ri);
              const top = centerY - CARD_H / 2;
              const isFinal = r.round === totalRounds;
              const isLive = m.status === "pending" || m.status === "awaiting_confirmation";
              return (
                <div key={m.id} className="absolute" style={{ left, top }}>
                  <BracketCard match={m} isFinal={isFinal} isLive={isLive} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OverlayBracket() {
  const style = useQueryParam("style") ?? "corner";
  const [data, setData] = useState<BracketData | null>(null);

  const fetchData = useCallback(async () => {
    if (!GUILD_ID) return;
    try {
      const { data: res } = await axios.get(`${API_URL}/api/tournament`, { params: { guild_id: GUILD_ID } });
      if (res?.tournament) setData(res);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  useWsRefresh(fetchData);

  if (!data) return null;

  if (style === "full") {
    return <FullOverlay data={data} />;
  }

  return (
    <div className="fixed top-4 right-4">
      <CornerOverlay data={data} />
    </div>
  );
}
