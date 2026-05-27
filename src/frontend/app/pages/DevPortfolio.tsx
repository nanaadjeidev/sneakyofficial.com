/**
 * Standalone developer portfolio with animated CV integration.
 * Route: /portfolio
 */
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { Helmet } from "react-helmet";
import {
  Github, Mail, MapPin, ExternalLink, Download,
  Terminal, Code2, Server, Layers, Award, Users, X, Printer,
} from "lucide-react";
import Background from "../components/Background";

// ── Types ──────────────────────────────────────────────────────────────────────

type Experience = {
  company: string;
  role: string;
  period: string;
  bullets: string[];
};

type Project = {
  title: string;
  subtitle?: string;
  description: string;
  url?: string;
  repoUrl?: string;
  tags: string[];
};

// ── CV Data ────────────────────────────────────────────────────────────────────

const EXPERIENCE: Experience[] = [
  {
    company: "MarineAI",
    role: "Software Engineer Intern",
    period: "Sep 2024 – Sep 2025",
    bullets: [
      "Designed and implemented a testing framework for their Python communication library — cut code needed per message type from 400–500 lines to ~80 lines via abstraction and object manipulation.",
      "Contributed to the autonomous navigation stack: route-optimisation algorithms and real-time sensor-fusion modules reducing contextualised routes across weather patterns.",
      "Designed and implemented a C++ alarms library from scratch, now the sole fault-detection and alerting layer across all MarineAI C++ production applications, replacing ad-hoc error handling that caused undetected sensor faults.",
      "Delivered production code under safety-critical constraints (functional-safety review, mandatory code gates, full documentation) targeting Serco-operated vessels on live autonomous maritime operations.",
    ],
  },
  {
    company: "Self-Employed",
    role: "Freelance Software Engineer",
    period: "Jul 2024 – Present",
    bullets: [
      "Developed OCE-4Mans — a React and Python platform to organise private Rocket League matches, featuring scheduling, scoring, and real-time competition workflows.",
      "Designed and delivered client web applications in React and Tailwind, iterating rapidly on live systems in response to user feedback.",
      "Contributed TypeScript modules to an open-source Discord Bot serving tens of thousands of communities and hundreds of thousands of users.",
    ],
  },
];

const SKILLS = [
  { category: "Languages", Icon: Code2,    items: ["Python", "C++", "TypeScript", "JavaScript", "SQL"] },
  { category: "Frameworks", Icon: Layers,  items: ["React", "Tailwind CSS", "Material UI", "Node.js"] },
  { category: "Backend",    Icon: Server,  items: ["REST APIs", "Database Design", "API Development", "Server Architecture"] },
  { category: "Tools",      Icon: Terminal, items: ["Docker", "Linux", "Git"] },
  { category: "Domains",    Icon: Award,   items: ["Autonomous Systems", "Safety-Critical Software", "Real-Time Systems", "Embedded Systems"] },
];

const PROJECTS: Project[] = [
  {
    title: "Esports Uni Hub",
    subtitle: "Final Year Project · University of Portsmouth",
    description: "Full-stack esports society management platform. Grew from zero to 90+ active users across 13 UK universities in under six months. Drove adoption through direct user research and individual society onboarding — not organic discovery.",
    url: "https://esportsunihub.com",
    tags: ["React", "TypeScript", "Full-Stack", "Community Platform"],
  },
  {
    title: "MarineAI: C++ Alarms Library",
    description: "Designed and built the fault-detection and alerting layer now deployed across all MarineAI C++ production applications, replacing ad-hoc error handling that had caused undetected sensor faults in prior deployments.",
    tags: ["C++", "Safety-Critical", "Embedded Systems", "Production"],
  },
  {
    title: "OCE 4 Mans",
    description: "Full-stack matchmaking platform for the Rocket League OCE community. Handles rank tracking, structured queuing, Discord integration, and player history — built from scratch.",
    tags: ["TypeScript", "React", "Python", "Discord API"],
  },
  {
    title: "Pet Ascension",
    description: "Browser game that earned the highest mark in the cohort for Application Programming. Built with Express.js and vanilla JS/HTML/CSS — deliberately no frameworks.",
    repoUrl: "https://github.com/Sneakynarnar/Pet-Ascension",
    tags: ["JavaScript", "Express.js", "HTML/CSS"],
  },
];

const LEADERSHIP = [
  { role: "Student Groups Admin, UPSU",         period: "2025 – present", detail: "Managed operations, event planning, and compliance across societies." },
  { role: "Student Leaders Development Assistant", period: "2025",         detail: "Delivered training programmes for student representatives." },
  { role: "Student Voice Assistant",             period: "2023 – 2024",   detail: "Facilitated communication between students and faculty." },
  { role: "Faculty Representative",              period: "2022 – 2023",   detail: "Represented students in university leadership meetings." },
];

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function useTypewriter(text: string, speed = 55, startDelay = 0) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const start = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) { clearInterval(interval); setDone(true); }
      }, speed);
      return () => clearInterval(interval);
    }, startDelay);
    return () => clearTimeout(start);
  }, [text, speed, startDelay]);
  return { displayed, done };
}

// ── Animation helpers ──────────────────────────────────────────────────────────

function FadeSection({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity 0.55s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function SlideItem({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-6 flex items-center gap-2">
      <span className="text-green-400 font-mono text-sm">//</span>
      {children}
      <span className="flex-1 h-px bg-white/8 ml-1" />
    </h2>
  );
}

// ── Terminal hero ──────────────────────────────────────────────────────────────

function TerminalHero() {
  const line1 = useTypewriter("nana.adjei.dev", 80, 300);
  const line2 = useTypewriter("C++ / Python / TypeScript", 48, 1700);
  const line3 = useTypewriter("Backend & Full-Stack Engineer", 42, 3000);

  return (
    <div className="font-mono">
      <div className="text-slate-500 text-sm mb-4">
        <span className="text-green-400">~</span>
        <span className="text-slate-400"> $ </span>
        <span className="text-white">whoami</span>
      </div>
      <div className="pl-4 space-y-2">
        <div className="text-green-300 text-2xl sm:text-3xl font-bold tracking-tight">
          {line1.displayed}
          {!line1.done && <span className="animate-pulse">▌</span>}
        </div>
        <div className="text-slate-200 text-base sm:text-lg">
          {line2.displayed}
          {line1.done && !line2.done && <span className="animate-pulse">▌</span>}
        </div>
        <div className="text-slate-400 text-sm sm:text-base">
          {line3.displayed}
          {line2.done && !line3.done && <span className="animate-pulse">▌</span>}
        </div>
      </div>
      {line3.done && (
        <div className="text-slate-600 text-sm mt-5 font-mono">
          <span className="text-green-400">~</span>
          <span className="text-slate-400"> $ </span>
          <span className="animate-pulse text-white/60">▌</span>
        </div>
      )}
    </div>
  );
}

// ── Stats bar ──────────────────────────────────────────────────────────────────

function AnimatedCount({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useReveal(0.5);
  useEffect(() => {
    if (!visible) return;
    const duration = 1200;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current = Math.min(current + increment, target);
      setCount(Math.round(current));
      if (current >= target) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [visible, target]);
  return (
    <span ref={ref} className="tabular-nums">
      {count}{suffix}
    </span>
  );
}

// ── CV Modal ───────────────────────────────────────────────────────────────────

function CVModal({ onClose }: { onClose: () => void }) {
  const handlePrint = useCallback(() => window.print(), []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto py-8 px-4 bg-black/70 backdrop-blur-sm"
      style={{ animation: "cvFadeIn 0.2s ease forwards" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        id="cv-print-content"
        className="relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/15"
        style={{
          background: "rgba(10,15,26,0.98)",
          animation: "cvSlideUp 0.3s cubic-bezier(0.22,1,0.36,1) forwards",
        }}
      >
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between px-5 py-3.5 border-b border-white/10 sticky top-0 bg-[rgba(10,15,26,0.98)] z-10">
          <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
            <Terminal className="w-3.5 h-3.5 text-green-400" />
            NANA_ADJEI_CV.pdf
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/25 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Save as PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CV content */}
        <div className="px-8 py-7 text-[13px] text-slate-300 leading-relaxed space-y-6">
          {/* Header */}
          <div className="pb-5 border-b border-white/10">
            <h1 className="text-xl font-bold text-white tracking-tight mb-0.5">NANA ADJEI</h1>
            <p className="text-slate-400 text-xs mb-3">C++ / Python / TypeScript | Backend & Full-Stack</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>London N7</span>
              <a href="mailto:nana.adjei.dev@gmail.com" className="hover:text-slate-300 transition-colors">nana.adjei.dev@gmail.com</a>
              <span>07873 366 584</span>
              <a href="https://github.com/nanaadjeidev" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">github.com/nanaadjeidev</a>
            </div>
          </div>

          {/* Summary */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">Summary</p>
            <p className="text-slate-400">
              Software engineer with production experience, shipping code in professional environments. At MarineAI, designed core C++ infrastructure now deployed across all production C++ applications. Built and launched full-stack platforms used live by students at 13 UK universities. Looking for a backend role. Writes Python, C++, and TypeScript — comfortable picking up whatever the stack needs.
            </p>
          </div>

          {/* Experience */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Experience</p>
            <div className="space-y-4">
              {EXPERIENCE.map((exp) => (
                <div key={exp.company}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="font-semibold text-white text-sm">{exp.company} — <span className="font-normal text-slate-300">{exp.role}</span></span>
                    <span className="text-slate-500 text-xs flex-shrink-0 ml-2">{exp.period}</span>
                  </div>
                  <ul className="space-y-1">
                    {exp.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2 text-slate-400 text-xs">
                        <span className="text-green-500/60 flex-shrink-0 mt-0.5">•</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">Skills</p>
            <div className="space-y-1 text-xs text-slate-400">
              <p><span className="text-slate-300">Languages:</span> Python, C++, TypeScript, JavaScript, SQL</p>
              <p><span className="text-slate-300">Frameworks & Libraries:</span> React, Tailwind CSS, Material UI, Node.js</p>
              <p><span className="text-slate-300">Tools & Technologies:</span> Docker, Linux, Git, REST APIs, HTML, CSS</p>
              <p><span className="text-slate-300">Domains:</span> Autonomous systems, safety-critical software, real-time systems, embedded systems</p>
            </div>
          </div>

          {/* Education */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">Education</p>
            <div className="flex justify-between items-baseline mb-1">
              <span className="font-semibold text-white text-sm">University of Portsmouth</span>
              <span className="text-slate-500 text-xs">2022 – 2026</span>
            </div>
            <p className="text-slate-400 text-xs mb-1">BSc (Hons) Software Engineering, First Class</p>
            <ul className="space-y-0.5 text-xs text-slate-500">
              <li>• Highest mark in cohort for Application Programming</li>
              <li>• A Levels: Computer Science (A*), Mathematics (B), Physics (B)</li>
              <li>• GCSEs: 10 grades 9–5, including Maths, Physics, and Computer Science</li>
            </ul>
          </div>

          {/* Projects */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">Projects</p>
            <div className="space-y-2">
              {PROJECTS.map((p) => (
                <div key={p.title} className="flex gap-2 text-xs">
                  <span className="text-green-500/60 flex-shrink-0 mt-0.5">›</span>
                  <div>
                    <span className="font-medium text-white">{p.title}</span>
                    {p.url && <span className="text-slate-500 ml-2">{p.url}</span>}
                    <p className="text-slate-400 mt-0.5">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Leadership */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">Leadership & Responsibility</p>
            <div className="space-y-1">
              {LEADERSHIP.map((l) => (
                <div key={l.role} className="flex justify-between text-xs">
                  <span className="text-slate-300">{l.role}</span>
                  <span className="text-slate-500 ml-4 flex-shrink-0">{l.period}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const DevPortfolio = () => {
  const [cvOpen, setCvOpen] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <Helmet>
        <title>Nana Adjei — Software Engineer</title>
        <meta
          name="description"
          content="Software engineering portfolio of Nana Adjei. C++ / Python / TypeScript backend & full-stack engineer based in London."
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <style>{`
        @keyframes cvFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cvSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cvBtnIn   { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes heroIn    { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tagPop    { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes timelineDraw { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 6px 1px rgba(74,222,128,0.3); } 50% { box-shadow: 0 0 14px 3px rgba(74,222,128,0.6); } }

        .cv-hero    { animation: heroIn 0.7s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
        .cv-btn     { animation: cvBtnIn 0.5s ease 1.2s both; }
        .card-lift  { transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease; }
        .card-lift:hover {
          transform: translateY(-3px);
          border-color: rgba(74,222,128,0.28) !important;
          box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(74,222,128,0.12);
        }
        .timeline-node { animation: glowPulse 2.5s ease-in-out infinite; }

        @media print {
          * { visibility: hidden !important; }
          #cv-print-content, #cv-print-content * { visibility: visible !important; }
          #cv-print-content {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: #fff !important;
            color: #111 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          #cv-print-content .no-print { display: none !important; }
          #cv-print-content * { color: #111 !important; border-color: #ddd !important; }
        }
      `}</style>

      {/* Three.js particle background */}
      <div className="fixed inset-0 z-0">
        <Background />
      </div>

      {/* Floating CV button */}
      <button
        onClick={() => setCvOpen(true)}
        className="cv-btn fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-green-500/12 text-green-400 border border-green-500/25 hover:bg-green-500/22 backdrop-blur-md transition-all hover:scale-105 shadow-xl"
      >
        <Download className="w-4 h-4" />
        View CV
      </button>

      {cvOpen && <CVModal onClose={() => setCvOpen(false)} />}

      <div className="relative z-10">

        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <header className="max-w-4xl mx-auto px-6 pt-20 pb-14 cv-hero">
          <div className="glass-card p-8 sm:p-10">
            <TerminalHero />

            <div className="mt-8 flex flex-wrap gap-2.5 text-sm">
              <a
                href="https://github.com/nanaadjeidev"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/7 border border-white/12 text-slate-300 hover:text-white hover:border-white/22 transition-all"
              >
                <Github className="w-3.5 h-3.5" />
                nanaadjeidev
              </a>
              <a
                href="mailto:nana.adjei.dev@gmail.com"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/7 border border-white/12 text-slate-300 hover:text-white hover:border-white/22 transition-all"
              >
                <Mail className="w-3.5 h-3.5" />
                nana.adjei.dev@gmail.com
              </a>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/4 border border-white/8 text-slate-500 select-none">
                <MapPin className="w-3.5 h-3.5" />
                London N7
              </span>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 pb-28 space-y-18">

          {/* ── Stats ── */}
          <FadeSection className="max-w-4xl">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 90, suffix: "+", label: "Active users", sub: "Esports Uni Hub" },
                { value: 13, suffix: "",  label: "UK universities", sub: "on the platform" },
                { value: 1,  suffix: " yr", label: "Industry placement", sub: "at MarineAI" },
              ].map(({ value, suffix, label, sub }, i) => (
                <SlideItem key={label} delay={i * 80}>
                  <div className="glass-card card-lift p-4 sm:p-5 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-green-300 font-mono">
                      <AnimatedCount target={value} suffix={suffix} />
                    </div>
                    <p className="text-white text-xs sm:text-sm font-medium mt-1">{label}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
                  </div>
                </SlideItem>
              ))}
            </div>
          </FadeSection>

          {/* ── Summary ── */}
          <FadeSection>
            <SectionLabel>Summary</SectionLabel>
            <SlideItem>
              <div className="glass-card card-lift p-6 text-sm text-slate-300 leading-relaxed">
                Software engineer with production experience, shipping code in professional environments.
                At MarineAI, I designed core C++ infrastructure now deployed across{" "}
                <span className="text-white font-medium">all production C++ applications</span>.
                Alongside that, I've built and launched full-stack platforms used live by students at{" "}
                <span className="text-green-300 font-medium">13 UK universities</span>.
                I'm looking for a backend role where I can grow fast — I write Python, C++, and TypeScript,
                and I'm comfortable picking up whatever the stack needs.
              </div>
            </SlideItem>
          </FadeSection>

          {/* ── Experience ── */}
          <FadeSection>
            <SectionLabel>Experience</SectionLabel>
            <div className="relative">
              <div
                className="absolute left-[18px] top-3 bottom-3 w-px bg-gradient-to-b from-green-500/50 via-green-500/20 to-transparent origin-top"
                style={{ animation: "timelineDraw 1.4s ease 0.4s both" }}
              />
              <div className="space-y-5">
                {EXPERIENCE.map((exp, i) => (
                  <SlideItem key={exp.company} delay={i * 120}>
                    <div className="flex gap-5">
                      <div className="flex-shrink-0 pt-1.5 flex flex-col items-center">
                        <div className="timeline-node w-2.5 h-2.5 rounded-full bg-green-400 z-10 mt-0.5" />
                      </div>
                      <div className="flex-1 glass-card card-lift p-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                          <div>
                            <h3 className="text-base font-semibold text-white">{exp.company}</h3>
                            <p className="text-green-400 text-sm mt-0.5">{exp.role}</p>
                          </div>
                          <span className="text-xs text-slate-500 font-mono bg-white/5 px-2.5 py-1 rounded-lg border border-white/8 flex-shrink-0">
                            {exp.period}
                          </span>
                        </div>
                        <ul className="space-y-2.5">
                          {exp.bullets.map((bullet, j) => (
                            <li
                              key={j}
                              className="flex gap-2.5 text-sm text-slate-400 leading-relaxed"
                              style={{ opacity: 0, animation: `cvFadeIn 0.4s ease ${j * 90 + 300}ms forwards` }}
                            >
                              <span className="text-green-500/50 font-mono mt-0.5 flex-shrink-0 text-xs">›</span>
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </SlideItem>
                ))}
              </div>
            </div>
          </FadeSection>

          {/* ── Skills ── */}
          <FadeSection>
            <SectionLabel>Skills</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SKILLS.map(({ category, Icon, items }, groupIdx) => (
                <SlideItem key={category} delay={groupIdx * 70}>
                  <div className="glass-card card-lift p-5 h-full">
                    <div className="flex items-center gap-2 mb-3.5">
                      <Icon className="w-4 h-4 text-green-400" />
                      <h3 className="text-sm font-semibold text-white">{category}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((item, i) => (
                        <span
                          key={item}
                          className="text-xs px-2.5 py-1 rounded-md bg-white/7 border border-white/12 text-slate-300"
                          style={{
                            opacity: 0,
                            animation: `tagPop 0.3s cubic-bezier(0.22,1,0.36,1) ${i * 55 + groupIdx * 60 + 150}ms forwards`,
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </SlideItem>
              ))}
            </div>
          </FadeSection>

          {/* ── Projects ── */}
          <FadeSection>
            <SectionLabel>Projects</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PROJECTS.map((project, i) => (
                <SlideItem key={project.title} delay={i * 75}>
                  <div className="glass-card card-lift p-5 h-full flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-white leading-tight">{project.title}</h3>
                      <div className="flex gap-2 flex-shrink-0">
                        {project.url && (
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-400 hover:text-green-300 transition-colors"
                            title="Live site"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {project.repoUrl && (
                          <a
                            href={project.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-300 transition-colors"
                            title="Source code"
                          >
                            <Github className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                    {project.subtitle && (
                      <p className="text-xs text-green-400/60 mb-2">{project.subtitle}</p>
                    )}
                    <p className="text-slate-400 text-xs leading-relaxed mb-3 flex-1">{project.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {project.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </SlideItem>
              ))}
            </div>
          </FadeSection>

          {/* ── Education ── */}
          <FadeSection>
            <SectionLabel>Education</SectionLabel>
            <SlideItem>
              <div className="glass-card card-lift p-6">
                <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">University of Portsmouth</h3>
                    <p className="text-green-400 text-sm mt-0.5">BSc (Hons) Software Engineering — First Class</p>
                  </div>
                  <span className="text-xs text-slate-500 font-mono bg-white/5 px-2.5 py-1 rounded-lg border border-white/8">
                    2022 – 2026
                  </span>
                </div>
                <ul className="space-y-2">
                  {[
                    "Highest mark in cohort for Application Programming",
                    "Relevant modules: Software Engineering Culture, Databases, AI, Web Programming",
                    "A Levels: Computer Science (A*), Mathematics (B), Physics (B)",
                    "GCSEs: 10 grades 9–5, including Maths, Physics, and Computer Science",
                  ].map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-slate-400">
                      <span className="text-green-500/50 font-mono mt-0.5 flex-shrink-0 text-xs">›</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </SlideItem>
          </FadeSection>

          {/* ── Leadership ── */}
          <FadeSection>
            <SectionLabel>Leadership & Responsibility</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {LEADERSHIP.map((item, i) => (
                <SlideItem key={item.role} delay={i * 65}>
                  <div className="glass-card card-lift p-4 flex gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      <Users className="w-4 h-4 text-green-400/60" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white leading-tight">{item.role}</p>
                      <p className="text-xs text-green-400/60 font-mono mt-0.5 mb-1">{item.period}</p>
                      <p className="text-xs text-slate-400">{item.detail}</p>
                    </div>
                  </div>
                </SlideItem>
              ))}
            </div>
          </FadeSection>

          {/* ── Contact ── */}
          <FadeSection>
            <SectionLabel>Get in touch</SectionLabel>
            <SlideItem>
              <div className="glass-card card-lift p-6 flex flex-col sm:flex-row items-center gap-5">
                <div className="flex-1 text-sm text-slate-400 leading-relaxed">
                  I'm actively looking for backend and full-stack roles.
                  If you're working on something interesting, reach out.
                </div>
                <div className="flex gap-3 flex-shrink-0">
                  <a
                    href="mailto:nana.adjei.dev@gmail.com"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all hover:scale-105"
                  >
                    <Mail className="w-4 h-4" />
                    Email me
                  </a>
                  <a
                    href="https://github.com/nanaadjeidev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/8 text-slate-300 border border-white/12 hover:bg-white/14 transition-all hover:scale-105"
                  >
                    <Github className="w-4 h-4" />
                    GitHub
                  </a>
                </div>
              </div>
            </SlideItem>
          </FadeSection>

        </div>
      </div>
    </div>
  );
};

export default DevPortfolio;
