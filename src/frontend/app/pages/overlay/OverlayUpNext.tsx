import { useEffect, useState } from "react";
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

interface UpNextData {
  match_id: number;
  round: number;
  total_rounds: number;
  tournament_name: string;
  team1: Team;
  team2: Team;
  best_of: number;
  mode_name: string | null;
  stage_name: string | null;
  games: { game_number: number; stage_name: string | null }[];
}

function getRoundLabel(round: number, total: number): string {
  if (round === total) return "FINAL";
  if (round === total - 1 && total > 2) return "SEMI-FINALS";
  return `ROUND ${round}`;
}

export default function OverlayUpNext() {
  const [match, setMatch] = useState<UpNextData | null>(null);

  const fetchMatch = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay-upnext`, {
        params: { guild_id: GUILD_ID },
      });
      setMatch(data.match ?? null);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchMatch(); }, []);

  // WebSocket for live updates
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
          if (["match_complete", "match_pinned", "tournament_locked"].includes(msg.event)) {
            fetchMatch();
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000); };
    };
    connect();
    return () => { dead = true; ws?.close(); };
  }, []);

  if (!match) {
    return (
      <div data-overlay className="flex items-center justify-center h-24">
        <p className="text-white/20 text-xs font-medium tracking-widest uppercase">No upcoming match</p>
      </div>
    );
  }

  const roundLabel = getRoundLabel(match.round, match.total_rounds);
  const modeData = match.mode_name ? MODES.find((m) => m.name === match.mode_name) : null;
  const game1Stage = match.stage_name ?? match.games?.find((g) => g.game_number === 1)?.stage_name ?? null;
  const stageData = game1Stage ? STAGES.find((s) => s.name === game1Stage) : null;
  const isCounterpick = !game1Stage && (match.games?.length ?? 0) > 0;
  const bestOf = match.best_of ?? 1;

  return (
    <div data-overlay className="p-4">
      <div className="relative rounded-2xl overflow-hidden" style={{
        background: "linear-gradient(135deg, rgba(10,10,20,0.88) 0%, rgba(15,15,35,0.84) 100%)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(24px)",
      }}>
        {/* Stage background */}
        {stageData && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={stageData.image} alt="" className="w-full h-full object-cover opacity-10 scale-110" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black/80" />
          </div>
        )}

        <div className="relative z-10 px-5 py-4">
          {/* "Up next" label */}
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-purple-500/40" />
            <span className="text-[10px] font-black tracking-[0.3em] text-purple-400/80 uppercase">Up Next</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-purple-500/40" />
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">{match.tournament_name}</span>
            <span className="text-white/20">·</span>
            <span className="text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">{roundLabel}</span>
            {bestOf > 1 && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">BO{bestOf}</span>
              </>
            )}
            {modeData && (
              <>
                <span className="text-white/20">·</span>
                <div className="flex items-center gap-1">
                  <img src={modeData.icon} alt={modeData.name} className="w-3 h-3 object-contain opacity-50" />
                  <span className="text-[10px] font-bold tracking-[0.15em] text-white/35 uppercase">{modeData.name}</span>
                </div>
              </>
            )}
            {(game1Stage || isCounterpick) && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-[10px] font-bold tracking-[0.15em] text-white/35 uppercase">
                  {game1Stage ?? "?"}
                </span>
              </>
            )}
          </div>

          {/* Teams row */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex-1 text-right">
              <div className="text-xl font-black tracking-tight text-white leading-none">{match.team1.name}</div>
              <div className="text-xs text-white/40 mt-0.5">{match.team1.members.join(" · ")}</div>
            </div>
            <div className="shrink-0 text-white/25 text-lg font-light tracking-widest">VS</div>
            <div className="flex-1 text-left">
              <div className="text-xl font-black tracking-tight text-white leading-none">{match.team2.name}</div>
              <div className="text-xs text-white/40 mt-0.5">{match.team2.members.join(" · ")}</div>
            </div>
          </div>

          {/* Stage thumbnail */}
          {stageData && (
            <div className="mt-3 flex justify-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8">
                <img src={stageData.image} alt={stageData.name} className="h-5 w-9 object-cover rounded opacity-80" />
                <span className="text-[10px] text-white/40 font-medium">{stageData.name}</span>
              </div>
            </div>
          )}
          {isCounterpick && (
            <div className="mt-3 flex justify-center">
              <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/8">
                <span className="text-[10px] text-white/30 font-medium">Stage: ?</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
