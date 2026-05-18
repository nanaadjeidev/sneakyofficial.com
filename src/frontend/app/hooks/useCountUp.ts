import { useState, useEffect } from "react";

export function useCountUp(end: number, duration = 1000, shouldAnimate = true): number {
  const [count, setCount] = useState(shouldAnimate ? 0 : end);

  useEffect(() => {
    if (!shouldAnimate) { setCount(end); return; }
    let startTime: number | null = null;
    const frame = (now: number) => {
      if (!startTime) startTime = now;
      const progress = Math.min((now - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [end, duration, shouldAnimate]);

  return count;
}
