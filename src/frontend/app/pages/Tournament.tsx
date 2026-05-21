import { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { Helmet } from "react-helmet";
import axios from "axios";
import { Trophy, Users, Clock, Swords, CheckCircle, AlertCircle, LogIn, Crown } from "lucide-react";
import PageWrapper from "../components/PageWrapper";
import AdminPanel, { type Signup, type PreTeam } from "../components/tournament/AdminPanel";
import { useAuth } from "../hooks/useAuth";
import { MODES, STAGES } from "../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const ADMIN_DISCORD_IDS = ["339866237922181121"];
const POLL_MS = 30_000;

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface PublicSignup {
  display_name: string;
  discord_id: string | null;
  twitch_username: string | null;
}

interface WsEvent {
  event: string;
  tournament_id?: number;
  match_id?: number;
  winner_team_id?: number;
  winner_name?: string;
  display_name?: string;
  discord_id?: string | null;
  twitch_username?: string | null;
  count?: number;
  signups?: PublicSignup[];
}

interface MyMatch {
  id: number;
  round: number;
  status: "pending" | "awaiting_confirmation";
  team1_id: number;
  team2_id: number;
  team1_name: string | null;
  team2_name: string | null;
  player_team_id: number;
  opposing_team_id: number;
  reported_winner_id: number | null;
}

const CARD_H  = 84; // estimated match-card height (px) used for gap maths
const R1_GAP  = 4;  // gap between cards in the outermost round (px)

// ---- Types ----------------------------------------------------------------

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
  special_rules?: string | null;
  affects_rating?: boolean;
  created_at: string;
}

interface BracketData {
  tournament: Tournament;
  rounds: Round[];
}

type RegisterMatchFn = (roundNum: number, matchNum: number, el: HTMLDivElement | null) => void;

// ---- Status badge ---------------------------------------------------------

function StatusBadge({ status }: { status: Tournament["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    signup:    { label: "Sign-ups open", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
    active:    { label: "In progress",   cls: "bg-green-500/20 text-green-300 border-green-500/40" },
    complete:  { label: "Completed",     cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
    cancelled: { label: "Cancelled",     cls: "bg-red-500/20 text-red-300 border-red-500/40" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-500/20 text-slate-300" };
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

// ---- Match status icon ----------------------------------------------------

function MatchStatusIcon({ status }: { status: Match["status"] }) {
  if (status === "complete")              return <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />;
  if (status === "awaiting_confirmation") return <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
}

// ---- Team slot inside a match card ----------------------------------------

function TeamSlot({
  team, isWinner, isBye, isRecentWinner = false, isRecentLoser = false,
}: {
  team: Team | null;
  isWinner: boolean;
  isBye?: boolean;
  isRecentWinner?: boolean;
  isRecentLoser?: boolean;
}) {
  if (isBye || !team) {
    return <div className="px-3 py-2 rounded text-slate-600 italic text-xs bg-slate-900/30">BYE</div>;
  }
  return (
    <div className={`px-3 py-2 rounded transition-all duration-500 ${
      isRecentWinner
        ? "bg-green-500/25 border border-green-400/60 text-green-100 scale-[1.02] shadow-green-500/20 shadow"
        : isRecentLoser
        ? "bg-red-500/15 border border-red-500/30 text-red-300 opacity-60"
        : isWinner
        ? "bg-green-500/15 border border-green-500/40 text-green-200"
        : "bg-slate-900/40 border border-slate-700/40 text-slate-300"
    }`}>
      <div className="flex items-center gap-1.5">
        {isWinner && <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />}
        {isRecentWinner && <span className="text-xs">🏆</span>}
        <span className="font-semibold text-sm truncate leading-tight">{team.name}</span>
      </div>
      <div className="text-xs text-slate-500 mt-0.5 truncate">{team.members.join(", ")}</div>
    </div>
  );
}

// ---- Match card -----------------------------------------------------------

function MatchCard({
  match,
  isFinal,
  roundNum,
  registerMatch,
  flashMatchId,
  recentWinnerTeamId,
}: {
  match: Match;
  isFinal: boolean;
  roundNum: number;
  registerMatch: RegisterMatchFn;
  flashMatchId: number | null;
  recentWinnerTeamId: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isFlashing = flashMatchId === match.id;

  useLayoutEffect(() => {
    if (ref.current) registerMatch(roundNum, match.match_number, ref.current);
    return () => registerMatch(roundNum, match.match_number, null);
  }, [roundNum, match.match_number, registerMatch]);

  const isBye      = match.is_bye;
  const awaitingT1 = !match.team1;
  const awaitingT2 = !match.team2 && !isBye;

  return (
    <div
      ref={ref}
      style={{ minHeight: CARD_H }}
      className={`rounded-lg border p-1.5 w-52 flex flex-col gap-1 shadow-lg transition-all duration-500 ${
        isFlashing
          ? "border-green-400/80 shadow-green-500/30 shadow-md scale-[1.03]"
          : isFinal
          ? "border-yellow-500/50 bg-yellow-900/10 shadow-yellow-900/10"
          : "border-slate-600/50 bg-slate-800/70"
      }`}
    >
      {isFinal && (
        <div className="text-center text-xs font-bold text-yellow-400/80 pb-0.5 tracking-widest uppercase">
          Final
        </div>
      )}

      {awaitingT1 ? (
        <div className="px-3 py-2 rounded bg-slate-900/30 text-slate-600 italic text-xs">TBD</div>
      ) : (
        <TeamSlot
          team={match.team1}
          isWinner={match.winner_id === match.team1?.id}
          isRecentWinner={recentWinnerTeamId === match.team1?.id && match.status === "complete"}
          isRecentLoser={isFlashing && match.winner_id !== null && match.winner_id !== match.team1?.id}
        />
      )}

      <div className="flex items-center gap-1 px-1">
        <div className="flex-1 border-t border-slate-700/30" />
        <div className="flex items-center gap-1 text-slate-600">
          <Swords className="w-3 h-3" />
          <MatchStatusIcon status={match.status} />
        </div>
        <div className="flex-1 border-t border-slate-700/30" />
      </div>

      {isBye ? (
        <TeamSlot team={null} isWinner={false} isBye />
      ) : awaitingT2 ? (
        <div className="px-3 py-2 rounded bg-slate-900/30 text-slate-600 italic text-xs">TBD</div>
      ) : (
        <TeamSlot
          team={match.team2}
          isWinner={match.winner_id === match.team2?.id}
          isRecentWinner={recentWinnerTeamId === match.team2?.id && match.status === "complete"}
          isRecentLoser={isFlashing && match.winner_id !== null && match.winner_id !== match.team2?.id}
        />
      )}
    </div>
  );
}

// ---- Round column ---------------------------------------------------------

function RoundColumn({
  round,
  matches,
  totalRounds,
  schedule,
  registerMatch,
  n1half,
  flashMatchId,
  recentWinnerTeamId,
}: {
  round: number;
  matches: Match[];
  totalRounds: number;
  schedule?: RoundSchedule | null;
  registerMatch: RegisterMatchFn;
  n1half: number;
  flashMatchId: number | null;
  recentWinnerTeamId: number | null;
}) {
  const isFinalRound = round === totalRounds;
  const modeData  = schedule?.mode_id    ? MODES.find((m) => m.id === schedule.mode_id)       : null;
  const stageData = schedule?.stage_name ? STAGES.find((s) => s.name === schedule.stage_name) : null;

  // Gap formula: ensure all columns in a half share the same total height
  const totalH  = n1half * CARD_H + Math.max(0, n1half - 1) * R1_GAP;
  const nrHalf  = matches.length;
  const gapPx   = nrHalf > 1 ? Math.max(R1_GAP, Math.round((totalH - nrHalf * CARD_H) / (nrHalf - 1))) : 0;

  const roundLabel =
    isFinalRound
      ? "Final"
      : round === totalRounds - 1 && totalRounds > 2
      ? "Semis"
      : `Round ${round}`;

  return (
    <div className="flex flex-col items-center min-w-[220px]">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
        {roundLabel}
      </div>

      {(stageData || modeData) && (
        <div className="flex flex-col items-center gap-1 mb-3 w-full">
          {stageData && (
            <img
              src={stageData.image}
              alt={stageData.name}
              className="w-full max-w-[200px] h-[52px] object-cover rounded-lg border border-slate-700/40"
            />
          )}
          {(schedule?.stage_name || modeData) && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              {modeData && (
                <div className="relative group">
                  <img src={modeData.icon} alt={modeData.name} className="w-4 h-4 object-contain" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {modeData.name}
                  </div>
                </div>
              )}
              {schedule?.stage_name && <span className="truncate max-w-[160px]">{schedule.stage_name}</span>}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col w-full" style={{ gap: `${gapPx}px` }}>
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            isFinal={isFinalRound}
            roundNum={round}
            registerMatch={registerMatch}
            flashMatchId={flashMatchId}
            recentWinnerTeamId={recentWinnerTeamId}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Bracket with SVG connector lines ------------------------------------

function BracketView({ rounds, totalRounds, flashMatchId, recentWinnerTeamId }: { rounds: Round[]; totalRounds: number; flashMatchId: number | null; recentWinnerTeamId: number | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const matchEls     = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerMatch: RegisterMatchFn = useCallback((roundNum, matchNum, el) => {
    const key = `${roundNum}-${matchNum}`;
    if (el) matchEls.current.set(key, el);
    else    matchEls.current.delete(key);
  }, []);

  const drawLines = useCallback(() => {
    const svg       = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const cRect = container.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${cRect.width} ${cRect.height}`);
    svg.setAttribute("width",  String(cRect.width));
    svg.setAttribute("height", String(cRect.height));
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const addPath = (d: string, gold = false) => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", gold ? "#d97706" : "#475569");
      p.setAttribute("stroke-width", gold ? "2" : "1.5");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p);
    };

    for (let r = 0; r < rounds.length - 1; r++) {
      const cur  = rounds[r];
      const next = rounds[r + 1];
      const gold = r === rounds.length - 2;

      for (let i = 0; i < next.matches.length; i++) {
        const mA = cur.matches[i * 2];
        const mB = cur.matches[i * 2 + 1];
        const mC = next.matches[i];
        if (!mA || !mC) continue;

        const elA = matchEls.current.get(`${cur.round}-${mA.match_number}`);
        const elC = matchEls.current.get(`${next.round}-${mC.match_number}`);
        if (!elA || !elC) continue;

        const rA = elA.getBoundingClientRect();
        const rC = elC.getBoundingClientRect();

        const xAl = rA.left  - cRect.left;
        const xAr = rA.right - cRect.left;
        const xCl = rC.left  - cRect.left;
        const xCr = rC.right - cRect.left;
        const xAcx = (xAl + xAr) / 2;
        const xCcx = (xCl + xCr) / 2;
        const yA   = rA.top + rA.height / 2 - cRect.top;
        const yC   = rC.top + rC.height / 2 - cRect.top;

        const elB = mB ? matchEls.current.get(`${cur.round}-${mB.match_number}`) : null;

        if (elB) {
          const rB  = elB.getBoundingClientRect();
          const xBl = rB.left  - cRect.left;
          const xBr = rB.right - cRect.left;
          const xBcx = (xBl + xBr) / 2;
          const yB   = rB.top + rB.height / 2 - cRect.top;

          const aLeft = xAcx < xCcx;
          const bLeft = xBcx < xCcx;

          if (aLeft && !bLeft) {
            // A on left, B on right → separate arms into opposite edges of Final
            const mL = xAr + (xCl - xAr) / 2;
            const mR = xCr + (xBl - xCr) / 2;
            addPath(`M ${xAr} ${yA} H ${mL} V ${yC} H ${xCl}`, gold);
            addPath(`M ${xBl} ${yB} H ${mR} V ${yC} H ${xCr}`, gold);
          } else if (!aLeft && !bLeft) {
            // Both right of C → reversed U-bracket
            const xMid = xCr + (xAl - xCr) / 2;
            addPath(`M ${xAl} ${yA} H ${xMid} V ${yB} H ${xBl}`, gold);
            addPath(`M ${xMid} ${yC} H ${xCr}`, gold);
          } else {
            // Both left of C → normal U-bracket
            const xMid = xAr + (xCl - xAr) / 2;
            addPath(`M ${xAr} ${yA} H ${xMid} V ${yB} H ${xBr}`, gold);
            addPath(`M ${xMid} ${yC} H ${xCl}`, gold);
          }
        } else {
          // Single feeder (bye edge-case)
          if (xAcx < xCcx) {
            const xMid = xAr + (xCl - xAr) / 2;
            addPath(`M ${xAr} ${yA} H ${xMid} V ${yC} H ${xCl}`, gold);
          } else {
            const xMid = xCr + (xAl - xCr) / 2;
            addPath(`M ${xAl} ${yA} H ${xMid} V ${yC} H ${xCr}`, gold);
          }
        }
      }
    }
  }, [rounds]);

  // Children's useLayoutEffect (match registration) runs before parent's, so refs are ready
  useLayoutEffect(() => { drawLines(); }, [drawLines]);

  useEffect(() => {
    const obs = new ResizeObserver(drawLines);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [drawLines]);

  const n1     = rounds[0]?.matches.length ?? 0;
  const n1half = Math.ceil(n1 / 2);

  // Split each round into left half and right half
  const leftRounds  = rounds.slice(0, totalRounds - 1);
  const finalRound  = rounds[totalRounds - 1];
  const rightRounds = [...rounds.slice(0, totalRounds - 1)].reverse();

  return (
    <div ref={containerRef} className="relative">
      <svg
        ref={svgRef}
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: "visible" }}
        aria-hidden="true"
      />
      {/* items-center vertically aligns shorter inner columns with the taller outer columns */}
      <div className="flex gap-10 items-center min-w-max py-6 px-4">
        {/* Left half: rounds fanning out left, first half of matches */}
        {leftRounds.map((r) => {
          const half = Math.ceil(r.matches.length / 2);
          return (
            <RoundColumn
              key={`L${r.round}`}
              round={r.round}
              matches={r.matches.slice(0, half)}
              totalRounds={totalRounds}
              schedule={r.schedule}
              registerMatch={registerMatch}
              n1half={n1half}
              flashMatchId={flashMatchId}
              recentWinnerTeamId={recentWinnerTeamId}
            />
          );
        })}

        {/* Final */}
        {finalRound && (
          <RoundColumn
            key="final"
            round={finalRound.round}
            matches={finalRound.matches}
            totalRounds={totalRounds}
            schedule={finalRound.schedule}
            registerMatch={registerMatch}
            n1half={1}
            flashMatchId={flashMatchId}
            recentWinnerTeamId={recentWinnerTeamId}
          />
        )}

        {/* Right half: rounds fanning out right (reversed), second half of matches */}
        {rightRounds.map((r) => {
          const half = Math.ceil(r.matches.length / 2);
          return (
            <RoundColumn
              key={`R${r.round}`}
              round={r.round}
              matches={r.matches.slice(half)}
              totalRounds={totalRounds}
              schedule={r.schedule}
              registerMatch={registerMatch}
              n1half={n1half}
              flashMatchId={flashMatchId}
              recentWinnerTeamId={recentWinnerTeamId}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---- Winner banner --------------------------------------------------------

function WinnerBanner({ team }: { team: Team }) {
  return (
    <div className="mb-8 rounded-2xl border border-yellow-500/40 bg-gradient-to-br from-yellow-950/70 via-amber-900/30 to-slate-900/50 backdrop-blur-sm p-8 text-center shadow-2xl shadow-yellow-900/20">
      <Crown className="w-14 h-14 text-yellow-400 mx-auto mb-3" />
      <p className="text-xs font-bold text-yellow-500/80 uppercase tracking-[0.3em] mb-2">
        Tournament Champion
      </p>
      <p className="text-3xl font-black text-white">{team.name}</p>
      <p className="text-sm text-slate-400 mt-2">{team.members.join(" · ")}</p>
    </div>
  );
}

// ---- Sign-up list ---------------------------------------------------------

function SignupList({ signups }: { signups: PublicSignup[] }) {
  return (
    <div className="py-10">
      <div className="text-center mb-6">
        <Users className="w-12 h-12 mx-auto mb-3 text-slate-600" />
        <p className="text-lg font-semibold text-slate-300">
          Sign-ups are open!{" "}
          {signups.length > 0 && (
            <span className="text-blue-400">({signups.length} signed up)</span>
          )}
        </p>
        <p className="text-sm mt-1 text-slate-400">
          Join on Discord with{" "}
          <code className="bg-slate-800 px-1.5 py-0.5 rounded text-purple-300">/tournament signup</code>
          {" "}or Twitch with{" "}
          <code className="bg-slate-800 px-1.5 py-0.5 rounded text-purple-300">!signup</code>
        </p>
      </div>
      {signups.length > 0 && (
        <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
          {signups.map((s, i) => (
            <div
              key={s.discord_id ?? s.twitch_username ?? i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-sm text-slate-300 animate-fade-in"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="truncate">{s.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Match report card (for logged-in players) ----------------------------

function MatchReportCard({
  match,
  loading,
  message,
  onReport,
  onConfirm,
  onDispute,
}: {
  match: MyMatch;
  loading: boolean;
  message: string | null;
  onReport: (result: "win" | "loss") => void;
  onConfirm: () => void;
  onDispute: () => void;
}) {
  const myTeamName   = match.player_team_id === match.team1_id ? match.team1_name : match.team2_name;
  const theirTeamName = match.player_team_id === match.team1_id ? match.team2_name : match.team1_name;
  const reportedWinnerIsMe = match.reported_winner_id === match.player_team_id;
  const reportedWinnerIsThem = match.reported_winner_id !== null && match.reported_winner_id !== match.player_team_id;

  return (
    <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-950/20 backdrop-blur-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-blue-300">Your Match</span>
        <span className="text-xs text-slate-500 ml-auto">Round {match.round}</span>
      </div>
      <p className="text-sm text-slate-300 mb-4">
        <span className="text-white font-semibold">{myTeamName ?? "Your Team"}</span>
        <span className="text-slate-500 mx-2">vs</span>
        <span className="text-white font-semibold">{theirTeamName ?? "Opponents"}</span>
      </p>

      {match.status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => onReport("win")}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-green-600/80 hover:bg-green-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            We Won
          </button>
          <button
            onClick={() => onReport("loss")}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-red-600/50 hover:bg-red-600/70 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            We Lost
          </button>
        </div>
      )}

      {match.status === "awaiting_confirmation" && reportedWinnerIsMe && (
        <p className="text-sm text-yellow-400/80 text-center py-1">
          ⏳ Waiting for {theirTeamName ?? "opponents"} to confirm...
        </p>
      )}

      {match.status === "awaiting_confirmation" && reportedWinnerIsThem && (
        <div>
          <p className="text-sm text-slate-400 mb-3">
            {theirTeamName ?? "Opponents"} reported a win. Do you confirm?
          </p>
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-green-600/80 hover:bg-green-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              ✅ Confirm
            </button>
            <button
              onClick={onDispute}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-red-600/50 hover:bg-red-600/70 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              ⚠️ Dispute
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="text-xs text-slate-400 mt-3 text-center">{message}</p>
      )}
    </div>
  );
}

// ---- Main page ------------------------------------------------------------

export default function Tournament() {
  const { loggedIn, userData, isLoading: authLoading } = useAuth();
  const isAdmin = loggedIn && userData && ADMIN_DISCORD_IDS.includes(userData.userId);

  const [data, setData]               = useState<BracketData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [adminSignups,    setAdminSignups]    = useState<Signup[]>([]);
  const [adminPreTeams,   setAdminPreTeams]   = useState<PreTeam[]>([]);
  const [adminDataLoaded, setAdminDataLoaded] = useState(false);

  const [publicSignups,       setPublicSignups]       = useState<PublicSignup[]>([]);
  const [flashMatchId,        setFlashMatchId]        = useState<number | null>(null);
  const [recentWinnerTeamId,  setRecentWinnerTeamId]  = useState<number | null>(null);
  const [myMatch,             setMyMatch]             = useState<MyMatch | null>(null);
  const [myMatchLoading,      setMyMatchLoading]      = useState(false);
  const [reportLoading,       setReportLoading]       = useState(false);
  const [reportMsg,           setReportMsg]           = useState<string | null>(null);

  const isAdminRef      = useRef(isAdmin);
  const fetchAdminDataRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const fetchDataRef      = useRef<() => Promise<void>>(() => Promise.resolve());
  isAdminRef.current = !!isAdmin;

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
      setAdminDataLoaded(true);
    } catch {
      setAdminDataLoaded(true);
    }
  }, []);

  const fetchMyMatch = useCallback(async () => {
    if (!GUILD_ID || !loggedIn) return;
    setMyMatchLoading(true);
    try {
      const { data: res } = await axios.get(`${API_URL}/api/tournament/my-match`, {
        params: { guild_id: GUILD_ID },
        withCredentials: true,
      });
      setMyMatch(res.match ?? null);
    } catch {
      setMyMatch(null);
    } finally {
      setMyMatchLoading(false);
    }
  }, [loggedIn]);

  const fetchMyMatchRef = useRef(fetchMyMatch);
  fetchAdminDataRef.current = fetchAdminData;
  fetchDataRef.current      = fetchData;
  fetchMyMatchRef.current   = fetchMyMatch;

  // WebSocket for real-time updates
  useEffect(() => {
    if (!GUILD_ID) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let dead = false;

    const connect = () => {
      if (dead) return;
      ws = new WebSocket(`${getWsUrl()}?guild_id=${GUILD_ID}`);

      ws.onmessage = (e: MessageEvent) => {
        try {
          const msg: WsEvent = JSON.parse(e.data as string);
          if (msg.event === "hello") {
            setPublicSignups(msg.signups ?? []);
          } else if (msg.event === "signup") {
            setPublicSignups((prev) => [
              ...prev,
              { display_name: msg.display_name!, discord_id: msg.discord_id ?? null, twitch_username: msg.twitch_username ?? null },
            ]);
            if (isAdminRef.current) fetchAdminDataRef.current();
          } else if (msg.event === "leave") {
            setPublicSignups((prev) =>
              prev.filter((s) => {
                if (msg.discord_id) return s.discord_id !== msg.discord_id;
                if (msg.twitch_username) return s.twitch_username !== msg.twitch_username;
                return true;
              })
            );
            if (isAdminRef.current) fetchAdminDataRef.current();
          } else if (msg.event === "match_reported") {
            fetchDataRef.current();
            fetchMyMatchRef.current();
          } else if (msg.event === "match_complete") {
            fetchDataRef.current().then(() => {
              if (msg.match_id != null) {
                setFlashMatchId(msg.match_id);
                setTimeout(() => setFlashMatchId(null), 2500);
              }
              if (msg.winner_team_id != null) {
                setRecentWinnerTeamId(msg.winner_team_id);
                setTimeout(() => setRecentWinnerTeamId(null), 3000);
              }
            });
            fetchMyMatchRef.current();
          } else if (msg.event === "tournament_locked" || msg.event === "tournament_cancelled") {
            fetchDataRef.current();
            fetchMyMatchRef.current();
            if (isAdminRef.current) fetchAdminDataRef.current();
          }
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        if (!dead) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    // Also fetch initial signup list via HTTP in case WS hello races
    axios.get<{ signups: PublicSignup[]; count: number }>(`${API_URL}/api/tournament/signups`, {
      params: { guild_id: GUILD_ID },
    }).then(({ data: res }) => {
      setPublicSignups(res.signups ?? []);
    }).catch(() => {});

    return () => {
      dead = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    if (isAdmin) {
      setAdminDataLoaded(false);
      fetchAdminData();
      const id = setInterval(fetchAdminData, POLL_MS);
      return () => clearInterval(id);
    }
  }, [isAdmin, fetchAdminData]);

  useEffect(() => {
    if (loggedIn && data?.tournament?.status === "active") {
      fetchMyMatch();
    } else {
      setMyMatch(null);
    }
  }, [loggedIn, data?.tournament?.status, fetchMyMatch]);

  const handleAdminRefresh = useCallback(() => {
    fetchData();
    fetchAdminData();
  }, [fetchData, fetchAdminData]);

  const handleReport = useCallback(async (result: "win" | "loss") => {
    if (!GUILD_ID) return;
    setReportLoading(true);
    setReportMsg(null);
    try {
      const { data: res } = await axios.post(`${API_URL}/api/tournament/report`, { guild_id: GUILD_ID, result }, { withCredentials: true });
      setReportMsg(res.message);
      if (res.ok) fetchMyMatch();
    } catch {
      setReportMsg("Failed to report result. Try again.");
    } finally {
      setReportLoading(false);
    }
  }, [fetchMyMatch]);

  const handleConfirm = useCallback(async () => {
    if (!myMatch) return;
    setReportLoading(true);
    setReportMsg(null);
    try {
      const { data: res } = await axios.post(`${API_URL}/api/tournament/confirm`, { match_id: myMatch.id }, { withCredentials: true });
      setReportMsg(res.message);
      if (res.ok) { setMyMatch(null); fetchData(); }
    } catch {
      setReportMsg("Failed to confirm. Try again.");
    } finally {
      setReportLoading(false);
    }
  }, [myMatch, fetchData]);

  const handleDispute = useCallback(async () => {
    if (!myMatch) return;
    setReportLoading(true);
    setReportMsg(null);
    try {
      const { data: res } = await axios.post(`${API_URL}/api/tournament/dispute`, { match_id: myMatch.id }, { withCredentials: true });
      setReportMsg(res.message);
      if (res.ok) fetchMyMatch();
    } catch {
      setReportMsg("Failed to dispute. Try again.");
    } finally {
      setReportLoading(false);
    }
  }, [myMatch, fetchMyMatch]);

  const handleAdminCancel = useCallback(() => {
    setData(null);
    setAdminSignups([]);
    setAdminPreTeams([]);
    fetchData();
    fetchAdminData();
  }, [fetchData, fetchAdminData]);

  const tournament  = data?.tournament;
  const rounds      = data?.rounds ?? [];
  const totalRounds = rounds.length;

  const winner = (() => {
    if (tournament?.status !== "complete" || rounds.length === 0) return null;
    const fm = rounds[rounds.length - 1]?.matches[0];
    if (!fm?.winner_id) return null;
    return fm.winner_id === fm.team1?.id ? fm.team1 : fm.team2;
  })();

  return (
    <PageWrapper>
      <Helmet>
        <title>Tournament — sneakyofficial.com</title>
      </Helmet>

      <div className="max-w-[1600px] mx-auto px-4 py-8">
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
          {!authLoading && !isAdmin && (
            <a
              href={`${API_URL}/api/auth/discord/login`}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" /> Admin login
            </a>
          )}
        </div>

        {/* Match report card — logged-in non-admin players in an active match */}
        {loggedIn && !isAdmin && !myMatchLoading && myMatch && (
          <MatchReportCard
            match={myMatch}
            loading={reportLoading}
            message={reportMsg}
            onReport={handleReport}
            onConfirm={handleConfirm}
            onDispute={handleDispute}
          />
        )}

        {/* Admin panel — single stable element; key changes only when the tournament changes */}
        {isAdmin && adminDataLoaded && (
          <AdminPanel
            key={tournament?.id ?? 0}
            tournament={tournament ?? { id: 0, name: "No active tournament", status: "signup" }}
            signups={tournament ? adminSignups : []}
            preTeams={tournament ? adminPreTeams : []}
            onRefresh={handleAdminRefresh}
            onCancel={handleAdminCancel}
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

        {/* Winner banner (above bracket when complete) */}
        {winner && <WinnerBanner team={winner} />}

        {/* Special rules banner */}
        {tournament?.special_rules && (
          <div className={`mb-6 rounded-xl border p-4 text-sm ${
            tournament.affects_rating === false
              ? "border-amber-600/40 bg-amber-900/10 text-amber-200"
              : "border-blue-600/40 bg-blue-900/10 text-blue-200"
          }`}>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-1">
                  Special Rules
                  {tournament.affects_rating === false && (
                    <span className="ml-2 text-xs font-normal text-amber-400">(does not affect rating)</span>
                  )}
                </p>
                <p className="text-slate-300 whitespace-pre-wrap">{tournament.special_rules}</p>
              </div>
            </div>
          </div>
        )}

        {/* Sign-up mode */}
        {tournament?.status === "signup" && (
          <>
            {tournament.team_size && tournament.team_size !== 4 && (
              <p className="text-center text-sm text-purple-300 mb-2">
                Format: {tournament.team_size}v{tournament.team_size}
              </p>
            )}
            <SignupList signups={publicSignups} />
          </>
        )}

        {/* Bracket */}
        {tournament && rounds.length > 0 && (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/60 backdrop-blur-sm shadow-2xl">
            <div className="overflow-x-auto p-6">
              <BracketView rounds={rounds} totalRounds={totalRounds} flashMatchId={flashMatchId} recentWinnerTeamId={recentWinnerTeamId} />
            </div>
          </div>
        )}

        {/* Commands footer */}
        <div className="mt-10 border-t border-slate-800 pt-6 text-xs text-slate-500 space-y-1">
          <p>
            <span className="text-slate-400">Discord:</span>{" "}
            /tournament signup · /tournament report · /tournament status
          </p>
          <p>
            <span className="text-slate-400">Twitch:</span>{" "}
            !signup · !bracket · !confirm · !dispute
          </p>
          <p className="mt-2 text-slate-600">Sign-ups and match results update in real time via WebSocket.</p>
        </div>
      </div>
    </PageWrapper>
  );
}
