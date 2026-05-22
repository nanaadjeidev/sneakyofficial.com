import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Signup {
  display_name: string;
  discord_id: string | null;
  twitch_username: string | null;
}

interface TournamentTeam {
  id: number;
  name: string;
  members: string[];
  captain: string | null;
}

type View = "idle" | "signup" | "teams";

const PAGE_SIZE = 20;

function useSignupKeyframes() {
  useEffect(() => {
    const id = "spl-signup-kf";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes splSignupSlideIn {
        from { opacity: 0; transform: translateY(-10px) scale(0.92); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes splTeamCardIn {
        from { opacity: 0; transform: translateY(14px) scale(0.94); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes splCountBump {
        0%   { transform: scale(1); }
        50%  { transform: scale(1.18); }
        100% { transform: scale(1); }
      }
      @keyframes splFadeOut {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
      @keyframes splFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes splPageExit {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(-3%); }
      }
      @keyframes splPageEnter {
        from { opacity: 0; transform: translateX(3%); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .spl-signup-slide-in { animation: splSignupSlideIn 0.45s ease-out both; }
      .spl-team-card-in    { animation: splTeamCardIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-count-bump      { animation: splCountBump 0.4s ease both; }
      .spl-fade-out        { animation: splFadeOut 0.5s ease both; }
      .spl-fade-in         { animation: splFadeIn 0.6s ease both; }
      .spl-page-exit       { animation: splPageExit 0.28s ease-in both; }
      .spl-page-enter      { animation: splPageEnter 0.35s cubic-bezier(0.22,1,0.36,1) both; }
    `;
    document.head.appendChild(el);
  }, []);
}

export default function OverlaySignups() {
  useSignupKeyframes();

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const [view, setView] = useState<View>("idle");
  const [transitioning, setTransitioning] = useState(false);
  const [tournamentName, setTournamentName] = useState("");
  const [signups, setSignups] = useState<Signup[]>([]);
  const [newNames, setNewNames] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pagePhase, setPagePhase] = useState<"idle" | "exiting" | "entering">("idle");
  const [bumpKey, setBumpKey] = useState(0);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);

  const viewRef = useRef<View>("idle");
  viewRef.current = view;

  const totalPages = Math.ceil(signups.length / PAGE_SIZE);

  const fetchAndSwitchToTeams = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament`, {
        params: { guild_id: GUILD_ID },
      });
      const t = data.tournament;
      const fetchedTeams: TournamentTeam[] = data.teams ?? [];
      setTeams(fetchedTeams);
      if (t) setTournamentName(t.name);
      setTransitioning(true);
      setTimeout(() => {
        setView("teams");
        setTransitioning(false);
      }, 500);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!GUILD_ID) return;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/tournament`, {
          params: { guild_id: GUILD_ID },
        });
        const t = data.tournament;
        if (!t) { setView("idle"); return; }
        const fetchedTeams: TournamentTeam[] = data.teams ?? [];
        if (t.status === "signup") {
          setTournamentName(t.name);
          try {
            const sr = await axios.get(`${API_URL}/api/tournament/signups`, {
              params: { guild_id: GUILD_ID },
            });
            const reversed = [...(sr.data.signups ?? [])].reverse();
            setSignups(reversed);
          } catch { /* ignore */ }
          setView("signup");
        } else if (fetchedTeams.length > 0) {
          setTournamentName(t.name);
          setTeams(fetchedTeams);
          setView("teams");
        } else {
          setView("idle");
        }
      } catch { setView("idle"); }
    })();
  }, []);

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
          if (msg.event === "hello") {
            if (viewRef.current === "idle") {
              setSignups([...(msg.signups ?? [])].reverse());
              setView("signup");
            }
          } else if (msg.event === "signup") {
            const entry: Signup = {
              display_name: msg.display_name,
              discord_id: msg.discord_id,
              twitch_username: msg.twitch_username ?? "",
            };
            setSignups((prev) => [entry, ...prev]);
            setPage(0);
            setBumpKey((k) => k + 1);
            setNewNames((prev) => {
              const next = new Set(prev);
              next.add(entry.display_name);
              return next;
            });
            setTimeout(() => {
              setNewNames((prev) => {
                const next = new Set(prev);
                next.delete(entry.display_name);
                return next;
              });
            }, 2500);
          } else if (msg.event === "leave") {
            setSignups((prev) => prev.filter((s) => s.display_name !== msg.display_name));
          } else if (msg.event === "tournament_locked") {
            fetchAndSwitchToTeams();
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000); };
    };
    connect();
    return () => { dead = true; ws?.close(); };
  }, [fetchAndSwitchToTeams]);

  useEffect(() => {
    if (view !== "signup" || totalPages <= 1) return;
    const t = setInterval(() => {
      setPagePhase("exiting");
      const t1 = setTimeout(() => {
        setPage((p) => (p + 1) % totalPages);
        setPagePhase("entering");
        const t2 = setTimeout(() => setPagePhase("idle"), 400);
        return () => clearTimeout(t2);
      }, 300);
      return () => clearTimeout(t1);
    }, 6000);
    return () => clearInterval(t);
  }, [view, totalPages]);

  const pageSignups = signups.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const teamCols = teams.length <= 4 ? 2 : teams.length <= 9 ? 3 : 4;

  if (view === "idle") {
    return (
      <div
        data-overlay
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{
          color: "rgba(255,255,255,0.18)",
          fontSize: "clamp(10px, 1.4vw, 14px)",
          fontWeight: 700,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
        }}>
          No active sign-ups
        </p>
      </div>
    );
  }

  if (view === "teams") {
    return (
      <div
        data-overlay
        className={transitioning ? "spl-fade-out" : "spl-fade-in"}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "rgba(6,6,18,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Header */}
        <div style={{
          flex: "0 0 18%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 3vw",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          boxSizing: "border-box",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4vh" }}>
            <span style={{
              fontSize: "clamp(7px, 1vw, 10px)",
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.28)",
            }}>
              {tournamentName}
            </span>
            <span style={{
              fontSize: "clamp(16px, 3.8vw, 36px)",
              fontWeight: 900,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1,
            }}>
              TEAMS LOCKED
            </span>
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "clamp(40px, 7vw, 68px)",
            height: "clamp(40px, 7vw, 68px)",
            borderRadius: "50%",
            background: "rgba(167,139,250,0.18)",
            border: "2px solid rgba(167,139,250,0.45)",
            boxShadow: "0 0 24px rgba(167,139,250,0.30)",
          }}>
            <span style={{
              fontSize: "clamp(14px, 3vw, 28px)",
              fontWeight: 900,
              color: "rgb(167,139,250)",
              lineHeight: 1,
            }}>
              {teams.length}
            </span>
          </div>
        </div>

        {/* Team grid */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${teamCols}, 1fr)`,
          gap: "1.2vw",
          padding: "1.8vh 3vw",
          boxSizing: "border-box",
          overflowY: "hidden",
          alignContent: "start",
        }}>
          {teams.map((team, idx) => (
            <div
              key={team.id}
              className="spl-team-card-in"
              style={{
                animationDelay: `${idx * 0.05}s`,
                background: "rgba(12,12,28,0.85)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "0.8vw",
                padding: "1.2vh 1.4vw",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <div style={{
                fontSize: "clamp(10px, 1.8vw, 16px)",
                fontWeight: 900,
                color: "rgb(110,231,183)",
                textShadow: "0 0 14px rgba(52,211,153,0.35)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginBottom: "0.6vh",
              }}>
                {team.name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25vh" }}>
                {team.members.map((m) => (
                  <span key={m} style={{
                    fontSize: "clamp(8px, 1.1vw, 11px)",
                    color: m === team.captain ? "rgba(167,139,250,0.90)" : "rgba(255,255,255,0.50)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: m === team.captain ? 700 : 400,
                  }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // signup view
  return (
    <div
      data-overlay
      className={transitioning ? "spl-fade-out" : "spl-fade-in"}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "rgba(6,6,18,0.92)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {/* Header — 20% */}
      <div style={{
        flex: "0 0 20%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 3vw",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4vh" }}>
          <span style={{
            fontSize: "clamp(7px, 1vw, 10px)",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.28)",
          }}>
            {tournamentName}
          </span>
          <span style={{
            fontSize: "clamp(16px, 3.8vw, 36px)",
            fontWeight: 900,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.92)",
            lineHeight: 1,
          }}>
            SIGN-UPS OPEN
          </span>
        </div>
        <div
          key={bumpKey}
          className={bumpKey > 0 ? "spl-count-bump" : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "clamp(44px, 8vw, 76px)",
            height: "clamp(44px, 8vw, 76px)",
            borderRadius: "50%",
            background: "rgba(110,231,183,0.14)",
            border: "2px solid rgba(110,231,183,0.45)",
            boxShadow: "0 0 28px rgba(52,211,153,0.28)",
            flexShrink: 0,
          }}
        >
          <span style={{
            fontSize: "clamp(14px, 3.2vw, 30px)",
            fontWeight: 900,
            color: "rgb(110,231,183)",
            lineHeight: 1,
          }}>
            {signups.length}
          </span>
        </div>
      </div>

      {/* Body — 74% */}
      <div style={{
        flex: "0 0 74%",
        padding: "1.4vh 2.5vw",
        boxSizing: "border-box",
        overflow: "hidden",
      }}>
        <div
          className={pagePhase === "exiting" ? "spl-page-exit" : pagePhase === "entering" ? "spl-page-enter" : undefined}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "0.6vh 1.2vw",
            height: "100%",
            alignContent: "start",
          }}>
          {pageSignups.map((s) => {
            const isNew = newNames.has(s.display_name);
            return (
              <div
                key={`${s.display_name}-${page}`}
                className={isNew ? "spl-signup-slide-in" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.7vw",
                  padding: "0.5vh 0.8vw",
                  borderRadius: "0.4vw",
                  background: isNew ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.03)",
                  border: isNew
                    ? "1px solid rgba(16,185,129,0.35)"
                    : "1px solid rgba(255,255,255,0.04)",
                  borderLeft: isNew
                    ? "3px solid rgba(16,185,129,0.75)"
                    : "3px solid rgba(255,255,255,0.06)",
                  overflow: "hidden",
                  transition: "background 0.3s, border-color 0.3s",
                }}
              >
                <span style={{
                  fontSize: "clamp(9px, 1.3vw, 13px)",
                  fontWeight: isNew ? 700 : 500,
                  color: isNew ? "rgba(110,231,183,0.95)" : "rgba(255,255,255,0.72)",
                  textShadow: isNew ? "0 0 10px rgba(52,211,153,0.45)" : "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}>
                  {s.display_name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer — 6% */}
      <div style={{
        flex: "0 0 6%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.6vw",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        boxSizing: "border-box",
      }}>
        {totalPages > 1 && Array.from({ length: totalPages }, (_, i) => (
          <div
            key={i}
            style={{
              width: i === page ? "clamp(8px, 1.2vw, 12px)" : "clamp(5px, 0.7vw, 7px)",
              height: "clamp(5px, 0.7vw, 7px)",
              borderRadius: "9999px",
              background: i === page ? "rgb(167,139,250)" : "rgba(255,255,255,0.10)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
