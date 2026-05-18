import React, { useState, useEffect } from "react";
import SneakyLogo from "../assets/sneaky.jpg";
import { ChevronDown } from "lucide-react";

type TitlePageProps = {
  verb: string;
  colour: string;
  imgSrc?: string;
  imgAlt?: string;
  loop?: boolean;
  TextAnimationComponent: React.ComponentType<{
    text: string;
    colour: string;
    delay: number;
    loop: boolean;
  }>;
};

const TitlePage = ({ verb, colour, imgSrc, imgAlt, TextAnimationComponent, loop }: TitlePageProps) => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const collapse = () => setCollapsed(true);
    const timer = setTimeout(collapse, 1800);
    const onScroll = () => {
      if (window.scrollY > 40) {
        collapse();
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <section
      className="relative overflow-hidden w-full"
      style={{
        height: collapsed ? "72px" : "100vh",
        transition: "height 700ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Full hero — fades out on collapse */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-4 pb-16 text-center"
        style={{
          opacity: collapsed ? 0 : 1,
          transition: "opacity 450ms ease-in-out",
          pointerEvents: collapsed ? "none" : "auto",
        }}
      >
        <img
          src={imgSrc || SneakyLogo}
          alt={imgAlt || "Sneaky"}
          className="w-36 h-36 sm:w-48 sm:h-48 lg:w-60 lg:h-60 mb-6 rounded-full object-cover shadow-2xl hover:scale-105 transition-transform duration-300"
          style={{ border: `3px solid ${colour}40` }}
        />
        <div className="text-4xl sm:text-5xl lg:text-7xl font-black flex flex-wrap items-center justify-center gap-x-4 mb-4">
          <span className="text-white">Sneaky</span>
          <TextAnimationComponent text={verb} colour={colour} loop={!!loop} delay={200} />
        </div>
        <p className="text-slate-400 text-base sm:text-lg max-w-md">
          Nana Adepa Nuamah Adjei
        </p>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce">
          <span className="text-xs text-slate-500">Scroll for more</span>
          <ChevronDown className="w-5 h-5 text-slate-500" />
        </div>
      </div>

      {/* Compact header — fades in on collapse */}
      <div
        className="absolute inset-0 flex items-center px-4 sm:px-6 gap-3"
        style={{
          opacity: collapsed ? 1 : 0,
          transition: "opacity 450ms ease-in-out 250ms",
          pointerEvents: collapsed ? "auto" : "none",
        }}
      >
        <img
          src={imgSrc || SneakyLogo}
          alt={imgAlt || "Sneaky"}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0 shadow-md"
          style={{ border: `2px solid ${colour}50` }}
        />
        <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base md:text-lg font-bold min-w-0">
          <span className="text-white whitespace-nowrap">Sneaky</span>
          <span className="font-bold whitespace-nowrap" style={{ color: colour }}>
            {verb}
          </span>
        </div>
        <div
          className="ml-auto h-px w-12 sm:w-16 flex-shrink-0 rounded-full hidden sm:block"
          style={{ background: `linear-gradient(to right, ${colour}60, transparent)` }}
        />
      </div>

      {/* Bottom border that appears on collapse */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(to right, transparent, ${colour}30, transparent)`,
          opacity: collapsed ? 1 : 0,
          transition: "opacity 400ms ease-in-out 500ms",
        }}
      />
    </section>
  );
};

export default TitlePage;
