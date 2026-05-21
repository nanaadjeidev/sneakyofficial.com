import { useState, useCallback, useRef, useEffect } from "react";
import axios from "axios";
import { Plus, Trash2, Lock, X, Trophy, RefreshCw, ChevronDown, ChevronUp, Users, Map as MapIcon, Pencil, Check, Crown, UserPlus, Swords } from "lucide-react";
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
  rank: number | null;
  rank_tier: number | null;
  splattag: string | null;
  is_sub?: boolean;
}

export const RANK_NAMES: Record<number, string> = {
  1: "Starter Squid", 2: "Amateur Squid", 3: "Cool Squid",
  4: "Pro Squid", 5: "Legendary Squid", 6: "God Squid",
};
export const RANK_EMOJIS: Record<number, string> = {
  1: "🦑", 2: "🦑🦑", 3: "⭐", 4: "⭐⭐", 5: "💎", 6: "👑",
};
export const TIER_ROMAN: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

export const RANK_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Unranked" },
  ...[1, 2, 3, 4, 5, 6].flatMap((r) =>
    [1, 2, 3].map((t) => ({
      value: `${r}-${t}`,
      label: `${RANK_EMOJIS[r]} ${RANK_NAMES[r]} ${TIER_ROMAN[t]}`,
    }))
  ),
];

export function rankScore(rank: number | null | undefined, tier: number | null | undefined): number {
  if (!rank) return 0;
  return (rank - 1) * 3 + (tier ?? 1);
}

export function rankLabel(rank: number | null | undefined, tier: number | null | undefined): string {
  if (!rank) return "Unranked";
  return `${RANK_EMOJIS[rank]} ${RANK_NAMES[rank]} ${TIER_ROMAN[tier ?? 1]}`;
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
  special_rules?: string | null;
  affects_rating?: boolean;
}

interface AdminMatch {
  id: number;
  round: number;
  match_number: number;
  team1: { id: number; name: string } | null;
  team2: { id: number; name: string } | null;
  status: string;
}

interface LocalTeam {
  localId: string; // temporary client-side id
  name: string;
  signupIds: number[];
  captainSignupId: number | null;
  subSignupIds: number[];
}

// ---- Helpers -------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2);

function buildLocalTeams(signups: Signup[], preTeams: PreTeam[]): { teams: LocalTeam[]; unassigned: number[] } {
  const teams: LocalTeam[] = preTeams.map((pt) => {
    const teamSignups = signups.filter((s) => s.assigned_team_id === pt.id);
    const mainIds = teamSignups.filter((s) => !s.is_sub).map((s) => s.id);
    const subIds  = teamSignups.filter((s) =>  s.is_sub).map((s) => s.id);
    // Restore captain: match captain_discord_id to signup discord_id
    const captainSignup = pt.captain_discord_id
      ? teamSignups.find((s) => s.discord_id === pt.captain_discord_id)
      : null;
    return {
      localId: String(pt.id),
      name: pt.team_name,
      signupIds: mainIds,
      captainSignupId: captainSignup?.id ?? null,
      subSignupIds: subIds,
    };
  });

  const assigned = new Set(teams.flatMap((t) => [...t.signupIds, ...t.subSignupIds]));
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
      <span className="truncate max-w-[120px]">{signup.display_name}</span>
      {signup.rank && (
        <span className="text-xs text-slate-400 shrink-0">{rankLabel(signup.rank, signup.rank_tier)}</span>
      )}
      {signup.twitch_username && !signup.rank && (
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
  onDropSub,
  onRemovePlayer,
  onRemoveSub,
  onRemoveTeam,
  onRename,
  onAutoFill,
  onSetCaptain,
  unassignedPool,
  teamSize,
}: {
  team: LocalTeam;
  signupsById: Map<number, Signup>;
  onDrop: (teamLocalId: string, signupId: number) => void;
  onDropSub: (teamLocalId: string, signupId: number) => void;
  onRemovePlayer: (teamLocalId: string, signupId: number) => void;
  onRemoveSub: (teamLocalId: string, signupId: number) => void;
  onRemoveTeam: (teamLocalId: string) => void;
  onRename: (teamLocalId: string, name: string) => void;
  onAutoFill: (teamLocalId: string) => void;
  onSetCaptain: (teamLocalId: string, signupId: number | null) => void;
  unassignedPool: number[];
  teamSize: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [subDragOver, setSubDragOver] = useState(false);
  const full = team.signupIds.length >= teamSize;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 transition-colors flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2">
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
          <button title="Auto-fill remaining spots" onClick={() => onAutoFill(team.localId)} className="text-slate-500 hover:text-blue-400 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => onRemoveTeam(team.localId)} className="text-slate-500 hover:text-red-400 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main roster drop zone */}
      <div
        className={`flex flex-col gap-1 min-h-[60px] rounded p-1 transition-colors ${
          dragOver && !full ? "bg-purple-900/20 ring-1 ring-purple-500/50" : ""
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
        {team.signupIds.map((sid) => {
          const s = signupsById.get(sid);
          if (!s) return null;
          const isCaptain = team.captainSignupId === sid;
          return (
            <div key={sid} className="flex items-center gap-1 group">
              <button
                title={isCaptain ? "Remove captain" : "Set as captain"}
                onClick={() => onSetCaptain(team.localId, isCaptain ? null : sid)}
                className={`shrink-0 transition-colors ${isCaptain ? "text-yellow-400 hover:text-slate-500" : "text-slate-700 hover:text-yellow-400 opacity-0 group-hover:opacity-100"}`}
              >
                <Crown className="w-3 h-3" />
              </button>
              <div className="flex-1 min-w-0">
                <PlayerPill
                  signup={s}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("signupId", String(sid))}
                  onRemove={() => onRemovePlayer(team.localId, sid)}
                />
              </div>
            </div>
          );
        })}
        {!full && (
          <div className="text-xs text-slate-600 italic text-center py-1">
            {dragOver ? "Drop here" : "Drag player here"}
          </div>
        )}
      </div>

      {/* Subs drop zone */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <UserPlus className="w-3 h-3 text-slate-600" />
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">Subs</span>
          {team.subSignupIds.length > 0 && (
            <span className="text-[10px] text-slate-500">({team.subSignupIds.length})</span>
          )}
        </div>
        <div
          className={`flex flex-col gap-1 min-h-[32px] rounded p-1 transition-colors border border-dashed ${
            subDragOver ? "border-blue-500/50 bg-blue-900/15" : "border-slate-700/40"
          }`}
          onDragOver={(e) => { e.preventDefault(); setSubDragOver(true); }}
          onDragLeave={() => setSubDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSubDragOver(false);
            const sid = parseInt(e.dataTransfer.getData("signupId"), 10);
            if (!isNaN(sid)) onDropSub(team.localId, sid);
          }}
        >
          {team.subSignupIds.map((sid) => {
            const s = signupsById.get(sid);
            if (!s) return null;
            return (
              <PlayerPill
                key={sid}
                signup={s}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("signupId", String(sid))}
                onRemove={() => onRemoveSub(team.localId, sid)}
              />
            );
          })}
          {team.subSignupIds.length === 0 && (
            <div className="text-[10px] text-slate-700 italic text-center py-0.5">
              {subDragOver ? "Drop sub here" : "Drag overflow players here"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Confirm modal -------------------------------------------------------

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  danger = false,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 max-w-sm w-full mx-4">
        <p className="text-sm text-slate-200 mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-300 hover:border-slate-400"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded text-white font-semibold ${
              danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-purple-600 hover:bg-purple-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Admin match reporter ------------------------------------------------

function AdminMatchReporter({ onRefresh, flash }: {
  onRefresh: () => void;
  flash: (text: string, ok: boolean) => void;
}) {
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [reporting, setReporting] = useState<number | null>(null);

  const fetchMatches = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament`, {
        params: { guild_id: GUILD_ID },
      });
      const pending: AdminMatch[] = (data.rounds ?? []).flatMap((r: { round: number; matches: AdminMatch[] }) =>
        r.matches
          .filter((m) => (m.status === "pending" || m.status === "awaiting_confirmation") && m.team1 && m.team2)
          .map((m) => ({ ...m, round: r.round }))
      );
      setMatches(pending);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  const reportWinner = async (matchId: number, winnerId: number) => {
    setReporting(matchId);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/match/complete`,
        { match_id: matchId, winner_team_id: winnerId },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) { await fetchMatches(); onRefresh(); }
    } catch {
      flash("Failed to report match.", false);
    } finally {
      setReporting(null);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-300">Pending Matches</span>
        <button onClick={fetchMatches} className="ml-auto text-slate-500 hover:text-slate-300">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {matches.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No pending matches.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {matches.map((m) => (
            <div key={m.id} className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">Round {m.round} · Match #{m.id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  m.status === "awaiting_confirmation"
                    ? "text-yellow-300 border-yellow-600/40 bg-yellow-900/20"
                    : "text-slate-400 border-slate-600/40"
                }`}>
                  {m.status === "awaiting_confirmation" ? "Awaiting confirm" : "Pending"}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => reportWinner(m.id, m.team1!.id)}
                  disabled={reporting === m.id}
                  className="flex-1 text-xs px-2 py-2 rounded border border-blue-700/50 bg-blue-900/20 text-blue-300 hover:bg-blue-900/40 disabled:opacity-50 truncate"
                >
                  {m.team1?.name ?? "Team 1"} wins
                </button>
                <button
                  onClick={() => reportWinner(m.id, m.team2!.id)}
                  disabled={reporting === m.id}
                  className="flex-1 text-xs px-2 py-2 rounded border border-purple-700/50 bg-purple-900/20 text-purple-300 hover:bg-purple-900/40 disabled:opacity-50 truncate"
                >
                  {m.team2?.name ?? "Team 2"} wins
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main panel ----------------------------------------------------------

export default function AdminPanel({
  tournament,
  signups,
  preTeams,
  onRefresh,
  onCancel,
}: {
  tournament: AdminTournament;
  signups: Signup[];
  preTeams: PreTeam[];
  onRefresh: () => void;
  onCancel: () => void;
}
) {
  const teamSize = tournament.team_size ?? 4;
  const signupsById = new Map(signups.map((s) => [s.id, s]));

  const init = buildLocalTeams(signups, preTeams);
  const [teams, setTeams]       = useState<LocalTeam[]>(init.teams);
  const [unassigned, setUnassigned] = useState<number[]>(init.unassigned);
  const emptyTeam = (): LocalTeam => ({ localId: uid(), name: "", signupIds: [], captainSignupId: null, subSignupIds: [] });
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [locking, setLocking] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newTeamSize, setNewTeamSize] = useState(4);
  const [newSpecialRules, setNewSpecialRules] = useState("");
  const [newAffectsRating, setNewAffectsRating] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ message: string; label: string; danger: boolean; action: () => void } | null>(null);

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  // Ref so drag callbacks can read current teams without stale closure values
  const teamsRef = useRef(teams);
  teamsRef.current = teams;

  // ---- Sync new/removed signups into the unassigned pool -----------------
  const prevSignupIdsRef = useRef<Set<number>>(new Set(signups.map((s) => s.id)));
  useEffect(() => {
    const incomingIds = new Set(signups.map((s) => s.id));
    const prev = prevSignupIdsRef.current;
    const added   = signups.filter((s) => !prev.has(s.id)).map((s) => s.id);
    const removed = new Set([...prev].filter((id) => !incomingIds.has(id)));
    prevSignupIdsRef.current = incomingIds;
    if (added.length > 0)
      setUnassigned((p) => [...p, ...added.filter((id) => !p.includes(id))]);
    if (removed.size > 0) {
      setTeams((p) => p.map((t) => ({
        ...t,
        signupIds:    t.signupIds.filter((id) => !removed.has(id)),
        subSignupIds: t.subSignupIds.filter((id) => !removed.has(id)),
        captainSignupId: removed.has(t.captainSignupId ?? -1) ? null : t.captainSignupId,
      })));
      setUnassigned((p) => p.filter((id) => !removed.has(id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signups]);

  // ---- Warn on unsaved changes -------------------------------------------
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ---- Drag from unassigned pool ----------------------------------------

  // Drop onto the unassigned pool — remove from any team and place back in pool
  const removeSignupFromAll = (signupId: number) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) => ({
      ...t,
      signupIds:       t.signupIds.filter((id) => id !== signupId),
      subSignupIds:    t.subSignupIds.filter((id) => id !== signupId),
      captainSignupId: t.captainSignupId === signupId ? null : t.captainSignupId,
    })));
    // ADD to pool (was incorrectly filtering it out)
    setUnassigned((prev) => prev.includes(signupId) ? prev : [...prev, signupId]);
  };

  const moveToTeam = useCallback((teamLocalId: string, signupId: number) => {
    // Read current state via ref to check capacity before touching anything
    const target = teamsRef.current.find((t) => t.localId === teamLocalId);
    if (!target || target.signupIds.length >= teamSize) return; // full — abort entirely
    setIsDirty(true);
    setTeams((prev) => {
      const stripped = prev.map((t) => ({
        ...t,
        signupIds:       t.signupIds.filter((id) => id !== signupId),
        subSignupIds:    t.subSignupIds.filter((id) => id !== signupId),
        captainSignupId: t.captainSignupId === signupId ? null : t.captainSignupId,
      }));
      return stripped.map((t) =>
        t.localId === teamLocalId ? { ...t, signupIds: [...t.signupIds, signupId] } : t
      );
    });
    setUnassigned((prev) => prev.filter((id) => id !== signupId));
  }, [teamSize]);

  const moveToSub = useCallback((teamLocalId: string, signupId: number) => {
    // Check target exists before modifying anything
    if (!teamsRef.current.find((t) => t.localId === teamLocalId)) return;
    setIsDirty(true);
    setTeams((prev) => {
      const stripped = prev.map((t) => ({
        ...t,
        signupIds:       t.signupIds.filter((id) => id !== signupId),
        subSignupIds:    t.subSignupIds.filter((id) => id !== signupId),
        captainSignupId: t.captainSignupId === signupId ? null : t.captainSignupId,
      }));
      return stripped.map((t) =>
        t.localId === teamLocalId && !t.subSignupIds.includes(signupId)
          ? { ...t, subSignupIds: [...t.subSignupIds, signupId] }
          : t
      );
    });
    setUnassigned((prev) => prev.filter((id) => id !== signupId));
  }, []);

  const removeFromTeam = useCallback((teamLocalId: string, signupId: number) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) =>
      t.localId === teamLocalId
        ? { ...t, signupIds: t.signupIds.filter((id) => id !== signupId), captainSignupId: t.captainSignupId === signupId ? null : t.captainSignupId }
        : t
    ));
    setUnassigned((prev) => (prev.includes(signupId) ? prev : [...prev, signupId]));
  }, []);

  const removeSubFromTeam = useCallback((teamLocalId: string, signupId: number) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) =>
      t.localId === teamLocalId ? { ...t, subSignupIds: t.subSignupIds.filter((id) => id !== signupId) } : t
    ));
    setUnassigned((prev) => (prev.includes(signupId) ? prev : [...prev, signupId]));
  }, []);

  const setCaptain = useCallback((teamLocalId: string, signupId: number | null) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) =>
      t.localId === teamLocalId ? { ...t, captainSignupId: signupId } : t
    ));
  }, []);

  const addTeam = () => {
    setIsDirty(true);
    setTeams((prev) => [...prev, emptyTeam()]);
  };

  const removeTeam = (localId: string) => {
    setIsDirty(true);
    const team = teams.find((t) => t.localId === localId);
    if (team) {
      const allIds = [...team.signupIds, ...team.subSignupIds];
      setUnassigned((prev) => [...prev, ...allIds.filter((id) => !prev.includes(id))]);
    }
    setTeams((prev) => prev.filter((t) => t.localId !== localId));
  };

  const renameTeam = (localId: string, name: string) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) => (t.localId === localId ? { ...t, name } : t)));
  };

  const autoFill = (localId: string) => {
    setIsDirty(true);
    const team = teams.find((t) => t.localId === localId);
    if (!team) return;
    const needed = teamSize - team.signupIds.length;
    if (needed <= 0) return;
    const toAdd = unassigned.slice(0, needed);
    setUnassigned((prev) => prev.slice(toAdd.length));
    setTeams((prev) => prev.map((t) => (t.localId === localId ? { ...t, signupIds: [...t.signupIds, ...toAdd] } : t)));
  };

  const autoAssignAll = () => {
    // Collect everyone: unassigned + anyone already in teams (full re-draft)
    const allPlayerIds = [
      ...unassigned,
      ...teams.flatMap((t) => [...t.signupIds, ...t.subSignupIds]),
    ];

    // Sort by rank score desc (best first); unranked (0) go last
    const sortedPool = [...new Set(allPlayerIds)].sort((a, b) => {
      const sA = rankScore(signupsById.get(a)?.rank, signupsById.get(a)?.rank_tier);
      const sB = rankScore(signupsById.get(b)?.rank, signupsById.get(b)?.rank_tier);
      return sB - sA;
    });

    // Snake-draft all players into new teams from scratch
    const numNew = Math.floor(sortedPool.length / teamSize);
    const leftover = sortedPool.slice(numNew * teamSize);
    const created: LocalTeam[] = Array.from({ length: numNew }, () => emptyTeam());

    sortedPool.slice(0, numNew * teamSize).forEach((sid, i) => {
      const round = Math.floor(i / numNew);
      const pos   = i % numNew;
      const idx   = round % 2 === 0 ? pos : numNew - 1 - pos;
      created[idx].signupIds.push(sid);
    });

    setIsDirty(true);
    setTeams(created);
    setUnassigned(leftover);
  };

  // ---- API calls ---------------------------------------------------------

  const saveTeams = async () => {
    setSaving(true);
    try {
      const payload = {
        tournament_id: tournament.id,
        teams: teams.map((t) => ({
          name: t.name,
          signup_ids: t.signupIds,
          captain_signup_id: t.captainSignupId ?? null,
          sub_signup_ids: t.subSignupIds,
        })),
      };
      const { data } = await axios.post(`${API_URL}/api/tournament/admin/teams`, payload, { withCredentials: true });
      flash(data.message, data.ok);
      if (data.ok) { setIsDirty(false); onRefresh(); }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      flash(msg ?? "Failed to save teams.", false);
    } finally {
      setSaving(false);
    }
  };

  const lockTournament = () => {
    setConfirmModal({
      message: "This will close sign-ups and generate the bracket. Continue?",
      label: "Lock & Generate",
      danger: false,
      action: async () => {
        setLocking(true);
        try {
          const { data } = await axios.post(`${API_URL}/api/tournament/admin/lock`, { guild_id: GUILD_ID }, { withCredentials: true });
          flash(data.message, data.ok);
          if (data.ok) onRefresh();
        } catch {
          flash("Failed to lock tournament.", false);
        } finally {
          setLocking(false);
        }
      },
    });
  };

  const createTournament = async () => {
    if (!newTournamentName.trim()) return;
    setCreating(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/create`,
        {
          guild_id: GUILD_ID,
          name: newTournamentName.trim(),
          team_size: newTeamSize,
          special_rules: newSpecialRules.trim() || null,
          affects_rating: newAffectsRating,
        },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) {
        setShowCreate(false);
        setNewTournamentName("");
        setNewSpecialRules("");
        setNewAffectsRating(true);
        onRefresh();
      }
    } catch {
      flash("Failed to create tournament.", false);
    } finally {
      setCreating(false);
    }
  };

  const cancelTournament = () => {
    setConfirmModal({
      message: `Cancel "${tournament.name}"? This cannot be undone.`,
      label: "Cancel Tournament",
      danger: true,
      action: async () => {
        setCancelling(true);
        try {
          const { data } = await axios.post(`${API_URL}/api/tournament/admin/cancel`, { guild_id: GUILD_ID }, { withCredentials: true });
          flash(data.message, data.ok);
          if (data.ok) {
            setTeams([]);
            setUnassigned([]);
            onCancel();
          }
        } catch {
          flash("Failed to cancel tournament.", false);
        } finally {
          setCancelling(false);
        }
      },
    });
  };

  // ---- Render ------------------------------------------------------------

  const isSignup = tournament.id !== 0 && tournament.status === "signup";

  return (
    <>
    {confirmModal && (
      <ConfirmModal
        message={confirmModal.message}
        confirmLabel={confirmModal.label}
        danger={confirmModal.danger}
        onConfirm={() => { setConfirmModal(null); confirmModal.action(); }}
        onCancel={() => setConfirmModal(null)}
      />
    )}
    <div className="rounded-xl border border-yellow-500/50 p-4 mb-8" style={{
      background: "linear-gradient(135deg, rgba(120, 80, 0, 0.28) 0%, rgba(60, 40, 0, 0.22) 50%, rgba(100, 60, 0, 0.26) 100%)",
      backdropFilter: "blur(28px) saturate(160%)",
      WebkitBackdropFilter: "blur(28px) saturate(160%)",
      boxShadow: "inset 0 1.5px 0 rgba(255, 210, 80, 0.18), inset 0 -1px 0 rgba(0,0,0,0.12), 0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255, 200, 50, 0.08)",
    }}>
      {/* Unsaved changes warning */}
      {isDirty && (
        <div className="mb-3 flex items-center gap-2 text-xs px-3 py-2 rounded bg-amber-900/30 border border-amber-600/40 text-amber-300">
          <span>Unsaved changes — click Save Teams to persist.</span>
        </div>
      )}
      {/* Admin header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <span className="font-bold text-yellow-300 text-sm">Admin Panel</span>
          <span className="text-slate-400 text-xs">- {tournament.name}</span>
          {tournament.special_rules && (
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
              tournament.affects_rating === false
                ? "bg-amber-900/30 text-amber-300 border-amber-600/40"
                : "bg-blue-900/30 text-blue-300 border-blue-600/40"
            }`}>
              {tournament.affects_rating === false ? "Special rules · no rating" : "Special rules"}
            </span>
          )}
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
        <div className="mb-4 p-3 rounded-lg border border-slate-700 bg-slate-800/40 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              className="flex-1 min-w-[160px] bg-slate-900/60 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400"
              placeholder="Tournament name…"
              value={newTournamentName}
              onChange={(e) => setNewTournamentName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !newSpecialRules && createTournament()}
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
            <button onClick={() => { setShowCreate(false); setNewSpecialRules(""); setNewAffectsRating(true); }} className="text-slate-500 hover:text-slate-300 px-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            className="w-full bg-slate-900/60 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400 resize-none"
            rows={2}
            placeholder="Special rules (optional) - e.g. no chargers, specific weapon restrictions..."
            value={newSpecialRules}
            onChange={(e) => setNewSpecialRules(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newAffectsRating}
              onChange={(e) => setNewAffectsRating(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <span>Counts towards rating &amp; normal tournament wins</span>
            {!newAffectsRating && (
              <span className="text-xs text-amber-400 ml-1">(special wins only)</span>
            )}
          </label>
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
                onDropSub={moveToSub}
                onRemovePlayer={removeFromTeam}
                onRemoveSub={removeSubFromTeam}
                onRemoveTeam={removeTeam}
                onRename={renameTeam}
                onAutoFill={autoFill}
                onSetCaptain={setCaptain}
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
                if (!isNaN(sid)) removeSignupFromAll(sid);
              }}
            >
              <p className="text-xs text-slate-500 mb-2">{unassigned.length} unassigned player(s) - drag into a team</p>
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

      {tournament.status === "active" && tournament.id !== 0 && (
        <AdminMatchReporter onRefresh={onRefresh} flash={flash} />
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
    </>
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

export interface ProfileRow {
  id: number;
  discord_id: string | null;
  display_name: string;
  twitch_username: string | null;
  twitch_native: boolean;
  splattag: string | null;
  rank: number | null;
  rank_tier: number | null;
  predicted_rank: number | null;
  predicted_rank_tier: number | null;
  rank_name: string;
  rank_emoji: string;
  rating: number;
  matches_won: number;
  matches_lost: number;
  win_rate: number;
  tournament_wins: number;
  tournaments_played: number;
}

function PlayerProfilesSection() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [rankSaving, setRankSaving] = useState<Record<string, boolean>>({});
  const [splattagEdit, setSplattagEdit] = useState<Record<string, string | null>>({});
  const [splattagSaving, setSplattagSaving] = useState<Record<string, boolean>>({});
  const [nativeToggling, setNativeToggling] = useState<Record<number, boolean>>({});
  const [discordEdit, setDiscordEdit] = useState<Record<number, string | null>>({});
  const discordSavingRef = useRef<Record<number, boolean>>({});
  const setDiscordSaving = (fn: (prev: Record<number, boolean>) => Record<number, boolean>) => {
    discordSavingRef.current = fn(discordSavingRef.current);
  };

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/players`, {
        params: q ? { search: q } : {},
        withCredentials: true,
      });
      setProfiles(data.players ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) load();
      return next;
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(search || undefined);
  };

  const setRank = async (playerId: number, value: string, rankType: "actual" | "predicted") => {
    const key = `${playerId}-${rankType}`;
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
        { rank, rank_tier, rank_type: rankType },
        { withCredentials: true },
      );
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p;
          if (rankType === "predicted") {
            return { ...p, predicted_rank: rank, predicted_rank_tier: rank_tier };
          }
          return { ...p, rank, rank_tier, rank_name: rank ? rankLabel(rank, rank_tier) : "Unranked" };
        })
      );
    } finally {
      setRankSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const saveSplattag = async (playerId: number) => {
    const key = String(playerId);
    const tag = splattagEdit[key]?.trim();
    if (!tag) return;
    setSplattagSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await axios.post(
        `${API_URL}/api/admin/player/${playerId}/splattag`,
        { splattag: tag },
        { withCredentials: true },
      );
      setProfiles((prev) => prev.map((p) => p.id === playerId ? { ...p, splattag: tag } : p));
      setSplattagEdit((prev) => ({ ...prev, [key]: null }));
    } catch {
      // leave edit open on failure
    } finally {
      setSplattagSaving((prev) => ({ ...prev, [key]: false }));
    }
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
        {profiles.length > 0 && (
          <span className="text-xs text-slate-600 ml-1">({profiles.length})</span>
        )}
      </button>

      {open && (
        <div className="mt-3">
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <input
              className="flex-1 bg-slate-900/60 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400"
              placeholder="Search by name, splattag, or Twitch…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-white">
              Search
            </button>
            {search && (
              <button type="button" onClick={() => { setSearch(""); load(); }} className="text-slate-500 hover:text-slate-300 px-1 text-xs">
                Clear
              </button>
            )}
          </form>

          {loading ? (
            <p className="text-xs text-slate-500 py-2">Loading…</p>
          ) : profiles.length === 0 ? (
            <p className="text-xs text-slate-600 py-2">No profiles found.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-900/40">
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Player</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Twitch</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Actual Rank</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Predicted Rank</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">W/L</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Tourneys</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-white">{p.display_name || "-"}</div>
                        {splattagEdit[String(p.id)] != null ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              autoFocus
                              value={splattagEdit[String(p.id)] ?? ""}
                              onChange={(e) => setSplattagEdit((prev) => ({ ...prev, [String(p.id)]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveSplattag(p.id);
                                if (e.key === "Escape") setSplattagEdit((prev) => ({ ...prev, [String(p.id)]: null }));
                              }}
                              placeholder="Name#1234"
                              className="w-28 bg-slate-900 border border-purple-500/60 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                            />
                            <button
                              onClick={() => saveSplattag(p.id)}
                              disabled={splattagSaving[String(p.id)]}
                              className="text-green-400 hover:text-green-300 disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setSplattagEdit((prev) => ({ ...prev, [String(p.id)]: null }))} className="text-slate-500 hover:text-slate-300">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-0.5 group">
                            <span className={p.splattag ? "text-slate-500" : "text-red-500/60 text-[10px]"}>
                              {p.splattag ?? "no tag"}
                            </span>
                            <button
                              onClick={() => setSplattagEdit((prev) => ({ ...prev, [String(p.id)]: p.splattag ?? "" }))}
                              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-purple-400 transition-opacity"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                        {discordEdit[p.id] != null ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              autoFocus
                              value={discordEdit[p.id] ?? ""}
                              onChange={(e) => setDiscordEdit((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              onKeyDown={async (e) => {
                                if (e.key === "Escape") { setDiscordEdit((prev) => ({ ...prev, [p.id]: null })); return; }
                                if (e.key !== "Enter") return;
                                const val = discordEdit[p.id]?.trim();
                                if (!val || !/^\d{17,20}$/.test(val)) return;
                                setDiscordSaving((prev) => ({ ...prev, [p.id]: true }));
                                try {
                                  const { data } = await axios.post(`${API_URL}/api/admin/player/${p.id}/discord`, { discord_id: val }, { withCredentials: true });
                                  if (data.ok) { setProfiles((prev) => prev.map((r) => r.id === p.id ? { ...r, discord_id: val } : r)); setDiscordEdit((prev) => ({ ...prev, [p.id]: null })); }
                                } finally { setDiscordSaving((prev) => ({ ...prev, [p.id]: false })); }
                              }}
                              placeholder="Discord ID (17-20 digits)"
                              className="w-36 bg-slate-900 border border-purple-500/60 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none font-mono"
                            />
                            <button
                              disabled={discordSavingRef.current[p.id] || !/^\d{17,20}$/.test(discordEdit[p.id]?.trim() ?? "")}
                              onClick={async () => {
                                const val = discordEdit[p.id]?.trim();
                                if (!val || !/^\d{17,20}$/.test(val)) return;
                                setDiscordSaving((prev) => ({ ...prev, [p.id]: true }));
                                try {
                                  const { data } = await axios.post(`${API_URL}/api/admin/player/${p.id}/discord`, { discord_id: val }, { withCredentials: true });
                                  if (data.ok) { setProfiles((prev) => prev.map((r) => r.id === p.id ? { ...r, discord_id: val } : r)); setDiscordEdit((prev) => ({ ...prev, [p.id]: null })); }
                                } finally { setDiscordSaving((prev) => ({ ...prev, [p.id]: false })); }
                              }}
                              className="text-green-400 hover:text-green-300 disabled:opacity-30"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setDiscordEdit((prev) => ({ ...prev, [p.id]: null }))} className="text-slate-500 hover:text-slate-300">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-0.5 group">
                            {p.discord_id ? (
                              <>
                                <AdminDiscordIcon />
                                <span className="font-mono text-slate-600 text-[10px] select-all">{p.discord_id}</span>
                              </>
                            ) : (
                              <span className="text-red-500/60 text-[10px]">no discord</span>
                            )}
                            <button
                              onClick={() => setDiscordEdit((prev) => ({ ...prev, [p.id]: "" }))}
                              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-purple-400 transition-opacity"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.twitch_username ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-purple-400 flex items-center gap-1"><AdminTwitchIcon />{p.twitch_username}</span>
                            <button
                              disabled={nativeToggling[p.id]}
                              onClick={async () => {
                                setNativeToggling((prev) => ({ ...prev, [p.id]: true }));
                                try {
                                  const { data } = await axios.post(`${API_URL}/api/admin/player/${p.id}/twitch-native/toggle`, {}, { withCredentials: true });
                                  if (data.ok) setProfiles((prev) => prev.map((r) => r.id === p.id ? { ...r, twitch_native: data.twitch_native } : r));
                                } finally {
                                  setNativeToggling((prev) => ({ ...prev, [p.id]: false }));
                                }
                              }}
                              className="text-left disabled:opacity-50"
                            >
                              {p.twitch_native
                                ? <span className="text-green-500 text-[10px] hover:text-green-300">✓ verified from Twitch</span>
                                : <span className="text-yellow-500/80 text-[10px] hover:text-yellow-400">⚠ linked via Discord only</span>
                              }
                            </button>
                          </div>
                        ) : <span className="text-red-500/60 text-[10px]">not linked</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={p.rank && p.rank_tier ? `${p.rank}-${p.rank_tier}` : ""}
                          disabled={rankSaving[`${p.id}-actual`]}
                          onChange={(e) => setRank(p.id, e.target.value, "actual")}
                          className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
                        >
                          {RANK_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={p.predicted_rank && p.predicted_rank_tier ? `${p.predicted_rank}-${p.predicted_rank_tier}` : ""}
                          disabled={rankSaving[`${p.id}-predicted`]}
                          onChange={(e) => setRank(p.id, e.target.value, "predicted")}
                          className="bg-slate-800 border border-slate-500/50 rounded px-1.5 py-0.5 text-xs text-slate-300 italic focus:outline-none focus:border-yellow-400 disabled:opacity-50"
                        >
                          {RANK_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="text-green-400">{p.matches_won}</span>
                        <span className="text-slate-600 mx-0.5">/</span>
                        <span className="text-red-400/80">{p.matches_lost}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.tournament_wins > 0 ? <span className="text-yellow-400">{p.tournament_wins} 🏆</span> : <span className="text-slate-600">{p.tournaments_played}</span>}
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

function AdminDiscordIcon() {
  return (
    <svg className="w-3 h-3 fill-current text-indigo-400 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.034.055a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
