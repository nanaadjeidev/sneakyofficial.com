const OVERLAYS = [
  {
    group: "Match",
    items: [
      {
        label: "Match — Full",
        url: "/overlay/match",
        obs: "1280 × 720",
        desc: "Full match view: big score header, per-game map cards, other-matches ticker.",
      },
      {
        label: "Match — Corner",
        url: "/overlay/match?style=corner",
        obs: "360 × auto",
        desc: "Compact card for a stream corner: teams, score, pips, map thumbnail.",
      },
    ],
  },
  {
    group: "Ribbon",
    items: [
      {
        label: "Ribbon — Landscape",
        url: "/overlay/ribbon",
        obs: "1280 × 60",
        desc: "Thin widescreen bar: team names, score, player ticker, stage art bleed. Idle state shows channel branding.",
      },
      {
        label: "Ribbon — Mobile / Portrait",
        url: "/overlay/ribbon-mobile",
        obs: "480 × 130",
        desc: "Thick portrait-optimised ribbon with large score. Designed for TikTok / vertical streams.",
      },
    ],
  },
  {
    group: "Tournament info",
    items: [
      {
        label: "Bracket",
        url: "/overlay/bracket",
        obs: "1280 × 720",
        desc: "Live bracket tree with match results and round labels.",
      },
      {
        label: "Bracket — Full style",
        url: "/overlay/bracket?style=full",
        obs: "1280 × 720",
        desc: "Alternative full-screen bracket layout.",
      },
      {
        label: "Up Next",
        url: "/overlay/upnext",
        obs: "500 × 200",
        desc: "Shows the next scheduled match: teams, round, map and mode.",
      },
      {
        label: "Sign-ups",
        url: "/overlay/signups",
        obs: "400 × 600",
        desc: "Scrolling list of signed-up players, updates in real time.",
      },
      {
        label: "Leaderboard",
        url: "/overlay/leaderboard",
        obs: "400 × 600",
        desc: "Top players by TrueSkill rating with rank badges.",
      },
    ],
  },
  {
    group: "Viewer info",
    items: [
      {
        label: "How to Play",
        url: "/overlay/howtoplay",
        obs: "480 × 200",
        desc: "Auto-rotating widget: Twitch sign-up steps, match commands, and Discord join instructions for YouTube / TikTok viewers.",
      },
    ],
  },
];

function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  });
}

import { useState } from "react";

function OverlayCard({ label, url, obs, desc }: { label: string; url: string; obs: string; desc: string }) {
  const [copied, setCopied] = useState(false);
  const fullUrl = `${window.location.origin}${url}`;

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 10,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)", lineHeight: 1.3 }}>
          {label}
        </span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(145,70,255,0.80)",
          background: "rgba(145,70,255,0.12)",
          border: "1px solid rgba(145,70,255,0.25)",
          borderRadius: 4,
          padding: "2px 7px",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          {obs}
        </span>
      </div>

      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, margin: 0 }}>
        {desc}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(145,70,255,0.80)",
            textDecoration: "none",
            fontFamily: "monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {url}
        </a>
        <button
          onClick={() => copyToClipboard(fullUrl, setCopied)}
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 5,
            border: "1px solid rgba(255,255,255,0.12)",
            background: copied ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)",
            color: copied ? "rgb(52,211,153)" : "rgba(255,255,255,0.55)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
    </div>
  );
}

export default function OverlayIndex() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "rgb(6,6,18)",
      color: "#fff",
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "40px 24px",
      boxSizing: "border-box",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 6px", color: "#fff" }}>
            Stream Overlays
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", margin: 0, lineHeight: 1.6 }}>
            Add these as Browser Sources in OBS. Each card shows the recommended source size.
            Click <strong style={{ color: "rgba(255,255,255,0.55)" }}>Copy URL</strong> to grab the full URL ready to paste.
          </p>
        </div>

        {/* Groups */}
        {OVERLAYS.map((group) => (
          <div key={group.group} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "rgba(145,70,255,0.70)",
              margin: "0 0 12px",
            }}>
              {group.group}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {group.items.map((item) => (
                <OverlayCard key={item.url} {...item} />
              ))}
            </div>
          </div>
        ))}

        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", marginTop: 16 }}>
          All overlays have a transparent background — set OBS browser source background to transparent (0,0,0,0).
        </p>
      </div>
    </div>
  );
}
