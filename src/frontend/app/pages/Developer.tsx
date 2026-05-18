import { Helmet } from "react-helmet";
import PageWrapper from "../components/PageWrapper";
import marineAiLogo from "../assets/marineai.png";
import sneakyLogo from "../assets/sneaky.jpg";
import oce4MansLogo from "../assets/oce4mans.png";
import private6mansLogo from "../assets/private6mans.png";
import esportsUniHubLogo from "../assets/esportsunihub.jpg";
import TitlePage from "../components/TitlePage";
import TypewriterText from "../components/TypewriterText";
import GitHubCard from "../components/GithubCard";
import { ExternalLink, Github, Code2, Briefcase } from "lucide-react";

const PROFESSIONAL_PROJECTS = [
  {
    title: "Marine AI",
    imgSrc: marineAiLogo,
    tags: ["C++", "Python", "Docker", "Kubernetes", "Linux"],
    description:
      "Completed a year-long industry placement at Marine AI working on autonomous maritime systems. Developed backend services in C++ and Python, integrated real-time sensor pipelines, and deployed infrastructure with Docker and Kubernetes. Production-grade engineering on systems that operate in the real world.",
  },
  {
    title: "Esports Uni Hub",
    imgSrc: esportsUniHubLogo,
    tags: ["Full-Stack", "React", "TypeScript", "FYP"],
    description:
      "Designed and built esportsunihub.com as my final-year project. A platform connecting UK university esports communities, helping students find teams, track results, and compete in organised leagues.",
    externalUrl: "https://www.esportsunihub.com/",
  },
  {
    title: "OCE 4 Mans",
    imgSrc: oce4MansLogo,
    tags: ["TypeScript", "Node.js", "Express", "React", "Discord API"],
    description:
      "A full-stack matchmaking platform for the Rocket League OCE community. Handles automated rank tracking, Discord integration, player history, and structured 4-man queues. Built from scratch.",
  },
  {
    title: "Private6Mans",
    imgSrc: private6mansLogo,
    tags: ["TypeScript", "Discord API"],
    description:
      "Joined the dev team for Private6Mans, a bot used in competitive Rocket League for structured matchmaking and stat tracking. Shipped match history views, a /fixteams command, and various quality-of-life fixes.",
  },
];

const PERSONAL_PROJECTS = [
  { title: "Pet-Ascension", repo: "Pet-Ascension", description: "A spiritual-themed browser game. Express.js, plain JS/HTML/CSS, no frameworks. Top mark of the year for a first-year university project." },
  { title: "You're Fat Stop That", repo: "youre-fat-stop-that", description: "A blunt weight tracker with a sarcastic edge. Built with Express.js and vanilla HTML/CSS/JS. First-class grade." },
  { title: "CPP Snake", repo: "CPP-Snake", description: "Terminal Snake game in C++, built ahead of placement to learn the language. Covers game loops, input handling, and ASCII rendering." },
  { title: "University Work", repo: "university-work", description: "Public archive of university problem sets — Haskell, SQL, and logic-based challenges across three years of the degree." },
];

const Developer = () => (
  <PageWrapper>
    <Helmet>
      <title>Developer | Sneaky: Full-Stack Engineer</title>
      <meta name="description" content="Sneaky's software engineering portfolio. Full-stack projects, C++/Python work at Marine AI, and open-source contributions." />
      <meta property="og:title" content="Developer Portfolio | Sneaky" />
      <meta property="og:description" content="Full-stack projects, C++/Python experience, and open-source contributions." />
      <meta property="og:image" content="/image.png" />
      <meta property="og:url" content="https://sneakyofficial.com/developer" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
    </Helmet>

    <main className="w-full overflow-x-hidden">
      <TitlePage
        imgSrc={sneakyLogo}
        imgAlt="Sneaky"
        verb="<Develops/>"
        colour="#00ff88"
        loop={true}
        TextAnimationComponent={TypewriterText}
      />

      {/* This site */}
      <section className="max-w-5xl mx-auto px-6 py-14">
        <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5">This site</h2>
        <div className="glass-card p-6 flex flex-col sm:flex-row items-start gap-6">
          <div className="flex-1 text-sm leading-relaxed text-slate-300">
            <h3 className="text-base font-semibold text-white mb-2">sneakyofficial.com</h3>
            <p>
              Built with React, TypeScript, and Tailwind. Backend is Python (aiohttp) with MySQL and a
              Discord bot. The particle background is a custom Three.js WebGL renderer. Includes Splatdle,
              a daily Splatoon puzzle with Discord OAuth and persistent leaderboards.
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <a
              href="https://github.com/Sneakynarnar/sneakyofficial.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 glass border border-white/10 text-slate-300 rounded-lg hover:text-white transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              Code
            </a>
            <a
              href="https://sneakyofficial.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-green-500/15 border border-green-500/25 text-green-400 rounded-lg hover:bg-green-500/25 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Live
            </a>
          </div>
        </div>
      </section>

      {/* Professional */}
      <section className="max-w-5xl mx-auto px-6 pb-14">
        <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5 flex items-center gap-2">
          <Briefcase className="w-3.5 h-3.5" />
          Professional work
        </h2>
        <div className="space-y-4">
          {PROFESSIONAL_PROJECTS.map(p => (
            <div key={p.title} className="glass-card p-6 flex flex-col sm:flex-row items-start gap-5">
              {p.imgSrc && (
                <img src={p.imgSrc} alt={p.title} className="w-12 h-12 rounded-lg object-contain bg-white/5 p-1 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                  {p.externalUrl && (
                    <a href={p.externalUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-500/15 border border-green-500/25 text-green-400 rounded hover:bg-green-500/25 transition-colors">
                      <ExternalLink className="w-2.5 h-2.5" />Visit
                    </a>
                  )}
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-3">{p.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.tags.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-white/6 border border-white/10 text-slate-400">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Personal */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5 flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5" />
          Personal projects
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {PERSONAL_PROJECTS.map(p => (
            <div key={p.repo} className="flex flex-col gap-4">
              <div className="glass-card p-5 flex-1">
                <h3 className="text-sm font-semibold text-white mb-1">{p.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{p.description}</p>
              </div>
              <GitHubCard username="Sneakynarnar" repo={p.repo} />
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-slate-500 text-xs">More in progress, check GitHub for the full picture.</p>
      </section>
    </main>
  </PageWrapper>
);

export default Developer;
