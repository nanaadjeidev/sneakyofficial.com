import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet";
import axios from "axios";
import { Trophy, Users, Clock, Swords, CheckCircle, AlertCircle, LogIn } from "lucide-react";
import PageWrapper from "../components/PageWrapper";
import AdminPanel, { type Signup, type PreTeam } from "../components/tournament/AdminPanel";
import { useAuth } from "../hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const ADMIN_DISCORD_IDS = ["339866237922181121"];
const POLL_MS = 30_000;

interface Member {
  display_name?: string;
}

interface Team {
  id: number;
  name: string;
  seed: number;
  members: string[];
}

interface Match {
  id: number;
  match_number: number;
  team1: Team | null;
  team2: Team | null;
  winner_id: number | null;
  status: "pending" | "awaiting_confirmation" | "complete";
  is_bye: boolean;
}

interface RoundSchedule {
  stage_name: string | null;
  mode_id: string | null;
  mode_name: string | null;
}

interface Round {
  round: number;
  matches: Match[];
  schedule?: RoundSchedule | null;
}

interface Tournament {
  id: number;
  name: string;
  status: "signup" | "active" | "complete" | "cancelled";
  team_size?: number;
  created_at: string;
}

interface BracketData {
  tournament: Tournament;
  rounds: Round[];
}

// --- Status badge -------------------------------------------------------

function StatusBadge({ status }: { status: Tournament["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    signup: { label: "Sign-ups open", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
    active: { label: "In progress", cls: "bg-green-500/20 text-green-300 border-green-500/40" },
    complete: { label: "Completed", cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
    cancelled: { label: "Cancelled", cls: "bg-red-500/20 text-red-300 border-red-500/40" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-500/20 text-slate-300" };
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

// --- Match result icon --------------------------------------------------

function MatchStatusIcon({ status }: { status: Match["status"] }) {
  if (status === "complete") return <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />;
  if (status === "awaiting_confirmation") return <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />;
  return <Clock className="w-4 h-4 text-slate-400 shrink-0" />;
}

// --- Team card in a match -----------------------------------------------

function TeamSlot({ team, isWinner, isBye }: { team: Team | null; isWinner: boolean; isBye?: boolean }) {
  if (isBye || !team) {
    return (
      <div className="px-3 py-2 rounded text-slate-500 italic text-sm bg-slate-900/40">
        BYE
      </div>
    );
  }

  return (
    <div
      className={`px-3 py-2 rounded transition-colors ${
        isWinner
          ? "bg-green-500/20 border border-green-500/50 text-green-200"
          : "bg-slate-800/60 border border-slate-700/50 text-slate-300"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {isWinner && <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
        <span className="font-semibold text-sm truncate">{team.name}</span>
      </div>
      <div className="text-xs text-slate-400 mt-0.5 truncate">
        {team.members.join(", ")}
      </div>
    </div>
  );
}

// --- Individual match card ----------------------------------------------

function MatchCard({ match, isFinal }: { match: Match; isFinal: boolean }) {
  const isBye = match.is_bye;
  const awaitingT1 = !match.team1;
  const awaitingT2 = !match.team2 && !isBye;

  return (
    <div
      className={`rounded-lg border p-1.5 w-52 flex flex-col gap-1 shadow-md ${
        isFinal
          ? "border-yellow-500/50 bg-yellow-900/10"
          : "border-slate-700/60 bg-slate-800/30"
      }`}
    >
      {isFinal && (
        <div className="text-center text-xs font-bold text-yellow-400 pb-0.5">
          FINAL
        </div>
      )}

      {/* Team 1 slot */}
      {awaitingT1 ? (
        <div className="px-3 py-2 rounded bg-slate-900/40 text-slate-500 italic text-sm">TBD</div>
      ) : (
        <TeamSlot team={match.team1} isWinner={match.winner_id === match.team1?.id} />
      )}

      <div className="flex items-center gap-1 px-1">
        <div className="flex-1 border-t border-slate-700/40" />
        <div className="flex items-center gap-1 text-slate-500">
          <Swords className="w-3 h-3" />
          <MatchStatusIcon status={match.status} />
        </div>
        <div className="flex-1 border-t border-slate-700/40" />
      </div>

      {/* Team 2 slot */}
      {isBye ? (
        <TeamSlot team={null} isWinner={false} isBye />
      ) : awaitingT2 ? (
        <div className="px-3 py-2 rounded bg-slate-900/40 text-slate-500 italic text-sm">TBD</div>
      ) : (
        <TeamSlot team={match.team2} isWinner={match.winner_id === match.team2?.id} />
      )}
    </div>
  );
}

// --- Bracket column for one round ---------------------------------------

import { MODES, STAGES } from "../components/tournament/splatoonData";

function RoundColumn({ round, matches, totalRounds, schedule }: { round: number; matches: Match[]; totalRounds: number; schedule?: RoundSchedule | null }) {
  const isFinalRound = round === totalRounds;
  const modeData = schedule?.mode_id ? MODES.find((m) => m.id === schedule.mode_id) : null;
  const stageData = schedule?.stage_name ? STAGES.find((s) => s.name === schedule.stage_name) : null;

  return (
    <div className="flex flex-col items-center gap-2 min-w-[220px]">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
        {isFinalRound ? "Final" : round === totalRounds - 1 && totalRounds > 2 ? "Semi-Finals" : `Round ${round}`}
      </div>
      {(stageData || modeData) && (
        <div className="flex flex-col items-center gap-1 mb-2 w-full">
          {stageData && (
            <img src={stageData.image} alt={stageData.name} className="w-full max-w-[200px] h-[56px] object-cover rounded-lg border border-slate-700/50" />
          )}
          {(schedule?.stage_name || modeData) && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              {modeData && <img src={modeData.icon} alt={modeData.name} className="w-4 h-4 object-contain" />}
              {schedule?.stage_name && <span className="truncate max-w-[160px]">{schedule.stage_name}</span>}
            </div>
          )}
        </div>
      )}
      {/* Distribute matches evenly using flex-grow spacers */}
      <div className="flex flex-col w-full" style={{ gap: `${Math.pow(2, round - 1) * 0.5}rem` }}>
        {matches.map((m) => (
          <div key={m.id} className="flex items-center justify-center">
            <MatchCard match={m} isFinal={isFinalRound} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Sign-up list (when tournament hasn't started) ---------------------

function SignupList({ tournamentId }: { tournamentId: number }) {
  const [players, setPlayers] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/tournament`, {
          params: { id: tournamentId },
        });
        // Collect all member names from any teams (there won't be any yet at signup stage)
        setPlayers([]);
      } catch {
        // ignore
      }
    };
    load();
  }, [tournamentId]);

  return (
    <div className="text-center text-slate-400 py-8">
      <Users className="w-12 h-12 mx-auto mb-3 text-slate-600" />
      <p className="text-lg font-semibold text-slate-300">Sign-ups are open!</p>
      <p className="text-sm mt-1">
        Join on Discord with <code className="bg-slate-800 px-1.5 py-0.5 rounded text-purple-300">/tournament signup</code>
        {" "}or Twitch with <code className="bg-slate-800 px-1.5 py-0.5 rounded text-purple-300">!signup</code>
      </p>
    </div>
  );
}

// --- Main page ----------------------------------------------------------

export default function Tournament() {
  const { loggedIn, userData, isLoading: authLoading } = useAuth();
  const isAdmin = loggedIn && userData && ADMIN_DISCORD_IDS.includes(userData.userId);

  const [data, setData] = useState<BracketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Admin-only data
  const [adminSignups, setAdminSignups] = useState<Signup[]>([]);
  const [adminPreTeams, setAdminPreTeams] = useState<PreTeam[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const params = GUILD_ID ? { guild_id: GUILD_ID } : {};
      const { data: res } = await axios.get<BracketData>(`${API_URL}/api/tournament`, { params });
      if (res?.tournament) {
        setData(res);
        setLastUpdated(new Date());
        setError(null);
      } else {
        setData(null);
      }
    } catch {
      setError("Could not load tournament data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAdminData = useCallback(async () => {
    if (!GUILD_ID) return;
    try {
      const { data: res } = await axios.get(`${API_URL}/api/tournament/admin`, {
        params: { guild_id: GUILD_ID },
        withCredentials: true,
      });
      setAdminSignups(res.signups ?? []);
      setAdminPreTeams(res.pre_teams ?? []);
    } catch {
      // Admin data fetch is best-effort
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
      const id = setInterval(fetchAdminData, POLL_MS);
      return () => clearInterval(id);
    }
  }, [isAdmin, fetchAdminData]);

  const handleAdminRefresh = useCallback(() => {
    fetchData();
    fetchAdminData();
  }, [fetchData, fetchAdminData]);

  const tournament = data?.tournament;
  const rounds = data?.rounds ?? [];
  const totalRounds = rounds.length;

  return (
    <PageWrapper>
      <Helmet>
        <title>Tournament — sneakyofficial.com</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-8">
          <Trophy className="w-8 h-8 text-yellow-400 shrink-0" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">
              {tournament ? tournament.name : "Community Tournament"}
            </h1>
            {tournament && (
              <div className="flex items-center gap-3 mt-1">
                <StatusBadge status={tournament.status} />
                {lastUpdated && (
                  <span className="text-xs text-slate-500">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Admin login hint */}
          {!authLoading && !loggedIn && (
            <a
              href={`${API_URL}/api/auth/discord/login`}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" /> Admin login
            </a>
          )}
          {!authLoading && loggedIn && !isAdmin && (
            <span className="text-xs text-slate-600">{userData?.profileName}</span>
          )}
        </div>

        {/* Admin panel */}
        {isAdmin && tournament && (
          <AdminPanel
            tournament={tournament}
            signups={adminSignups}
            preTeams={adminPreTeams}
            onRefresh={handleAdminRefresh}
          />
        )}
        {isAdmin && !tournament && (
          <AdminPanel
            tournament={{ id: 0, name: "No active tournament", status: "signup" }}
            signups={[]}
            preTeams={[]}
            onRefresh={handleAdminRefresh}
          />
        )}

        {/* States */}
        {loading && (
          <div className="text-slate-400 text-center py-16 text-sm">Loading bracket…</div>
        )}

        {!loading && error && (
          <div className="text-red-400 text-center py-16 text-sm">{error}</div>
        )}

        {!loading && !error && !tournament && (
          <div className="text-center py-16">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-slate-700" />
            <p className="text-slate-400 text-lg">No tournament is currently active.</p>
            <p className="text-slate-500 text-sm mt-1">Check back during a stream!</p>
          </div>
        )}

        {/* Sign-up mode */}
        {tournament?.status === "signup" && (
          <>
            {tournament.team_size && tournament.team_size !== 4 && (
              <p className="text-center text-sm text-purple-300 mb-2">Format: {tournament.team_size}v{tournament.team_size}</p>
            )}
            <SignupList tournamentId={tournament.id} />
          </>
        )}

        {/* Bracket */}
        {tournament && rounds.length > 0 && (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-8 items-start min-w-max px-2">
              {rounds.map((r) => (
                <RoundColumn
                  key={r.round}
                  round={r.round}
                  matches={r.matches}
                  totalRounds={totalRounds}
                  schedule={r.schedule}
                />
              ))}
            </div>
          </div>
        )}

        {/* Winner announcement */}
        {tournament?.status === "complete" && rounds.length > 0 && (() => {
          const finalRound = rounds[rounds.length - 1];
          const finalMatch = finalRound?.matches[0];
          const winner = finalMatch?.winner_id === finalMatch?.team1?.id
            ? finalMatch?.team1
            : finalMatch?.team2;
          return winner ? (
            <div className="mt-8 rounded-xl border border-yellow-500/40 bg-yellow-900/10 p-6 text-center">
              <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
              <p className="text-xl font-bold text-yellow-300">🏆 {winner.name} wins the tournament!</p>
              <p className="text-sm text-slate-400 mt-1">{winner.members.join(" · ")}</p>
            </div>
          ) : null;
        })()}

        {/* Commands footer */}
        <div className="mt-10 border-t border-slate-800 pt-6 text-xs text-slate-500 space-y-1">
          <p><span className="text-slate-400">Discord:</span> /tournament signup · /tournament report · /tournament status</p>
          <p><span className="text-slate-400">Twitch:</span> !signup · !bracket · !confirm · !dispute</p>
          <p className="mt-2 text-slate-600">Bracket refreshes automatically every 30 seconds.</p>
        </div>
      </div>
    </PageWrapper>
  );
}
