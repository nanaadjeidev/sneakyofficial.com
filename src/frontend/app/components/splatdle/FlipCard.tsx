import React, { useState, useEffect } from "react";
import { Gamepad2 } from "lucide-react";

interface FlipCardProps {
  children: React.ReactNode;
  isAnimating: boolean;
  delay?: number;
  shouldStayFlipped?: boolean;
  className?: string;
}

export function FlipCard({ children, isAnimating, delay = 0, shouldStayFlipped = false, className = "" }: FlipCardProps) {
  const [flipped, setFlipped] = useState(shouldStayFlipped);

  useEffect(() => {
    if (isAnimating) {
      const t = setTimeout(() => setFlipped(true), delay);
      return () => clearTimeout(t);
    } else if (!shouldStayFlipped) {
      setFlipped(false);
    }
  }, [isAnimating, delay, shouldStayFlipped]);

  useEffect(() => { if (shouldStayFlipped) setFlipped(true); }, [shouldStayFlipped]);

  return (
    <div className={`flip-card w-full h-[68px] sm:h-[72px] ${className}`}>
      <div className={`flip-card-inner${flipped ? " flipped" : ""}`}>
        <div className="flip-card-front">
          <div className="w-full h-full glass border border-white/10 rounded-xl flex items-center justify-center text-slate-500">
            <Gamepad2 className="h-3 w-3 sm:h-4 sm:w-4" />
          </div>
        </div>
        <div className="flip-card-back">
          <div className="w-full h-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
