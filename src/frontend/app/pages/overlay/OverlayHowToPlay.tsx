import { useEffect, useState } from "react";

const DISCORD_INVITE = "discord.gg/gmJeQefe5X";
const TWITCH_CHANNEL = "twitch.tv/sneakyonnightmode";

interface Slide {
  platform: "twitch" | "discord" | "info";
  eyebrow: string;
  headline: string;
  steps: { icon: string; text: string }[];
  accent: string;
}

const SLIDES: Slide[] = [
  {
    platform: "twitch",
    eyebrow: "WATCHING ON TWITCH? (1/2)",
    headline: "HOW TO SIGN UP",
    steps: [
      { icon: "1️⃣", text: "!splattag YourName#1234" },
      { icon: "2️⃣", text: `Join Discord: ${DISCORD_INVITE}` },
      { icon: "3️⃣", text: "/profile link twitch:yourname" },
    ],
    accent: "rgba(145,70,255,0.85)",
  },
  {
    platform: "twitch",
    eyebrow: "WATCHING ON TWITCH? (2/2)",
    headline: "THEN YOU'RE IN!",
    steps: [
      { icon: "4️⃣", text: "Back in Twitch chat: !in" },
      { icon: "🌐", text: "sneakyofficial.com/tournament" },
      { icon: "✅", text: "Confirm results from the website" },
    ],
    accent: "rgba(145,70,255,0.85)",
  },
  {
    platform: "info",
    eyebrow: "MATCHED UP?",
    headline: "IN A MATCH",
    steps: [
      { icon: "🌐", text: "sneakyofficial.com/tournament" },
      { icon: "🔑", text: "Get your room code from the site" },
      { icon: "✅", text: "Report & confirm your result there" },
    ],
    accent: "rgba(52,211,153,0.80)",
  },
  {
    platform: "discord",
    eyebrow: "ON YOUTUBE OR TIKTOK?",
    headline: "JOIN VIA DISCORD",
    steps: [
      { icon: "1️⃣", text: `Join: ${DISCORD_INVITE}` },
      { icon: "2️⃣", text: "/tournament signup  in #bot-commands" },
      { icon: "3️⃣", text: "/tournament nameteam YourTeamName" },
    ],
    accent: "rgba(88,101,242,0.90)",
  },
  {
    platform: "info",
    eyebrow: "HOW IT WORKS",
    headline: "4v4 TOURNAMENT",
    steps: [
      { icon: "🦑", text: "Sign up solo — auto-matched into teams" },
      { icon: "⚔️", text: "Play your match, report the result" },
      { icon: "👑", text: "Win to climb the leaderboard!" },
    ],
    accent: "rgba(52,211,153,0.80)",
  },
];

const SLIDE_DURATION = 4800;
const FADE_DURATION  = 400;

function useHowToPlayKeyframes() {
  useEffect(() => {
    const id = "spl-htp-kf";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes htpFadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes htpFadeOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(-8px); }
      }
      @keyframes htpAccentCycle {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
      @keyframes htpScan {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }
      @keyframes htpDotPulse {
        0%, 100% { transform: scale(1); opacity: 0.6; }
        50%      { transform: scale(1.4); opacity: 1; }
      }
      .htp-fade-in  { animation: htpFadeIn  ${FADE_DURATION}ms cubic-bezier(0.22,1,0.36,1) both; }
      .htp-fade-out { animation: htpFadeOut ${FADE_DURATION}ms cubic-bezier(0.55,0,1,0.45) both; }
      .htp-accent-cycle {
        background: linear-gradient(90deg, rgba(59,130,246,0.9), rgba(145,70,255,0.9), rgba(99,179,255,0.9), rgba(145,70,255,0.9), rgba(59,130,246,0.9));
        background-size: 200% auto;
        animation: htpAccentCycle 4s linear infinite;
      }
      .htp-scan {
        animation: htpScan 6s ease-in-out infinite;
      }
      .htp-dot-pulse { animation: htpDotPulse 0.5s ease both; }
    `;
    document.head.appendChild(el);
  }, []);
}

const PLATFORM_ICONS: Record<Slide["platform"], string> = {
  twitch: "🟣",
  discord: "💬",
  info: "🏆",
};

export default function OverlayHowToPlay() {
  useHowToPlayKeyframes();

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const [idx, setIdx]       = useState(0);
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % SLIDES.length);
        setFading(false);
        setVisible(true);
      }, FADE_DURATION + 40);
    }, SLIDE_DURATION);
    return () => clearInterval(timer);
  }, []);

  const slide = SLIDES[idx];

  return (
    <div
      data-overlay
      style={{
        width: "100%",
        height: "100%",
        background: "rgba(6,6,18,0.94)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        borderLeft: `3px solid ${slide.accent}`,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "clamp(10px, 2vh, 20px) clamp(14px, 3vw, 28px)",
        boxSizing: "border-box",
        transition: `border-color ${FADE_DURATION}ms ease`,
      }}
    >
      {/* Top accent */}
      <div className="htp-accent-cycle" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, pointerEvents: "none" }} />

      {/* Scan sweep */}
      <div
        className="htp-scan"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "30%",
          height: "100%",
          background: "linear-gradient(to right, transparent, rgba(145,70,255,0.07), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* Slide content */}
      <div
        className={visible ? "htp-fade-in" : fading ? "htp-fade-out" : undefined}
        style={{ display: "flex", flexDirection: "column", gap: "clamp(4px, 1.2vh, 10px)" }}
      >
        {/* Platform + eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.8vw" }}>
          <span style={{ fontSize: "clamp(10px, 1.4vh, 16px)", lineHeight: 1 }}>
            {PLATFORM_ICONS[slide.platform]}
          </span>
          <span style={{
            fontSize: "clamp(8px, 1.1vh, 12px)",
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: slide.accent,
            lineHeight: 1,
          }}>
            {slide.eyebrow}
          </span>
        </div>

        {/* Headline */}
        <div style={{
          fontSize: "clamp(16px, 3.2vh, 32px)",
          fontWeight: 900,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#fff",
          lineHeight: 1,
        }}>
          {slide.headline}
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(3px, 0.8vh, 8px)", marginTop: "clamp(2px, 0.5vh, 6px)" }}>
          {slide.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.2vw, 12px)", minWidth: 0 }}>
              <span style={{ fontSize: "clamp(12px, 1.6vh, 18px)", lineHeight: 1, flexShrink: 0 }}>
                {step.icon}
              </span>
              <span style={{
                fontSize: "clamp(12px, 1.9vh, 20px)",
                fontWeight: 700,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.2,
                fontFamily: "'Courier New', Courier, monospace",
                letterSpacing: "0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}>
                {step.text}
              </span>
            </div>
          ))}
        </div>

        {/* Discord invite highlight (only on discord slide) */}
        {slide.platform === "discord" && (
          <div style={{
            marginTop: "clamp(4px, 0.8vh, 8px)",
            padding: "clamp(4px, 0.8vh, 8px) clamp(8px, 1.5vw, 16px)",
            background: "rgba(88,101,242,0.18)",
            border: "1px solid rgba(88,101,242,0.4)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: "0.8vw",
            alignSelf: "stretch",
            minWidth: 0,
          }}>
            <span style={{ fontSize: "clamp(10px, 1.5vh, 16px)", lineHeight: 1 }}>💬</span>
            <span style={{
              fontSize: "clamp(12px, 2vh, 20px)",
              fontWeight: 900,
              color: "rgba(165,180,252,0.95)",
              letterSpacing: "0.03em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}>
              {DISCORD_INVITE}
            </span>
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div style={{
        position: "absolute",
        bottom: "clamp(6px, 1.2vh, 12px)",
        right: "clamp(10px, 2vw, 20px)",
        display: "flex",
        gap: "clamp(4px, 0.8vw, 8px)",
        alignItems: "center",
      }}>
        {SLIDES.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === idx ? "clamp(14px, 2.4vw, 20px)" : "clamp(5px, 0.8vw, 7px)",
              height: "clamp(5px, 0.8vw, 7px)",
              borderRadius: "9999px",
              background: i === idx ? slide.accent : "rgba(255,255,255,0.18)",
              transition: "width 0.35s ease, background 0.35s ease",
            }}
          />
        ))}
      </div>

      {/* Twitch channel watermark */}
      <div style={{
        position: "absolute",
        bottom: "clamp(6px, 1.2vh, 12px)",
        left: "clamp(10px, 2vw, 20px)",
      }}>
        <span style={{
          fontSize: "clamp(7px, 0.95vh, 10px)",
          fontWeight: 600,
          color: "rgba(145,70,255,0.50)",
          letterSpacing: "0.06em",
        }}>
          {TWITCH_CHANNEL}
        </span>
      </div>
    </div>
  );
}
