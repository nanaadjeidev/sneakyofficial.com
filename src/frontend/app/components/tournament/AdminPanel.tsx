import { useState, useCallback } from "react";
import axios from "axios";
import { Plus, Trash2, Lock, X, Trophy, RefreshCw, ChevronDown, ChevronUp, Users, Map as MapIcon } from "lucide-react";
import MapModePicker, { type RoundMapMode } from "./MapModePicker";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

// ---- Types ---------------------------------------------------------------

export interface Signup {
  id: number;
  display_name: string;
  discord_id: string | null;
  twitch_username: string | null;
  assigned_team_id: number | null;
  rating: number;
}

export interface PreTeam {
  id: number;
  team_name: string;
  captain_discord_id: string | null;
  name_confirmed: boolean;
}

interface AdminTournament {
  id: number;
  name: string;
  status: string;
  team_size?: number;
}

interface LocalTeam {
  localId: string; // temporary client-side id
  name: string;
  signupIds: number[];
}

// ---- Helpers -------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2);

function buildLocalTeams(signups: Signup[], preTeams: PreTeam[]): { teams: LocalTeam[]; unassigned: number[] } {
  const teams: LocalTeam[] = preTeams.map((pt) => {
    const members = signups.filter((s) => s.assigned_team_id === pt.id).map((s) => s.id);
    return { localId: String(pt.id), name: pt.team_name, signupIds: members };
  });

  const assigned = new Set(teams.flatMap((t) => t.signupIds));
  const unassigned = signups.filter((s) => !assigned.has(s.id)).map((s) => s.id);

  return { teams, unassigned };
}

// ---- Drag ghost label ----------------------------------------------------

function PlayerPill({
  signup,
  onRemove,
  draggable,
  onDragStart,
}: {
  signup: Signup;
  onRemove?: () => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-700/60 border border-slate-600/50 text-sm text-slate-200 cursor-grab active:cursor-grabbing select-none"
    >
      <span className="truncate max-w-[140px]">{signup.display_name}</span>
      {signup.twitch_username && (
        <span className="text-xs text-purple-400 shrink-0">twitch</span>
      )}
      {onRemove && (
        <button onClick={onRemove} className="ml-auto text-slate-500 hover:text-red-400 shrink-0">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ---- Team slot -----------------------------------------------------------

function TeamSlot({
  team,
  signupsById,
  onDrop,
  onRemovePlayer,
  onRemoveTeam,
  onRename,
  onAutoFill,
  unassignedPool,
  teamSize,
}: {
  team: LocalTeam;
  signupsById: Map<number, Signup>;
  onDrop: (teamLocalId: string, signupId: number) => void;
  onRemovePlayer: (teamLocalId: string, signupId: number) => void;
  onRemoveTeam: (teamLocalId: string) => void;
  onRename: (teamLocalId: string, name: string) => void;
  onAutoFill: (teamLocalId: string) => void;
  unassignedPool: number[];
  teamSize: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const full = team.signupIds.length >= teamSize;

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        dragOver && !full
          ? "border-purple-500/70 bg-purple-900/20"
          : "border-slate-700/50 bg-slate-800/30"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const sid = parseInt(e.dataTransfer.getData("signupId"), 10);
        if (!isNaN(sid)) onDrop(team.localId, sid);
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <input
          className="flex-1 bg-transparent border-b border-slate-600 text-sm font-semibold text-white focus:outline-none focus:border-purple-400 pb-0.5 min-w-0"
          value={team.name}
          placeholder="Team name…"
          onChange={(e) => onRename(team.localId, e.target.value)}
        />
        <span className={`text-xs shrink-0 ${full ? "text-green-400" : "text-slate-500"}`}>
          {team.signupIds.length}/{teamSize}
        </span>
        {!full && unassignedPool.length > 0 && (
          <button
            title="Auto-fill remaining spots"
            onClick={() => onAutoFill(team.localId)}
            className="text-slate-500 hover:text-blue-400 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => onRemoveTeam(team.localId)} className="text-slate-500 hover:text-red-400 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Members */}
      <div className="flex flex-col gap-1 min-h-[60px]">
        {team.signupIds.map((sid) => {
          const s = signupsById.get(sid);
          if (!s) return null;
          return (
            <PlayerPill
              key={sid}
              signup={s}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("signupId", String(sid))}
              onRemove={() => onRemovePlayer(team.localId, sid)}
            />
          );
        })}
        {!full && (
          <div className="text-xs text-slate-600 italic text-center py-1">
            {dragOver ? "Drop here" : "Drag player here"}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main panel ----------------------------------------------------------

export default function AdminPanel({
  tournament,
  signups,
  preTeams,
  onRefresh,
}: {
  tournament: AdminTournament;
  signups: Signup[];
  preTeams: PreTeam[];
  onRefresh: () => void;
}) {
  const teamSize = tournament.team_size ?? 4;
  const signupsById = new Map(signups.map((s) => [s.id, s]));

  const init = buildLocalTeams(signups, preTeams);
  const [teams, setTeams] = useState<LocalTeam[]>(init.teams);
  const [unassigned, setUnassigned] = useState<number[]>(init.unassigned);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newTeamSize, setNewTeamSize] = useState(4);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  // ---- Drag from unassigned pool ----------------------------------------

  const moveToTeam = useCallback((teamLocalId: string, signupId: number) => {
    // Remove from any current team first
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        signupIds: t.signupIds.filter((id) => id !== signupId),
      }))
    );
    setUnassigned((prev) => prev.filter((id) => id !== signupId));

    setTeams((prev) => {
      const target = prev.find((t) => t.localId === teamLocalId);
      if (!target || target.signupIds.length >= teamSize) return prev;
      return prev.map((t) =>
        t.localId === teamLocalId ? { ...t, signupIds: [...t.signupIds, signupId] } : t
      );
    });
  }, [teamSize]);

  const removeFromTeam = useCallback((teamLocalId: string, signupId: number) => {
    setTeams((prev) =>
      prev.map((t) =>
        t.localId === teamLocalId ? { ...t, signupIds: t.signupIds.filter((id) => id !== signupId) } : t
      )
    );
    setUnassigned((prev) => (prev.includes(signupId) ? prev : [...prev, signupId]));
  }, []);

  const addTeam = () => {
    setTeams((prev) => [...prev, { localId: uid(), name: "", signupIds: [] }]);
  };

  const removeTeam = (localId: string) => {
    const team = teams.find((t) => t.localId === localId);
    if (team) setUnassigned((prev) => [...prev, ...team.signupIds.filter((id) => !prev.includes(id))]);
    setTeams((prev) => prev.filter((t) => t.localId !== localId));
  };

  const renameTeam = (localId: string, name: string) => {
    setTeams((prev) => prev.map((t) => (t.localId === localId ? { ...t, name } : t)));
  };

  const autoFill = (localId: string) => {
    const team = teams.find((t) => t.localId === localId);
    if (!team) return;
    const needed = teamSize - team.signupIds.length;
    if (needed <= 0) return;
    const toAdd = unassigned.slice(0, needed);
    setUnassigned((prev) => prev.slice(toAdd.length));
    setTeams((prev) => prev.map((t) => (t.localId === localId ? { ...t, signupIds: [...t.signupIds, ...toAdd] } : t)));
  };

  const autoAssignAll = () => {
    // Sort pool by rating descending (best players first) for snake draft
    const sortedPool = [...unassigned].sort((a, b) => {
      const rA = signupsById.get(a)?.rating ?? 25;
      const rB = signupsById.get(b)?.rating ?? 25;
      return rB - rA;
    });

    // Deep-copy existing teams so we don't mutate state
    const newTeams: LocalTeam[] = teams.map((t) => ({ ...t, signupIds: [...t.signupIds] }));

    // Fill incomplete existing teams first (top of sorted pool)
    let poolIdx = 0;
    for (const t of newTeams) {
      while (t.signupIds.length < teamSize && poolIdx < sortedPool.length) {
        t.signupIds.push(sortedPool[poolIdx++]);
      }
    }

    // Snake-draft remaining players into new teams
    const remaining = sortedPool.slice(poolIdx);
    const numNew = Math.floor(remaining.length / teamSize);
    const leftover = remaining.slice(numNew * teamSize);
    const created: LocalTeam[] = Array.from({ length: numNew }, () => ({ localId: uid(), name: "", signupIds: [] }));

    remaining.slice(0, numNew * teamSize).forEach((sid, i) => {
      const round = Math.floor(i / numNew);
      const pos   = i % numNew;
      const idx   = round % 2 === 0 ? pos : numNew - 1 - pos;
      created[idx].signupIds.push(sid);
    });

    setTeams([...newTeams, ...created]);
    setUnassigned(leftover);
  };

  // ---- API calls ---------------------------------------------------------

  const saveTeams = async () => {
    setSaving(true);
    try {
      const payload = {
        tournament_id: tournament.id,
        teams: teams.map((t) => ({ name: t.name, signup_ids: t.signupIds })),
      };
      const { data } = await axios.post(`${API_URL}/api/tournament/admin/teams`, payload, { withCredentials: true });
      flash(data.message, data.ok);
      if (data.ok) onRefresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      flash(msg ?? "Failed to save teams.", false);
    } finally {
      setSaving(false);
    }
  };

  const lockTournament = async () => {
    if (!confirm("This will close sign-ups and generate the bracket. Continue?")) return;
    setLocking(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/tournament/admin/lock`, { guild_id: parseInt(GUILD_ID) }, { withCredentials: true });
      flash(data.message, data.ok);
      if (data.ok) onRefresh();
    } catch {
      flash("Failed to lock tournament.", false);
    } finally {
      setLocking(false);
    }
  };

  const createTournament = async () => {
    if (!newTournamentName.trim()) return;
    setCreating(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/create`,
        { guild_id: parseInt(GUILD_ID), name: newTournamentName.trim(), team_size: newTeamSize },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) { setShowCreate(false); setNewTournamentName(""); onRefresh(); }
    } catch {
      flash("Failed to create tournament.", false);
    } finally {
      setCreating(false);
    }
  };

  const cancelTournament = async () => {
    if (!confirm(`Cancel "${tournament.name}"? This cannot be undone.`)) return;
    setCancelling(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/tournament/admin/cancel`, { guild_id: parseInt(GUILD_ID) }, { withCredentials: true });
      flash(data.message, data.ok);
      if (data.ok) onRefresh();
    } catch {
      flash("Failed to cancel tournament.", false);
    } finally {
      setCancelling(false);
    }
  };

  // ---- Render ------------------------------------------------------------

  const isSignup = tournament.status === "signup";

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-900/10 p-4 mb-8">
      {/* Admin header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <span className="font-bold text-yellow-300 text-sm">Admin Panel</span>
          <span className="text-slate-400 text-xs">— {tournament.name}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:border-slate-400"
            >
              New Tournament
            </button>
          )}
          {tournament.id !== 0 && (
            <button
              onClick={cancelTournament}
              disabled={cancelling}
              className="text-xs px-3 py-1.5 rounded border border-red-700/50 text-red-400 hover:border-red-500 disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel Tournament"}
            </button>
          )}
        </div>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`mb-3 text-sm px-3 py-2 rounded ${msg.ok ? "bg-green-900/40 text-green-300 border border-green-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
          {msg.text}
        </div>
      )}

      {/* Create new tournament form */}
      {showCreate && (
        <div className="mb-4 p-3 rounded-lg border border-slate-700 bg-slate-800/40 flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-[160px] bg-slate-900/60 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400"
            placeholder="Tournament name…"
            value={newTournamentName}
            onChange={(e) => setNewTournamentName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTournament()}
          />
          <select
            className="bg-slate-900/60 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400"
            value={newTeamSize}
            onChange={(e) => setNewTeamSize(parseInt(e.target.value))}
            title="Team size"
          >
            <option value={4}>4v4</option>
            <option value={3}>3v3</option>
            <option value={2}>2v2</option>
          </select>
          <button onClick={createTournament} disabled={creating} className="px-3 py-1.5 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50">
            {creating ? "…" : "Create"}
          </button>
          <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-300 px-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Team builder (signup phase only) */}
      {isSignup && (
        <>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-xs text-slate-400">
              Drag players into teams · Teams need exactly {teamSize} players ({teamSize}v{teamSize})
            </p>
            <div className="flex gap-2">
              <button onClick={autoAssignAll} className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-300 hover:border-slate-400">
                Auto-assign all
              </button>
              <button onClick={addTeam} className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-300 hover:border-slate-400 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add team
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
            {teams.map((team) => (
              <TeamSlot
                key={team.localId}
                team={team}
                signupsById={signupsById}
                onDrop={moveToTeam}
                onRemovePlayer={removeFromTeam}
                onRemoveTeam={removeTeam}
                onRename={renameTeam}
                onAutoFill={autoFill}
                unassignedPool={unassigned}
                teamSize={teamSize}
              />
            ))}
          </div>

          {/* Unassigned pool */}
          {unassigned.length > 0 && (
            <div
              className="rounded-lg border border-dashed border-slate-600/60 p-3 mb-4"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const sid = parseInt(e.dataTransfer.getData("signupId"), 10);
                if (!isNaN(sid)) {
                  setTeams((prev) => prev.map((t) => ({ ...t, signupIds: t.signupIds.filter((id) => id !== sid) })));
                  setUnassigned((prev) => (prev.includes(sid) ? prev : [...prev, sid]));
                }
              }}
            >
              <p className="text-xs text-slate-500 mb-2">{unassigned.length} unassigned player(s) — drag into a team</p>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((sid) => {
                  const s = signupsById.get(sid);
                  if (!s) return null;
                  return (
                    <PlayerPill
                      key={sid}
                      signup={s}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("signupId", String(sid))}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={saveTeams}
              disabled={saving}
              className="px-4 py-2 text-sm rounded bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Teams"}
            </button>
            <button
              onClick={lockTournament}
              disabled={locking}
              className="px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              {locking ? "Locking…" : "Lock & Generate Bracket"}
            </button>
          </div>
        </>
      )}

      {tournament.status === "active" && (
        <p className="text-sm text-slate-400">
          Tournament is in progress. Use{" "}
          <code className="text-purple-300 bg-slate-800 px-1 rounded">/tournament report</code> in Discord or{" "}
          <code className="text-purple-300 bg-slate-800 px-1 rounded">!confirm</code> on Twitch to submit results.
          <br />
          To force-complete a match, use the Discord command{" "}
          <code className="text-purple-300 bg-slate-800 px-1 rounded">/tournament admin-complete</code>.
        </p>
      )}

      {tournament.id !== 0 && (
        <RoundScheduleSection
          tournamentId={tournament.id}
          signupCount={signups.length}
          teamSize={teamSize}
        />
      )}

      <PlayerProfilesSection />
    </div>
  );
}

// ---- Round schedule panel ------------------------------------------------

function RoundScheduleSection({ tournamentId, signupCount, teamSize }: {
  tournamentId: number;
  signupCount: number;
  teamSize: number;
}) {
  const [open, setOpen] = useState(false);
  const [rounds, setRounds] = useState(0);
  const [schedule, setSchedule] = useState<RoundMapMode[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const estimatedRounds = Math.ceil(Math.log2(Math.max(Math.floor(signupCount / teamSize), 2)));
  const [manualRounds, setManualRounds] = useState(estimatedRounds);

  const displayRounds = rounds > 0 ? rounds : manualRounds;

  const load = useCallback(async () => {
    if (loaded) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament`, { params: { id: tournamentId } });
      const r: number = data.rounds?.length ?? 0;
      setRounds(r);
      const existing: RoundMapMode[] = (data.rounds ?? []).map((rd: { round: number; schedule?: { stage_name?: string; mode_id?: string; mode_name?: string } }) => ({
        round: rd.round,
        stage: rd.schedule?.stage_name
          ? { name: rd.schedule.stage_name, image: "" }
          : null,
        mode: rd.schedule?.mode_id
          ? { id: rd.schedule.mode_id, name: rd.schedule.mode_name ?? "", icon: "" }
          : null,
      }));
      setSchedule(existing);
      setLoaded(true);
    } catch { /* best-effort */ }
  }, [loaded, tournamentId]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        tournament_id: tournamentId,
        schedule: schedule.map((r) => ({
          round: r.round,
          stage_name: r.stage?.name ?? null,
          mode_id: r.mode?.id ?? null,
          mode_name: r.mode?.name ?? null,
        })),
      };
      const { data } = await axios.post(`${API_URL}/api/tournament/admin/schedule`, payload, { withCredentials: true });
      setMsg({ text: data.message, ok: data.ok });
      setTimeout(() => setMsg(null), 3500);
    } catch {
      setMsg({ text: "Failed to save schedule.", ok: false });
      setTimeout(() => setMsg(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-700/40 pt-4">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <MapIcon className="w-4 h-4" />
        <span className="font-medium">Round Schedule</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-3">
          {rounds === 0 && (
            <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
              <span>Estimated rounds:</span>
              <input
                type="number"
                min={1}
                max={8}
                value={manualRounds}
                onChange={(e) => setManualRounds(Math.max(1, Math.min(8, Number(e.target.value))))}
                className="w-12 px-1 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
              />
              {signupCount > 0 && (
                <span className="text-slate-500">
                  ({Math.floor(signupCount / teamSize)} teams signed up)
                </span>
              )}
            </div>
          )}
          {msg && (
            <div className={`mb-3 text-xs px-3 py-2 rounded ${msg.ok ? "bg-green-900/40 text-green-300 border border-green-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
              {msg.text}
            </div>
          )}
          <MapModePicker rounds={displayRounds} value={schedule} onChange={setSchedule} />
          <button
            onClick={save}
            disabled={saving}
            className="mt-3 px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Schedule"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Player profiles panel (admin-only) ----------------------------------

interface ProfileRow {
  discord_id: string;
  display_name: string;
  twitch_username: string | null;
  splattag: string | null;
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
  1: "text-slate-400",
  2: "text-green-400",
  3: "text-blue-400",
  4: "text-purple-400",
  5: "text-amber-400",
  6: "text-yellow-300",
};

function PlayerProfilesSection() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/leaderboard`, {
        params: { sort: "rating", limit: 100 },
      });
      setProfiles(data.leaderboard ?? []);
      setLoaded(true);
    } catch {
      // silently fail — admin can retry by toggling
    } finally {
      setLoading(false);
    }
  }, [loaded]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) load();
      return next;
    });
  };

  return (
    <div className="mt-4 border-t border-slate-700/40 pt-4">
      <button
        onClick={toggle}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <Users className="w-4 h-4" />
        <span className="font-medium">Player Profiles</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {loaded && (
          <span className="text-xs text-slate-600 ml-1">({profiles.length})</span>
        )}
      </button>

      {open && (
        <div className="mt-3">
          {loading ? (
            <p className="text-xs text-slate-500 py-2">Loading profiles…</p>
          ) : profiles.length === 0 ? (
            <p className="text-xs text-slate-600 py-2">No ranked players yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-900/40">
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Player</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Discord ID</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Twitch</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Rank</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Rating</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">W/L</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Win%</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Tourneys</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p, _i) => (
                    <tr
                      key={p.discord_id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/20 last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-white">{p.display_name || "—"}</div>
                        {p.splattag && (
                          <div className="text-slate-500 mt-0.5">{p.splattag}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-400 select-all">{p.discord_id}</td>
                      <td className="px-3 py-2">
                        {p.twitch_username ? (
                          <span className="text-purple-400 flex items-center gap-1">
                            <AdminTwitchIcon />
                            {p.twitch_username}
                          </span>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`font-medium ${p.rank ? (RANK_COLORS[p.rank] ?? "text-slate-400") : "text-slate-600"}`}>
                          {p.rank_emoji} {p.rank_name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200 tabular-nums">{p.rating.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="text-green-400">{p.matches_won}</span>
                        <span className="text-slate-600 mx-0.5">/</span>
                        <span className="text-red-400/80">{p.matches_lost}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{p.win_rate}%</td>
                      <td className="px-3 py-2 text-right">
                        {p.tournament_wins > 0 ? (
                          <span className="text-yellow-400">{p.tournament_wins} 🏆</span>
                        ) : (
                          <span className="text-slate-700">{p.tournaments_played}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminTwitchIcon() {
  return (
    <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}
