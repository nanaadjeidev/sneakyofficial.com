import { X, Trophy, CheckCircle, Copy, RotateCcw, ExternalLink } from "lucide-react";
import { useCountUp } from "../../hooks/useCountUp";
import { DiscordIcon } from "./DiscordIcon";
import type { GameMode, Guess, UserStats } from "../../types/splatdle";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface WinningPopupProps {
  show: boolean;
  onClose: () => void;
  gameMode: GameMode;
  answer: string;
  guesses: Guess[];
  loggedIn: boolean;
  statsPosted: boolean;
  userStats: UserStats | null;
  copySuccess: boolean;
  onCopy: () => void;
  onNewInfiniteGame: () => void;
}

export function WinningPopup({
  show, onClose, gameMode, answer, guesses, loggedIn,
  statsPosted, userStats, copySuccess, onCopy, onNewInfiniteGame,
}: WinningPopupProps) {
  const animatedStreak = useCountUp(
    userStats?.streak ?? 0,
    1500,
    !!(userStats?.isNewStreak && (userStats?.streak ?? 0) > 0)
  );

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass border border-emerald-500/25 rounded-2xl p-6 sm:p-8 max-w-md w-full relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-3xl font-bold text-emerald-400 mb-1">Booyah!</h2>
          <p className="text-slate-300 text-sm">
            You found <span className="font-bold text-emerald-400">{answer}</span> in{" "}
            {guesses.length} {guesses.length === 1 ? "guess" : "guesses"}
          </p>
          {gameMode === "infinite" && (
            <p className="text-xs text-amber-400 mt-1">Infinite mode (stats not tracked)</p>
          )}
        </div>

        {loggedIn && userStats && gameMode === "daily" && (
          <div className="mb-5 p-4 glass border border-white/10 rounded-xl text-sm">
            {userStats.alreadyPlayed && (
              <p className="text-amber-400 text-xs text-center mb-3">
                Stats already posted for today
              </p>
            )}
            <div className="flex items-center justify-center gap-3 mb-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  userStats.streak > 0 ? "bg-orange-500/20 text-orange-400" : "bg-slate-700 text-slate-500"
                }`}
              >
                {userStats.streak > 0 ? (
                  <span className="font-bold text-sm">
                    {userStats.alreadyPlayed ? userStats.streak : animatedStreak}
                  </span>
                ) : (
                  <span className="text-xs">0</span>
                )}
              </div>
              <div>
                <div className="font-semibold text-white">
                  {userStats.streak} {userStats.streak === 1 ? "day" : "day"} streak
                </div>
                {userStats.isNewStreak && userStats.streak > 0 && !userStats.alreadyPlayed && (
                  <div className="text-xs text-orange-400">
                    {userStats.streak === 1 ? "Streak started!" : "Streak continues!"}
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-400 text-center space-y-1">
              <div>
                Today:{" "}
                <span
                  className={
                    userStats.personalPerformance === "above"
                      ? "text-emerald-400"
                      : userStats.personalPerformance === "below"
                      ? "text-red-400"
                      : "text-slate-300"
                  }
                >
                  {userStats.guessCount} guesses{" "}
                  {userStats.personalPerformance === "above"
                    ? "(better than your avg)"
                    : userStats.personalPerformance === "below"
                    ? "(above your avg)"
                    : "(right at your avg)"}
                </span>
              </div>
              <div>
                Global avg:{" "}
                <span className="text-slate-300">{userStats.globalAverage.toFixed(1)}</span> ·
                Your avg:{" "}
                <span className="text-slate-300">{userStats.averageGuesses.toFixed(1)}</span>
              </div>
              <div className="text-slate-500">Games played: {userStats.totalGames}</div>
            </div>
          </div>
        )}

        {loggedIn && statsPosted && !userStats?.alreadyPlayed && gameMode === "daily" && (
          <p className="text-xs text-emerald-400 text-center mb-3">Stats posted to leaderboard</p>
        )}
        {!loggedIn && gameMode === "daily" && (
          <p className="text-xs text-slate-400 text-center mb-3">
            Log in with Discord to save your stats
          </p>
        )}

        <div className="space-y-3">
          <button
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-semibold text-sm hover:from-blue-600 hover:to-purple-600 hover:scale-[1.02] transition-all duration-200"
          >
            {copySuccess ? (
              <><CheckCircle className="h-4 w-4" />Copied!</>
            ) : (
              <><Copy className="h-4 w-4" />Copy Results</>
            )}
          </button>

          {gameMode === "infinite" && (
            <button
              onClick={onNewInfiniteGame}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold text-sm hover:opacity-90 hover:scale-[1.02] transition-all duration-200"
            >
              <RotateCcw className="h-4 w-4" />
              New Infinite Game
            </button>
          )}

          {!loggedIn && gameMode === "daily" && (
            <button
              onClick={() => window.open(`${API_URL}/api/auth/discord/login`, "_blank")}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all"
            >
              <DiscordIcon className="h-4 w-4" />
              Login and save stats
            </button>
          )}

          <a
            href="https://discord.gg/gmJeQefe5X"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 px-5 py-3 glass border border-white/10 text-slate-300 rounded-xl font-semibold text-sm hover:text-white transition-all"
          >
            <DiscordIcon className="h-4 w-4" />
            Join the Discord
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        </div>

        {gameMode === "daily" && (
          <p className="text-xs text-slate-500 text-center mt-5">Next puzzle at midnight UTC</p>
        )}
      </div>
    </div>
  );
}
