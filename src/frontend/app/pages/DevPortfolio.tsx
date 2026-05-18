/**
 * Standalone developer portfolio, no navigation to other sections of the site.
 * Intended as a clean link for employers / recruiters.
 * Route: /portfolio
 */
import { Helmet } from "react-helmet";
import { ExternalLink, Github, Mail, Code2, Server, Layers } from "lucide-react";
import Background from "../components/Background";
import marineAiLogo from "../assets/marineai.png";
import oce4MansLogo from "../assets/oce4mans.png";
import sneakyLogo from "../assets/sneaky.jpg";

type Project = {
  title: string;
  description: string;
  tags: string[];
  repoUrl?: string;
  liveUrl?: string;
  imgSrc?: string;
};

const PROJECTS: Project[] = [
  {
    title: "Marine AI: Placement",
    description:
      "Contributed to autonomous maritime systems over a year-long industry placement. Developed backend services in C++ and Python interfacing with real-time sensor hardware, deployed infrastructure with Docker and Kubernetes, and worked across both Windows and Linux environments following Agile and Gitflow practices.",
    tags: ["C++", "Python", "Docker", "Kubernetes", "Linux", "Robotics"],
    liveUrl: "https://marineai.co.uk",
    imgSrc: marineAiLogo,
  },
  {
    title: "Esports Uni Hub",
    description:
      "A platform for university esports communities across the UK, connecting students with teams, leagues, and competition. Designed to bridge the gap between casual play and structured organised competition at the student level.",
    tags: ["Full-Stack", "Community Platform"],
    liveUrl: "https://www.esportsunihub.com/",
  },
  {
    title: "sneakyofficial.com",
    description:
      "This site, built with React, TypeScript, Tailwind, and an aiohttp Python backend with MySQL. The particle background is a custom Three.js WebGL renderer. Includes a daily Splatoon puzzle game (Splatdle) with Discord OAuth and persistent leaderboards.",
    tags: ["React", "TypeScript", "Python", "aiohttp", "MySQL", "Three.js"],
    repoUrl: "https://github.com/Sneakynarnar/sneakyofficial.com",
    liveUrl: "https://sneakyofficial.com",
  },
  {
    title: "OCE 4 Mans",
    description:
      "Full-stack matchmaking platform for the Rocket League OCE community. Handles rank tracking, structured queuing, Discord integration, and player history, built from scratch.",
    tags: ["TypeScript", "Node.js", "Express", "React", "Discord API"],
    imgSrc: oce4MansLogo,
  },
  {
    title: "Pet-Ascension",
    description:
      "A first-year university project that earned the top mark of the year. A browser game built with Express.js and vanilla JS/HTML/CSS, no frameworks, deliberately hand-rolled.",
    tags: ["JavaScript", "Express.js", "HTML/CSS"],
    repoUrl: "https://github.com/Sneakynarnar/Pet-Ascension",
  },
  {
    title: "CPP Snake",
    description:
      "A terminal Snake game written in C++ before my placement to get hands-on with the language ahead of using it professionally. Covers game loops, input handling, and ASCII rendering.",
    tags: ["C++", "Terminal", "Game"],
    repoUrl: "https://github.com/Sneakynarnar/CPP-Snake",
  },
];

const SKILLS = [
  { category: "Languages", Icon: Code2, items: ["C++", "Python", "TypeScript", "JavaScript", "Haskell", "SQL"] },
  { category: "Backend", Icon: Server, items: ["aiohttp", "Express.js", "Node.js", "REST APIs", "MySQL", "Discord API"] },
  { category: "Infrastructure", Icon: Layers, items: ["Docker", "Kubernetes", "Linux", "Git / Gitflow", "CI/CD", "Agile"] },
];

const DevPortfolio = () => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <Helmet>
        <title>Nana Adjei: Software Engineer</title>
        <meta
          name="description"
          content="Software engineering portfolio of Nana Adepa Nuamah Adjei. Full-stack developer with C++/Python placement experience at Marine AI."
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Background */}
      <div className="fixed inset-0 z-0">
        <Background />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="max-w-4xl mx-auto px-6 pt-16 pb-12 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <img
            src={sneakyLogo}
            alt="Nana Adjei"
            className="w-20 h-20 rounded-full object-cover border-2 border-white/20 shadow-xl flex-shrink-0"
          />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">
              Nana Adepa Nuamah Adjei
            </h1>
            <p className="text-slate-400 text-sm sm:text-base mb-3">
              Software Engineer · BSc Software Engineering, University of Portsmouth
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <a
                href="https://github.com/Sneakynarnar"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
              >
                <Github className="w-4 h-4" />
                GitHub
              </a>
              <a
                href="mailto:nanaadjei6981@gmail.com"
                className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
              >
                <Mail className="w-4 h-4" />
                nanaadjei6981@gmail.com
              </a>
              <a
                href="https://sneakyofficial.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                sneakyofficial.com
              </a>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 pb-20 space-y-16">
          {/* About */}
          <section>
            <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5">
              About
            </h2>
            <div className="glass-card p-6 text-sm text-slate-300 leading-relaxed space-y-4">
              <p>
                I'm a final-year Software Engineering student at the University of Portsmouth (2022–2026),
                currently completing my degree after a year-long industry placement at Marine AI. During
                the placement I worked in C++ and Python on autonomous maritime systems, writing
                production-grade software that interfaced with real hardware, sensor pipelines, and
                distributed infrastructure deployed with Docker and Kubernetes.
              </p>
              <p>
                For my final-year project I designed and built{" "}
                <a href="https://www.esportsunihub.com/" target="_blank" rel="noopener noreferrer"
                   className="text-green-400 hover:text-green-300 underline underline-offset-2">
                  esportsunihub.com
                </a>
                , a platform connecting UK university esports communities. The project covers the full
                stack: system design, frontend in React and TypeScript, and a production deployment.
              </p>
              <p>
                I'm comfortable across the stack: from multithreaded C++ and REST APIs to
                containerised deployment. I follow modern engineering practices including Gitflow,
                Agile, and formal documentation. I build things that work reliably, not just in demos.
              </p>
            </div>
          </section>

          {/* Skills */}
          <section>
            <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5">
              Technical Skills
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {SKILLS.map(({ category, Icon, items }) => (
                <div key={category} className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Icon className="w-4 h-4 text-green-400" />
                    <h3 className="text-sm font-semibold text-white">{category}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <span
                        key={item}
                        className="text-xs px-2.5 py-1 rounded-md bg-white/8 border border-white/12 text-slate-300"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Projects */}
          <section>
            <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5">
              Projects
            </h2>
            <div className="space-y-4">
              {PROJECTS.map((project) => (
                <div key={project.title} className="glass-card p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {project.imgSrc && (
                      <img
                        src={project.imgSrc}
                        alt={project.title}
                        className="w-12 h-12 rounded-lg object-contain bg-white/5 p-1 flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="text-base font-semibold text-white">
                          {project.title}
                        </h3>
                        <div className="flex gap-2">
                          {project.liveUrl && (
                            <a
                              href={project.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Live
                            </a>
                          )}
                          {project.repoUrl && (
                            <a
                              href={project.repoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                            >
                              <Github className="w-3 h-3" />
                              Code
                            </a>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-400 text-sm leading-relaxed mb-3">
                        {project.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {project.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 rounded bg-white/6 border border-white/10 text-slate-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Education */}
          <section>
            <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5">
              Education
            </h2>
            <div className="space-y-4">
              <div className="glass-card p-6">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-sm font-semibold text-white">
                    BSc Software Engineering
                  </h3>
                  <span className="text-xs text-slate-500">2022 – 2026</span>
                </div>
                <p className="text-slate-400 text-sm mb-3">University of Portsmouth</p>
                <ul className="text-slate-400 text-sm space-y-1 list-disc list-inside">
                  <li>First-class mark for Pet-Ascension (Year 1 top project)</li>
                  <li>First-class mark for You're Fat Stop That (Year 2)</li>
                  <li>Year-in-industry placement at Marine AI (2024–2025)</li>
                </ul>
              </div>
              <div className="glass-card p-6">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-sm font-semibold text-white">A-Levels</h3>
                  <span className="text-xs text-slate-500">2020 – 2022</span>
                </div>
                <p className="text-slate-400 text-sm mb-2">
                  Devonport High School for Girls (Sixth Form)
                </p>
                <p className="text-slate-400 text-sm">
                  Computer Science A*, Mathematics B, Physics B · EPQ on quantum computing
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default DevPortfolio;
