import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet";
import axios from "axios";
import { Users, Pencil, Check, X } from "lucide-react";
import PageWrapper from "../components/PageWrapper";
import { useAuth } from "../hooks/useAuth";
import { RANK_OPTIONS, rankLabel, type ProfileRow } from "../components/tournament/AdminPanel";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const ADMIN_DISCORD_IDS = ["339866237922181121"];

function AdminTwitchIcon() {
  return (
    <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

export default function Players() {
  const { loggedIn, userData, isLoading } = useAuth();
  const isAdmin = loggedIn && userData && ADMIN_DISCORD_IDS.includes(userData.userId);

  const [players, setPlayers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [rankSaving, setRankSaving] = useState<Record<string, boolean>>({});
  const [splattagEdit, setSplattagEdit] = useState<Record<number, string | null>>({});
  const [splattagSaving, setSplattagSaving] = useState<Record<number, boolean>>({});

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/players`, {
        params: q ? { search: q } : {},
        withCredentials: true,
      });
      setPlayers(data.players ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(search || undefined);
  };

  const setRank = async (playerId: number, value: string) => {
    const key = String(playerId);
    setRankSaving((prev) => ({ ...prev, [key]: true }));
    try {
      let rank: number | null = null;
      let rank_tier: number | null = null;
      if (value) {
        const [r, t] = value.split("-").map(Number);
        rank = r; rank_tier = t;
      }
      await axios.post(
        `${API_URL}/api/admin/player/${playerId}/rank`,
        { rank, rank_tier },
        { withCredentials: true },
      );
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? { ...p, rank, rank_tier, rank_name: rank ? rankLabel(rank, rank_tier) : "Unranked" }
            : p
        )
      );
    } finally {
      setRankSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const saveSplattag = async (playerId: number) => {
    const tag = splattagEdit[playerId]?.trim();
    if (!tag) return;
    setSplattagSaving((prev) => ({ ...prev, [playerId]: true }));
    try {
      await axios.post(
        `${API_URL}/api/admin/player/${playerId}/splattag`,
        { splattag: tag },
        { withCredentials: true },
      );
      setPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, splattag: tag } : p));
      setSplattagEdit((prev) => ({ ...prev, [playerId]: null }));
    } catch {
      // leave edit open on failure
    } finally {
      setSplattagSaving((prev) => ({ ...prev, [playerId]: false }));
    }
  };

  return (
    <PageWrapper>
      <Helmet>
        <title>Players | sneakyofficial.com</title>
      </Helmet>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-7 h-7 text-purple-400 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-white">Players</h1>
            <p className="text-sm text-slate-400 mt-0.5">All registered player profiles</p>
          </div>
        </div>

        {isLoading ? null : !isAdmin ? (
          <p className="text-slate-500 py-16 text-center">Admin access required.</p>
        ) : (
          <>
            <form onSubmit={handleSearch} className="flex gap-2 mb-5">
              <input
                className="flex-1 bg-slate-900/60 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400"
                placeholder="Search by name, splattag, or Twitch…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="submit" className="px-4 py-2 text-sm rounded bg-slate-700 hover:bg-slate-600 text-white">Search</button>
              {search && (
                <button type="button" onClick={() => { setSearch(""); load(); }} className="text-slate-500 hover:text-slate-300 text-sm px-2">Clear</button>
              )}
            </form>

            {loading ? (
              <p className="text-slate-400 text-center py-12 text-sm">Loading…</p>
            ) : players.length === 0 ? (
              <p className="text-slate-600 text-center py-12 text-sm">No players found.</p>
            ) : (
              <div className="rounded-xl border border-slate-700/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60 bg-slate-800/40">
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Player</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Twitch</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Rank</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide hidden sm:table-cell">Rating</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">W/L</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide hidden md:table-cell">Trophy Wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.discord_id} className="border-b border-slate-800/50 hover:bg-slate-800/20 last:border-b-0 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{p.display_name || "-"}</div>
                          {splattagEdit[p.id] != null ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <input
                                autoFocus
                                value={splattagEdit[p.id] ?? ""}
                                onChange={(e) => setSplattagEdit((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveSplattag(p.id);
                                  if (e.key === "Escape") setSplattagEdit((prev) => ({ ...prev, [p.id]: null }));
                                }}
                                placeholder="Name#1234"
                                className="w-32 bg-slate-900 border border-purple-500/60 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                              />
                              <button
                                onClick={() => saveSplattag(p.id)}
                                disabled={splattagSaving[p.id]}
                                className="text-green-400 hover:text-green-300 disabled:opacity-50"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button onClick={() => setSplattagEdit((prev) => ({ ...prev, [p.id]: null }))} className="text-slate-500 hover:text-slate-300">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 mt-0.5 group">
                              <span className={`text-xs ${p.splattag ? "text-slate-500" : "text-red-500/60"}`}>
                                {p.splattag ?? "no tag"}
                              </span>
                              <button
                                onClick={() => setSplattagEdit((prev) => ({ ...prev, [p.id]: p.splattag ?? "" }))}
                                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-purple-400 transition-opacity"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                          <div className="font-mono text-slate-700 text-[10px] select-all">{p.discord_id}</div>
                        </td>
                        <td className="px-4 py-3">
                          {p.twitch_username ? (
                            <span className="text-purple-400 flex items-center gap-1 text-xs"><AdminTwitchIcon />{p.twitch_username}</span>
                          ) : (
                            <span className="text-red-500/60 text-xs">not linked</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={p.rank && p.rank_tier ? `${p.rank}-${p.rank_tier}` : ""}
                            disabled={rankSaving[String(p.id)]}
                            onChange={(e) => setRank(p.id, e.target.value)}
                            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
                          >
                            {RANK_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                          <div className="text-purple-300 font-mono font-semibold">{p.rating}</div>
                          <div className="text-[10px] text-slate-600">μ{p.trueskill_mu?.toFixed(1)} σ{p.trueskill_sigma?.toFixed(1)}</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-sm">
                          <span className="text-green-400">{p.matches_won}</span>
                          <span className="text-slate-600 mx-0.5">/</span>
                          <span className="text-red-400/80">{p.matches_lost}</span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <span className={p.tournament_wins > 0 ? "text-yellow-400 font-semibold" : "text-slate-600"}>
                            {p.tournament_wins > 0 ? `${p.tournament_wins} 🏆` : "0"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </PageWrapper>
  );
}
