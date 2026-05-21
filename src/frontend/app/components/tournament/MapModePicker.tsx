import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { STAGES, MODES, type Stage, type Mode } from "./splatoonData";

export interface RoundMapMode {
  round: number;
  stage: Stage | null;
  mode: Mode | null;
  best_of: number;
}

interface Props {
  rounds: number;
  value: RoundMapMode[];
  onChange: (v: RoundMapMode[]) => void;
}

function getRoundLabel(round: number, total: number): string {
  if (round === total) return "Final";
  if (round === total - 1 && total > 2) return "Semi-Finals";
  return `Round ${round}`;
}

// ---- Stage picker dropdown -----------------------------------------------

function StagePicker({ value, onChange }: { value: Stage | null; onChange: (s: Stage | null) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = STAGES.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-slate-500 transition-colors text-sm text-left"
      >
        {value ? (
          <>
            <img src={value.image} alt={value.name} className="w-10 h-7 object-cover rounded shrink-0" />
            <span className="text-white truncate flex-1">{value.name}</span>
          </>
        ) : (
          <span className="text-slate-500 flex-1">Pick stage…</span>
        )}
        {value ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="text-slate-500 hover:text-red-400 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-700/60">
            <input
              autoFocus
              type="text"
              placeholder="Search stages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((stage) => (
              <button
                key={stage.name}
                type="button"
                onClick={() => { onChange(stage); setOpen(false); setSearch(""); }}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-800 transition-colors text-left ${value?.name === stage.name ? "bg-slate-800/60" : ""}`}
              >
                <img src={stage.image} alt={stage.name} className="w-12 h-8 object-cover rounded shrink-0" />
                <span className="text-sm text-slate-200">{stage.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-4">No stages match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Mode picker -----------------------------------------------------------

function ModePicker({ value, onChange }: { value: Mode | null; onChange: (m: Mode | null) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {MODES.map((mode) => {
        const active = value?.id === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            title={mode.name}
            onClick={() => onChange(active ? null : mode)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              active
                ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            <img
              src={mode.icon}
              alt={mode.name}
              className="w-4 h-4 object-contain shrink-0"
            />
            <span className="hidden sm:inline">{mode.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Main component --------------------------------------------------------

const BO_OPTIONS = [1, 3, 5, 7] as const;
type BestOf = (typeof BO_OPTIONS)[number];

export default function MapModePicker({ rounds, value, onChange }: Props) {
  const update = (round: number, patch: Partial<RoundMapMode>) => {
    const existing = value.find((r) => r.round === round) ?? { round, stage: null, mode: null, best_of: 1 as const };
    const updated = { ...existing, ...patch };
    const rest = value.filter((r) => r.round !== round);
    onChange([...rest, updated].sort((a, b) => a.round - b.round));
  };

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => {
        const entry = value.find((r) => r.round === round) ?? { round, stage: null, mode: null, best_of: 1 as const };
        return (
          <div
            key={round}
            className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-3"
          >
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5">
              {getRoundLabel(round, rounds)}
            </p>
            <div className="flex flex-col gap-2">
              <StagePicker value={entry.stage} onChange={(s) => update(round, { stage: s })} />
              <ModePicker value={entry.mode} onChange={(m) => update(round, { mode: m })} />
              {/* Best of selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 shrink-0">Best of</span>
                <div className="flex gap-1">
                  {BO_OPTIONS.map((bo: BestOf) => (
                    <button
                      key={bo}
                      type="button"
                      onClick={() => update(round, { best_of: bo })}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        (entry.best_of ?? 1) === bo
                          ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                          : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                      }`}
                    >
                      {bo}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
