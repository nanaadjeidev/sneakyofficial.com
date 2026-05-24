import { useState, useEffect, useRef, useCallback } from "react";
import { STAGES, MODES } from "../../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

// Carousel cycles every N ms when in compact mode
const CYCLE_MS = 3500;
// Width threshold (px) below which we switch to cycling
const CYCLE_THRESHOLD = 700;

interface PoolData {
  name?: string;
  pool: Record<string, string[]>;
}

function StageCard({ name, image }: { name: string; image: string }) {
  return (
    <div className="relative rounded overflow-hidden" style={{ flex: "0 0 auto", width: "10rem" }}>
      <img
        src={image}
        alt={name}
        style={{ width: "100%", height: "4.5rem", objectFit: "cover", display: "block" }}
      />
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.85) 30%, transparent 70%)",
      }} />
      <span style={{
        position: "absolute", bottom: 4, left: 6, right: 6,
        fontSize: 10, fontWeight: 700, color: "#fff",
        textShadow: "0 1px 4px rgba(0,0,0,0.9)",
        lineHeight: 1.2, display: "block",
      }}>
        {name}
      </span>
    </div>
  );
}

function ModePanel({ modeId, stages, compact }: { modeId: string; stages: string[]; compact: boolean }) {
  const mode = MODES.find((m) => m.id === modeId);
  if (!mode) return null;

  const stageObjects = stages
    .map((n) => STAGES.find((s) => s.name === n))
    .filter(Boolean) as typeof STAGES;

  return (
    <div style={{
      display: "flex",
      flexDirection: compact ? "row" : "column",
      gap: compact ? 8 : 6,
      alignItems: compact ? "center" : "flex-start",
      flex: compact ? "none" : "1",
      minWidth: 0,
    }}>
      {/* Mode header */}
      <div style={{
        display: "flex",
        flexDirection: compact ? "column" : "row",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        minWidth: compact ? 56 : undefined,
      }}>
        <img
          src={mode.icon}
          alt={mode.name}
          style={{ width: compact ? 28 : 20, height: compact ? 28 : 20, objectFit: "contain" }}
        />
        <span style={{
          fontSize: compact ? 9 : 10,
          fontWeight: 800,
          color: "rgba(200,180,255,0.85)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          textAlign: compact ? "center" : "left",
          lineHeight: 1.1,
        }}>
          {mode.name}
        </span>
      </div>

      {/* Stage list */}
      <div style={{
        display: "flex",
        flexWrap: compact ? "nowrap" : "wrap",
        gap: compact ? 6 : 5,
        overflowX: compact ? "auto" : "visible",
        flex: 1,
        minWidth: 0,
      }}>
        {stageObjects.length === 0 ? (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontStyle: "italic" }}>
            All stages
          </span>
        ) : (
          stageObjects.map((s) => (
            <StageCard key={s.name} name={s.name} image={s.image} />
          ))
        )}
      </div>
    </div>
  );
}

export default function OverlayMapPool() {
  const [data, setData] = useState<PoolData | null>(null);
  const [cycleIdx, setCycleIdx] = useState(0);
  const [compact, setCompact] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cycleTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    try {
      const res = await window.fetch(
        `${API_URL}/api/tournament/overlay/map-pool?guild_id=${GUILD_ID}`
      );
      const json = await res.json();
      setData(json);
    } catch { /* silent — overlay should never crash */ }
  }, []);

  useEffect(() => {
    fetch();
    const t = setInterval(fetch, 30_000);
    return () => clearInterval(t);
  }, [fetch]);

  // Measure container width to decide layout
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < CYCLE_THRESHOLD);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Cycle timer in compact mode
  const activeModes = data
    ? Object.keys(data.pool).filter((m) => MODES.some((mode) => mode.id === m))
    : [];

  useEffect(() => {
    if (!compact || activeModes.length <= 1) {
      if (cycleTimer.current) { clearInterval(cycleTimer.current); cycleTimer.current = null; }
      return;
    }
    cycleTimer.current = setInterval(() => {
      setCycleIdx((i) => (i + 1) % activeModes.length);
    }, CYCLE_MS);
    return () => {
      if (cycleTimer.current) clearInterval(cycleTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, activeModes.length]);

  // Reset cycle index when pool changes
  useEffect(() => { setCycleIdx(0); }, [data]);

  const modesWithStages = activeModes.length > 0 ? activeModes : MODES.map((m) => m.id);
  const displayModes = compact ? [modesWithStages[cycleIdx % modesWithStages.length]] : modesWithStages;

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: "100%",
        background: "rgba(8, 6, 20, 0.92)",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "12px 14px",
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, textTransform: "uppercase",
          letterSpacing: "0.18em", color: "rgba(145,70,255,0.80)",
        }}>
          Map Pool
        </span>
        {data?.name && (
          <span style={{
            fontSize: 10, color: "rgba(255,255,255,0.35)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {data.name}
          </span>
        )}
        {compact && activeModes.length > 1 && (
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {modesWithStages.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: i === cycleIdx % modesWithStages.length
                    ? "rgba(145,70,255,0.90)"
                    : "rgba(255,255,255,0.18)",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {!data ? (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>Loading…</p>
      ) : Object.keys(data.pool).length === 0 ? (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>No map pool set.</p>
      ) : (
        <div style={{
          display: "flex",
          flexDirection: compact ? "row" : "column",
          gap: compact ? 0 : 10,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}>
          {displayModes.map((modeId) => (
            <ModePanel
              key={modeId}
              modeId={modeId}
              stages={data.pool[modeId] ?? []}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
