import { useEffect, useState, useRef } from "react";
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
    <div className={`w-3 h-3 rounded-full border-2 transition-all duration-500 ${
      filled
        ? win ? "bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
               : "bg-red-400 border-red-300 shadow-[0_0_8px_rgba(248,113,113,0.6)]"
        : "bg-transparent border-white/20"
    }`} />
  );
}

function TeamCard({ team, games, bestOf, isWinner, side }: {
  team: Team;
  games: number;
  bestOf: number;
  isWinner: boolean;
  side: "left" | "right";
}) {
  const winsNeeded = Math.ceil(bestOf / 2);
  const pips = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < games) : [];

  return (
    <div className={`flex-1 flex flex-col ${side === "right" ? "items-end text-right" : "items-start text-left"}`}>
      <div className={`text-2xl font-black tracking-tight leading-none mb-1 transition-all duration-300 ${
        isWinner ? "text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]" : "text-white"
      }`}>
        {team.name}
      </div>
      <div className="text-xs text-white/50 mb-2 font-medium">
        {team.members.join(" · ")}
      </div>
      {bestOf > 1 && (
        <div className={`flex gap-1.5 ${side === "right" ? "flex-row-reverse" : "flex-row"}`}>
          {pips.map((filled, i) => (
            <ScorePip key={i} filled={filled} win={isWinner} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OverlayMatch() {
  const [match, setMatch] = useState<OverlayMatchData | null>(null);
  const [, setPrevScores] = useState<[number, number]>([0, 0]);
  const [scoreFlash, setScoreFlash] = useState(false);
  const scoreRef = useRef<[number, number]>([0, 0]);

  const fetchMatch = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay`, {
        params: { guild_id: GUILD_ID },
      });
      setMatch(data.match ?? null);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchMatch(); }, []);

  // Watch for score changes and flash
  useEffect(() => {
    if (!match) return;
    const cur: [number, number] = [match.team1_games, match.team2_games];
    if (cur[0] !== scoreRef.current[0] || cur[1] !== scoreRef.current[1]) {
      setPrevScores(scoreRef.current);
      scoreRef.current = cur;
      setScoreFlash(true);
      setTimeout(() => setScoreFlash(false), 700);
    }
  }, [match?.team1_games, match?.team2_games]);

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
          if (msg.event === "match_pinned" || msg.event === "match_complete" || msg.event === "match_reported") {
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
  }, []);

  if (!match) {
    return (
      <div data-overlay className="flex items-center justify-center h-32">
        <p className="text-white/30 text-sm font-medium tracking-widest uppercase">No match pinned</p>
      </div>
    );
  }

  const bestOf = match.best_of ?? 1;
  const currentGameNum = match.team1_games + match.team2_games + 1;
  const games = match.games ?? [];
  const currentGameMap = games.find((g) => g.game_number === currentGameNum);
  const currentStageName = match.stage_name ?? currentGameMap?.stage_name ?? null;

  const modeData = match.mode_name ? MODES.find((m) => m.name === match.mode_name) : null;
  const stageData = currentStageName ? STAGES.find((s) => s.name === currentStageName) : null;
  const roundLabel = getRoundLabel(match.round, match.total_rounds);

  return (
    <div data-overlay className="p-4 min-h-screen">
      <div className="relative rounded-2xl overflow-hidden" style={{
        background: "linear-gradient(135deg, rgba(15,15,25,0.85) 0%, rgba(20,20,40,0.80) 100%)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(24px)",
      }}>
        {/* Stage background */}
        {stageData && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={stageData.image} alt="" className="w-full h-full object-cover opacity-15 scale-110" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black/70" />
          </div>
        )}

        <div className="relative z-10 p-5">
          {/* Top meta row */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-[10px] font-bold tracking-[0.25em] text-white/40 uppercase">{match.tournament_name}</span>
            <span className="text-white/20">·</span>
            <span className="text-[10px] font-bold tracking-[0.25em] text-white/40 uppercase">{roundLabel}</span>
            {bestOf > 1 && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-[10px] font-bold tracking-[0.25em] text-white/40 uppercase">BO{bestOf}</span>
              </>
            )}
            {modeData && (
              <>
                <span className="text-white/20">·</span>
                <div className="flex items-center gap-1">
                  <img src={modeData.icon} alt={modeData.name} className="w-3.5 h-3.5 object-contain opacity-60" />
                  <span className="text-[10px] font-bold tracking-[0.15em] text-white/40 uppercase">{modeData.name}</span>
                </div>
              </>
            )}
            {match.mode_name && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-[10px] font-bold tracking-[0.15em] text-white/40 uppercase">
                  {currentStageName ?? "?"}
                </span>
              </>
            )}
          </div>

          {/* Teams row */}
          <div className="flex items-center gap-4">
            <TeamCard
              team={match.team1}
              games={match.team1_games}
              bestOf={bestOf}
              isWinner={match.status === "complete" && match.team1_games > match.team2_games}
              side="left"
            />

            {/* Score */}
            <div className="flex flex-col items-center shrink-0">
              {bestOf > 1 ? (
                <div className={`flex items-center gap-2 transition-all duration-300 ${scoreFlash ? "scale-125" : "scale-100"}`}>
                  <span className={`text-4xl font-black tabular-nums transition-all duration-300 ${
                    match.team1_games > match.team2_games ? "text-emerald-300" : "text-white"
                  }`}>{match.team1_games}</span>
                  <span className="text-2xl font-light text-white/30">–</span>
                  <span className={`text-4xl font-black tabular-nums transition-all duration-300 ${
                    match.team2_games > match.team1_games ? "text-emerald-300" : "text-white"
                  }`}>{match.team2_games}</span>
                </div>
              ) : (
                <div className="text-white/30 text-xl font-bold tracking-widest">VS</div>
              )}
              <div className="mt-1 text-[10px] text-white/30 tracking-widest uppercase">
                {match.status === "awaiting_confirmation" ? "Confirming..." : match.status === "complete" ? "Complete" : "Live"}
              </div>
            </div>

            <TeamCard
              team={match.team2}
              games={match.team2_games}
              bestOf={bestOf}
              isWinner={match.status === "complete" && match.team2_games > match.team1_games}
              side="right"
            />
          </div>

          {/* Bottom accent */}
          <div className="mt-4 h-0.5 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        </div>
      </div>
    </div>
  );
}
