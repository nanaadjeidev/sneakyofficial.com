import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Trophy } from "lucide-react";
import { MODES, STAGES } from "../../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Team { id: number; name: string; members: string[] }
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

// ---- Corner style ----

function CornerMatchRow({ match, totalRounds, round }: { match: Match; totalRounds: number; round: number }) {
  const isFinal = round === totalRounds;
  const t1Won = match.winner_id === match.team1?.id;
  const t2Won = match.winner_id === match.team2?.id;
  const complete = match.status === "complete";

  if (match.is_bye || (!match.team1 && !match.team2)) return null;

  return (
    <div className={`rounded-lg px-2.5 py-1.5 border text-xs ${
      isFinal ? "border-yellow-500/40 bg-yellow-900/10" : "border-white/10 bg-white/5"
    }`}>
      <div className={`font-semibold truncate leading-snug ${complete && t1Won ? "text-emerald-300" : complete && !t1Won ? "text-white/35" : "text-white/80"}`}>
        {match.team1?.name ?? "TBD"}
      </div>
      <div className={`font-semibold truncate leading-snug ${complete && t2Won ? "text-emerald-300" : complete && !t2Won ? "text-white/35" : "text-white/80"}`}>
        {match.team2?.name ?? "TBD"}
      </div>
    </div>
  );
}

function CornerOverlay({ data }: { data: BracketData }) {
  const rounds = data.rounds;
  const totalRounds = rounds.length;
  // Show only the most recent active round (or all if complete)
  const activeRound = rounds.find((r) => r.matches.some((m) => m.status !== "complete" && !m.is_bye)) ?? rounds[totalRounds - 1];
  if (!activeRound) return null;

  const isFinalRound = activeRound.round === totalRounds;
  const modeData = activeRound.schedule?.mode_id ? MODES.find((m) => m.id === activeRound.schedule!.mode_id) : null;
  const stageData = activeRound.schedule?.stage_name ? STAGES.find((s) => s.name === activeRound.schedule!.stage_name) : null;
  const roundLabel = isFinalRound ? "Final" : activeRound.round === totalRounds - 1 && totalRounds > 2 ? "Semis" : `Round ${activeRound.round}`;
  const visibleMatches = activeRound.matches.filter((m) => !m.is_bye);

  return (
    <div className="p-3 w-64">
      <div className="rounded-xl overflow-hidden" style={{
        background: "rgba(10,10,20,0.88)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase truncate flex-1">{data.tournament.name}</span>
          <span className={`text-[10px] font-bold tracking-wider uppercase ${isFinalRound ? "text-yellow-400" : "text-white/40"}`}>
            {roundLabel}
          </span>
        </div>

        {/* Stage/mode bar */}
        {modeData && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5">
            {stageData && <img src={stageData.image} alt={stageData.name} className="h-6 w-10 object-cover rounded shrink-0 opacity-80" />}
            <div className="flex items-center gap-1">
              <img src={modeData.icon} alt={modeData.name} className="w-3.5 h-3.5 object-contain opacity-60" />
              <span className="text-[10px] text-white/40 truncate">{activeRound.schedule?.stage_name ?? "?"}</span>
            </div>
          </div>
        )}

        {/* Matches */}
        <div className="p-2 flex flex-col gap-1.5">
          {visibleMatches.map((m) => (
            <CornerMatchRow key={m.id} match={m} totalRounds={totalRounds} round={activeRound.round} />
          ))}
        </div>

        {/* Round progress dots */}
        <div className="flex justify-center gap-1 pb-2">
          {rounds.map((r) => {
            const done = r.matches.every((m) => m.status === "complete" || m.is_bye);
            const active = r.round === activeRound.round;
            return (
              <div key={r.round} className={`rounded-full transition-all ${
                active ? "w-3 h-1.5 bg-purple-400" : done ? "w-1.5 h-1.5 bg-white/30" : "w-1.5 h-1.5 bg-white/10"
              }`} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Full-width bottom bar ----

function FullMatchCell({ match, totalRounds, round }: { match: Match; totalRounds: number; round: number }) {
  const isFinal = round === totalRounds;
  const t1Won = match.winner_id === match.team1?.id;
  const t2Won = match.winner_id === match.team2?.id;
  const complete = match.status === "complete";

  if (match.is_bye) return null;

  return (
    <div className={`flex flex-col justify-center px-3 py-2 rounded-lg border min-w-[130px] max-w-[160px] shrink-0 ${
      isFinal ? "border-yellow-500/30 bg-yellow-900/10" : "border-white/8 bg-white/4"
    }`}>
      <div className={`text-xs font-semibold truncate leading-snug ${complete && t1Won ? "text-emerald-300" : complete && !t1Won && match.winner_id ? "text-white/30" : "text-white/75"}`}>
        {match.team1?.name ?? "TBD"}
      </div>
      <div className="text-[10px] text-white/20 my-0.5 text-center">vs</div>
      <div className={`text-xs font-semibold truncate leading-snug ${complete && t2Won ? "text-emerald-300" : complete && !t2Won && match.winner_id ? "text-white/30" : "text-white/75"}`}>
        {match.team2?.name ?? "TBD"}
      </div>
    </div>
  );
}

function FullOverlay({ data }: { data: BracketData }) {
  const rounds = data.rounds;
  const totalRounds = rounds.length;

  return (
    <div className="px-6 pb-4 pt-2 w-full">
      <div className="rounded-xl overflow-hidden" style={{
        background: "linear-gradient(180deg, rgba(8,8,18,0.90) 0%, rgba(12,12,24,0.85) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 -4px 40px rgba(0,0,0,0.5)",
      }}>
        {/* Title strip */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/8">
          <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <span className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">{data.tournament.name}</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
          <span className="text-[10px] text-white/25 uppercase tracking-widest">{data.tournament.status}</span>
        </div>

        {/* All rounds in one horizontal scroll */}
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex gap-3 px-4 py-2.5 min-w-max">
            {rounds.map((r) => {
              const isFinalRound = r.round === totalRounds;
              const roundLabel = isFinalRound ? "Final" : r.round === totalRounds - 1 && totalRounds > 2 ? "Semis" : `R${r.round}`;
              const modeData = r.schedule?.mode_id ? MODES.find((m) => m.id === r.schedule!.mode_id) : null;
              const stageData = r.schedule?.stage_name ? STAGES.find((s) => s.name === r.schedule!.stage_name) : null;
              const visibleMatches = r.matches.filter((m) => !m.is_bye);

              return (
                <div key={r.round} className="flex flex-col gap-1.5 shrink-0">
                  {/* Round label */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[10px] font-bold tracking-widest uppercase ${isFinalRound ? "text-yellow-400" : "text-white/35"}`}>
                      {roundLabel}
                    </span>
                    {stageData && <img src={stageData.image} alt="" className="h-4 w-7 object-cover rounded opacity-50" />}
                    {modeData && <img src={modeData.icon} alt={modeData.name} className="w-3 h-3 object-contain opacity-50" />}
                    {modeData && <span className="text-[9px] text-white/30">{r.schedule?.stage_name ?? "?"}</span>}
                  </div>
                  {/* Matches */}
                  <div className="flex flex-col gap-1.5">
                    {visibleMatches.map((m) => (
                      <FullMatchCell key={m.id} match={m} totalRounds={totalRounds} round={r.round} />
                    ))}
                    {visibleMatches.length === 0 && (
                      <div className="text-[10px] text-white/20 italic px-1">TBD</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Edge fades */}
        <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/30 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/30 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

// ---- Main overlay component ----

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
          if (["match_complete", "tournament_locked", "game_score"].includes(msg.event)) fetchData();
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000); };
    };
    connect();
    return () => { dead = true; ws?.close(); };
  }, [fetchData]);

  if (!data) return null;

  if (style === "full") {
    return (
      <div className="fixed bottom-0 left-0 right-0">
        <FullOverlay data={data} />
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4">
      <CornerOverlay data={data} />
    </div>
  );
}
