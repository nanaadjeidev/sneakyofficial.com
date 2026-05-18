import { useState, useEffect, useRef, useCallback } from "react";
import type { UseAuthReturn, UserData } from "../types/splatdle";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function useAuth(): UseAuthReturn {
  const [loggedIn, setLoggedIn] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => { return () => { mounted.current = false; }; }, []);

  const fetchAuthStatus = useCallback(async (retry = true): Promise<void> => {
    try {
      const res = await fetch(`${API_URL}/api/auth/discord/status`, {
        credentials: "include",
      });
      if (res.status === 401 && retry) {
        const r = await fetch(`${API_URL}/api/auth/discord/refresh-token`, {
          method: "POST", credentials: "include",
        });
        if (r.ok) { await fetchAuthStatus(false); return; }
      }
      if (!res.ok) throw new Error("Auth check failed");
      const data: { logged_in: boolean; player?: { id: string; username: string; avatar?: string } } =
        await res.json();
      if (!mounted.current) return;
      setLoggedIn(data.logged_in);
      setUserData(
        data.logged_in && data.player
          ? {
              userId: data.player.id,
              profileName: data.player.username,
              avatarUrl: data.player.avatar
                ? `https://cdn.discordapp.com/avatars/${data.player.id}/${data.player.avatar}.png`
                : "/default-avatar.png",
            }
          : null
      );
    } catch {
      if (mounted.current) { setLoggedIn(false); setUserData(null); }
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthStatus();
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/auth/discord/refresh-token`, { method: "POST", credentials: "include" });
    }, 55 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAuthStatus]);

  return { loggedIn, userData, setLoggedIn, setUserData, isLoading };
}
