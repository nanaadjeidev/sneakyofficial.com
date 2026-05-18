import type { Dispatch, SetStateAction } from "react";

export type GameMode = "daily" | "infinite";

export type WeaponClass =
  | "Shooter" | "Charger" | "Roller" | "Brush" | "Slosher"
  | "Splatling" | "Dualies" | "Splatana" | "Brella" | "Rainmaker";

export interface Weapon {
  name: string;
  class: WeaponClass;
  game: "Splatoon" | "Splatoon 2" | "Splatoon 3";
  image: string;
  range: number;
  weight: "Super Slow" | "Slow" | "Normal" | "Fast";
  sub: string;
  special: string;
  hint_released: string;
  hint_base_damage: string;
}

export interface GameData {
  weapons: Weapon[];
  answer: string;
}

export interface Guess {
  id: number;
  weapon: Weapon;
  isCorrect: boolean;
}

export interface SavedDailyState {
  guesses: Guess[];
  gameWon: boolean;
  answer: string;
  statsPosted: boolean;
  hintsUsed: { releaseDate: boolean; baseDamage: boolean };
  completedAt: string;
}

export interface UserData {
  userId: string;
  profileName: string;
  avatarUrl: string;
}

export interface UserStats {
  streak: number;
  totalGames: number;
  averageGuesses: number;
  globalAverage: number;
  isNewStreak: boolean;
  guessCount: number;
  personalPerformance: "above" | "below" | "equal";
  playedAt?: string;
  alreadyPlayed: boolean;
}

export interface UseAuthReturn {
  loggedIn: boolean;
  userData: UserData | null;
  setLoggedIn: Dispatch<SetStateAction<boolean>>;
  setUserData: Dispatch<SetStateAction<UserData | null>>;
  isLoading: boolean;
}
