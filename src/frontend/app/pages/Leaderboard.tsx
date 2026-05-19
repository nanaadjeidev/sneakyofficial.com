import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import axios from "axios";
import { Trophy } from "lucide-react";
import PageWrapper from "../components/PageWrapper";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Player {
  discord_id: string;
  display_name: string;
  splattag: string | null;
  twitch_username: string | null;
  rank: number | null;
  rank_name: string;
  rank_emoji: string;
  rating: number;
  matches_won: number;
  matches_lost: number;
  win_rate: number;
  tournament_wins: number;
  tournaments_played: number;
}

const RANK_COLORS: Record<number, string> = {
  1: "text-slate-400 bg-slate-800/60 border-slate-600/40",
  2: "text-green-400 bg-green-900/20 border-green-700/30",
  3: "text-blue-400 bg-blue-900/20 border-blue-700/30",
  4: "text-purple-400 bg-purple-900/20 border-purple-700/30",
  5: "text-amber-400 bg-amber-900/20 border-amber-600/30",
  6: "text-yellow-300 bg-yellow-900/20 border-yellow-500/40",
};

function RankBadge({ rank, rankName, rankEmoji }: { rank: number | null; rankName: string; rankEmoji: string }) {
  const cls = rank ? (RANK_COLORS[rank] ?? "") : "text-slate-600 bg-slate-900/40 border-slate-700/40";
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      <span>{rankEmoji}</span>
      <span className="hidden sm:inline">{rankName}</span>
    </span>
  );
}

type SortKey = "rating" | "wins" | "rank";

const SORT_LABELS: Record<SortKey, string> = {
  rating: "Rating",
  wins: "Wins",
  rank: "Rank",
};

function PositionCell({ index }: { index: number }) {
  if (index === 0) return <Trophy className="w-4 h-4 text-yellow-400" />;
  if (index === 1) return <span className="text-slate-400 font-semibold text-sm">2</span>;
  if (index === 2) return <span className="text-amber-600 font-semibold text-sm">3</span>;
  return <span className="text-slate-600 font-mono text-sm">{index + 1}</span>;
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [sort, setSort] = useState<SortKey>("rating");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get(`${API_URL}/api/leaderboard`, { params: { sort, limit: 50 } })
      .then(({ data }) => {
        if (!cancelled) {
          setPlayers(data.leaderboard ?? []);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load leaderboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sort]);

  return (
    <PageWrapper>
      <Helmet>
        <title>Leaderboard — sneakyofficial.com</title>
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="w-7 h-7 text-yellow-400 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
            <p className="text-sm text-slate-400 mt-0.5">Community tournament rankings</p>
          </div>
        </div>

        {/* Sort tabs */}
        <div className="flex gap-1 mb-6 bg-slate-800/40 p-1 rounded-lg w-fit border border-slate-700/40">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
                sort === k
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-slate-400 py-20 text-sm">Loading…</div>
        ) : error ? (
          <div className="text-center text-red-400 py-20 text-sm">{error}</div>
        ) : players.length === 0 ? (
          <div className="text-center text-slate-500 py-20">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-slate-700" />
            <p>No players ranked yet.</p>
            <p className="text-xs mt-1 text-slate-600">Play in a tournament to appear here.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 bg-slate-800/40">
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Player</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide hidden sm:table-cell">Rank</th>
                  <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Rating</th>
                  <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide hidden md:table-cell">W</th>
                  <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide hidden md:table-cell">L</th>
                  <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide hidden sm:table-cell">Win%</th>
                  <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide hidden lg:table-cell">Trophies</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr
                    key={p.discord_id}
                    className={`border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors last:border-b-0 ${
                      i === 0 ? "bg-yellow-900/5" : i === 1 ? "bg-slate-800/10" : i === 2 ? "bg-orange-900/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3 w-10">
                      <PositionCell index={i} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-white leading-tight">
                          {p.display_name || "Unknown"}
                        </span>
                        {p.twitch_username && (
                          <span className="flex items-center gap-1 text-xs text-purple-400">
                            <TwitchIcon />
                            {p.twitch_username}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <RankBadge rank={p.rank} rankName={p.rank_name} rankEmoji={p.rank_emoji} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200 tabular-nums">
                      {p.rating.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-400 font-medium hidden md:table-cell">{p.matches_won}</td>
                    <td className="px-4 py-3 text-right text-red-400/80 font-medium hidden md:table-cell">{p.matches_lost}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums hidden sm:table-cell">{p.win_rate}%</td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      {p.tournament_wins > 0 ? (
                        <span className="text-yellow-400 font-medium">{p.tournament_wins} 🏆</span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-600 mt-4 text-center">
          Rating is a conservative TrueSkill estimate · Updated after each confirmed match
        </p>
      </div>
    </PageWrapper>
  );
}

function TwitchIcon() {
  return (
    <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}
