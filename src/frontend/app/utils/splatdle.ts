export function getDailyKey(): string {
  const d = new Date();
  const utc = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return `splatdle_daily_${utc.getFullYear()}_${utc.getMonth()}_${utc.getDate()}`;
}

export function getComparisonClass(
  guess: string | number | undefined,
  correct: string | number | undefined
): string {
  if (guess === -1 || correct === -1) return "bg-slate-600";
  const gn = Number(guess), cn = Number(correct);
  if (!isNaN(gn) && !isNaN(cn)) {
    const diff = Math.abs(gn - cn);
    if (diff === 0) return "bg-emerald-600";
    if (diff <= 10) return "bg-amber-600";
    return "bg-rose-600";
  }
  return guess === correct ? "bg-emerald-600" : "bg-rose-600";
}

export function formatStat(v: number): string {
  return v === -1 ? "?" : String(v);
}

export function getArrow(guess: number | undefined, correct: number | undefined): string {
  if (guess === undefined || correct === undefined || guess === -1 || correct === -1) return "?";
  if (guess < correct) return "↑";
  if (guess > correct) return "↓";
  return "✓";
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
