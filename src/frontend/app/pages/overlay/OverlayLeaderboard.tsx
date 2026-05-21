import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Player {
  discord_id: string;
  display_name: string;
  splattag: string | null;
  rank: number | null;
  rank_name: string;
  rank_emoji: string;
  rating: number;
  tournament_wins: number;
}

const CYCLE_MS = 3500;

export default function OverlayLeaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/api/leaderboard`, { params: { sort: "rating", limit: 10 } })
      .then(({ data }) => setPlayers((data.leaderboard ?? []).slice(0, 10)))
      .catch(() => {});
  }, []);

  // Cycle through players with fade transition
  useEffect(() => {
    if (players.length === 0) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIdx((i) => (i + 1) % players.length);
        setVisible(true);
      }, 350);
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [players.length]);

  if (players.length === 0) return null;

  const player = players[currentIdx];
  const POSITION_COLORS: Record<number, string> = {
    0: "text-yellow-400",
    1: "text-slate-300",
    2: "text-amber-600",
  };
  const posColor = POSITION_COLORS[currentIdx] ?? "text-white/40";

  return (
    <div className="p-3">
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "rgba(8,8,18,0.88)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          minWidth: 220,
        }}
      >
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-white/8 flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.25em] text-white/35 uppercase">Leaderboard</span>
          {/* Progress pips */}
          <div className="flex gap-0.5 ml-auto">
            {players.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${i === currentIdx ? "w-2.5 h-1.5 bg-purple-400" : "w-1.5 h-1.5 bg-white/15"}`}
              />
            ))}
          </div>
        </div>

        {/* Player card */}
        <div
          className="px-3 py-2.5 flex items-center gap-3 transition-all duration-300"
          style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(4px)" }}
        >
          <div className={`text-2xl font-black w-6 text-center shrink-0 ${posColor}`}>
            {currentIdx === 0 ? "🏆" : currentIdx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate leading-tight">
              {player.display_name}
              {player.splattag && <span className="text-white/30 font-normal ml-1 text-xs">#{player.splattag}</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-white/40">{player.rank_emoji} {player.rank_name}</span>
              {player.tournament_wins > 0 && (
                <span className="text-[10px] text-yellow-400/70">{player.tournament_wins}× champ</span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-base font-black text-purple-300 tabular-nums">{player.rating}</div>
            <div className="text-[10px] text-white/25 uppercase tracking-wide">rating</div>
          </div>
        </div>
      </div>
    </div>
  );
}
