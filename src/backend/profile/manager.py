"""Player profile, TrueSkill rating, and rank management."""
import re
import logging
from typing import Optional

import trueskill

from backend.util.database_context_manager import DBContextManager

logger = logging.getLogger("ProfileManager")

RANKS: dict[Optional[int], str] = {
    None: "Unranked",
    1: "Starter Squid",
    2: "Amateur Squid",
    3: "Cool Squid",
    4: "Pro Squid",
    5: "Legendary Squid",
    6: "God Squid",
}

RANK_EMOJIS: dict[Optional[int], str] = {
    None: "❓",
    1: "🦑",
    2: "🦑🦑",
    3: "⭐",
    4: "⭐⭐",
    5: "💎",
    6: "👑",
}

TIER_ROMAN: dict[Optional[int], str] = {None: "", 1: "I", 2: "II", 3: "III"}


def rank_display(rank: Optional[int], tier: Optional[int]) -> str:
    name = RANKS.get(rank, "Unranked")
    if rank is None:
        return name
    suffix = TIER_ROMAN.get(tier, "")
    return f"{name} {suffix}".strip() if suffix else name


def rank_score(rank: Optional[int], tier: Optional[int]) -> int:
    """Combined 1–18 score for balancing; 0 = unranked."""
    if rank is None:
        return 0
    return (rank - 1) * 3 + (tier or 1)

_SPLATTAG_RE = re.compile(r"^.{1,20}#\d{4}$")
_TS_ENV = trueskill.TrueSkill(draw_probability=0)


def _conservative(mu: float, sigma: float) -> float:
    return round(mu - 3 * sigma, 2)


class ProfileManager:

    # ------------------------------------------------------------------ #
    #  Profile create / fetch                                              #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_or_create(discord_id: int, display_name: str) -> dict:
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT * FROM player_profiles WHERE discord_id = %s", (discord_id,)
            )
            row = await cur.fetchone()
            if row:
                return row
            await cur.execute(
                "INSERT INTO player_profiles (discord_id, display_name) VALUES (%s, %s)",
                (discord_id, display_name)
            )
            await cur.execute("SELECT * FROM player_profiles WHERE discord_id = %s", (discord_id,))
            return await cur.fetchone()

    @staticmethod
    async def get_profile(discord_id: Optional[int] = None, twitch_username: Optional[str] = None) -> Optional[dict]:
        async with DBContextManager(use_dict=True) as cur:
            if discord_id:
                await cur.execute("SELECT * FROM player_profiles WHERE discord_id = %s", (discord_id,))
            else:
                await cur.execute("SELECT * FROM player_profiles WHERE LOWER(twitch_username) = LOWER(%s)", (twitch_username,))
            return await cur.fetchone()

    # ------------------------------------------------------------------ #
    #  Splattag                                                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def set_splattag(discord_id: int, splattag: str, admin_override: bool = False) -> tuple[bool, str]:
        if not _SPLATTAG_RE.match(splattag):
            return False, "Invalid splattag format. Use `Name#1234` (up to 20 chars + # + 4 digits)."
        async with DBContextManager() as cur:
            if not admin_override:
                await cur.execute("SELECT splattag FROM player_profiles WHERE discord_id = %s", (discord_id,))
                row = await cur.fetchone()
                if row and row[0]:
                    return False, f"Your splattag is already set to `{row[0]}`. Contact an admin to change it."
            await cur.execute(
                "SELECT discord_id FROM player_profiles WHERE splattag = %s AND discord_id != %s",
                (splattag, discord_id)
            )
            if await cur.fetchone():
                return False, f"`{splattag}` is already registered to another player."
            await cur.execute(
                """INSERT INTO player_profiles (discord_id, display_name, splattag)
                   VALUES (%s, '', %s)
                   ON DUPLICATE KEY UPDATE splattag = %s""",
                (discord_id, splattag, splattag)
            )
        return True, f"Splattag set to `{splattag}`."

    @staticmethod
    async def set_twitch(discord_id: int, twitch_username: str, admin_override: bool = False) -> tuple[bool, str]:
        username = twitch_username.lower().strip()
        if not username or len(username) > 25:
            return False, "Invalid Twitch username."
        async with DBContextManager() as cur:
            if not admin_override:
                await cur.execute("SELECT twitch_username FROM player_profiles WHERE discord_id = %s", (discord_id,))
                row = await cur.fetchone()
                if row and row[0]:
                    return False, f"Twitch already linked to `{row[0]}`. Contact an admin to change it."
            # Use IS NULL OR != to correctly handle profiles with no discord_id
            await cur.execute(
                "SELECT id FROM player_profiles WHERE LOWER(twitch_username) = %s AND (discord_id IS NULL OR discord_id != %s)",
                (username, discord_id),
            )
            if await cur.fetchone():
                return False, f"`{twitch_username}` is already linked to another profile."
            await cur.execute(
                """INSERT INTO player_profiles (discord_id, display_name, twitch_username)
                   VALUES (%s, '', %s)
                   ON DUPLICATE KEY UPDATE twitch_username = %s""",
                (discord_id, username, username),
            )
        return True, f"Twitch linked to `{username}`. Note: this link is unverified until confirmed from Twitch chat."

    @staticmethod
    async def link_discord_to_twitch_profile(discord_id: int, twitch_username: str) -> tuple[bool, str]:
        """Let a Discord user claim an existing Twitch-signup profile.

        Finds the profile by twitch_username.  Refuses if:
          - The Twitch profile doesn't exist (tell them to sign up first)
          - The Discord ID is already linked to any profile
          - The Twitch profile is already claimed by a different Discord ID
        On success stamps discord_id and sets twitch_native=TRUE (verified from Discord).
        """
        username = twitch_username.lower().strip().lstrip("@")
        if not username:
            return False, "Please provide your Twitch username."
        async with DBContextManager(use_dict=True) as cur:
            # Check this Discord account isn't already linked
            await cur.execute(
                "SELECT id, twitch_username FROM player_profiles WHERE discord_id = %s", (discord_id,)
            )
            existing = await cur.fetchone()
            if existing:
                linked = existing["twitch_username"] or "a profile"
                return False, f"Your Discord is already linked to `{linked}`. Contact an admin if this is wrong."

            # Find the target Twitch profile
            await cur.execute(
                "SELECT id, discord_id FROM player_profiles WHERE LOWER(twitch_username) = %s",
                (username,)
            )
            profile = await cur.fetchone()
            if not profile:
                return False, f"No profile found for Twitch user `{twitch_username}`. Sign up in Twitch chat first with `!signup`."
            if profile["discord_id"] and profile["discord_id"] != discord_id:
                return False, f"That Twitch profile is already linked to a different Discord account. Contact an admin."

            await cur.execute(
                "UPDATE player_profiles SET discord_id = %s, twitch_native = TRUE WHERE id = %s",
                (discord_id, profile["id"])
            )
        return True, f"✅ Successfully linked your Discord to Twitch account `{twitch_username}`! Your stats and tournament history are now connected."

    @staticmethod
    async def set_discord_id_by_profile_id(profile_id: int, discord_id: int) -> tuple[bool, str]:
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id FROM player_profiles WHERE discord_id = %s AND id != %s",
                (discord_id, profile_id)
            )
            if await cur.fetchone():
                return False, "That Discord account is already linked to another profile."
            await cur.execute(
                "UPDATE player_profiles SET discord_id = %s WHERE id = %s",
                (discord_id, profile_id)
            )
            if not cur.rowcount:
                return False, "Player profile not found."
        return True, f"Discord linked."

    @staticmethod
    async def toggle_twitch_native(profile_id: int) -> tuple[bool, str, bool]:
        """Flip twitch_native for a profile. Returns (ok, msg, new_value)."""
        async with DBContextManager() as cur:
            await cur.execute("SELECT twitch_native FROM player_profiles WHERE id = %s", (profile_id,))
            row = await cur.fetchone()
            if not row:
                return False, "Player profile not found.", False
            new_val = not bool(row[0])
            await cur.execute(
                "UPDATE player_profiles SET twitch_native = %s WHERE id = %s", (new_val, profile_id)
            )
        return True, "ok", new_val

    @staticmethod
    async def set_splattag_by_twitch(twitch_username: str, splattag: str) -> tuple[bool, str]:
        """Self-service splattag set from Twitch chat (once only). Creates profile if needed."""
        if not _SPLATTAG_RE.match(splattag):
            return False, "Invalid format. Use Name#1234 (up to 20 chars, then # and 4 digits)."
        username = twitch_username.lower()
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id, splattag FROM player_profiles WHERE LOWER(twitch_username) = %s", (username,)
            )
            row = await cur.fetchone()
            if row and row[1]:
                return False, f"Your splattag is already set to `{row[1]}`. Ask an admin to change it."
            await cur.execute("SELECT 1 FROM player_profiles WHERE splattag = %s", (splattag,))
            if await cur.fetchone():
                return False, f"`{splattag}` is already registered to another player."
            if row:
                await cur.execute(
                    "UPDATE player_profiles SET splattag = %s, twitch_native = TRUE WHERE LOWER(twitch_username) = %s",
                    (splattag, username)
                )
            else:
                await cur.execute(
                    "INSERT INTO player_profiles (twitch_username, display_name, splattag, twitch_native) VALUES (%s, %s, %s, TRUE)",
                    (username, twitch_username, splattag)
                )
        return True, f"Splattag set to `{splattag}`! You can now sign up with !signup."

    # ------------------------------------------------------------------ #
    #  Rank management (admin only)                                        #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def set_predicted_rank(discord_id: int, rank: Optional[int], tier: Optional[int] = None) -> tuple[bool, str]:
        if rank is not None:
            if rank not in range(1, 7):
                return False, "Rank must be 1-6."
            if tier is not None and tier not in range(1, 4):
                return False, "Tier must be 1-3."
        async with DBContextManager() as cur:
            await cur.execute(
                "UPDATE player_profiles SET predicted_rank = %s, predicted_rank_tier = %s WHERE discord_id = %s",
                (rank, tier, discord_id)
            )
            if not cur.rowcount:
                return False, "Player profile not found."
        if rank is None:
            return True, "Predicted rank cleared."
        display = rank_display(rank, tier)
        emoji = RANK_EMOJIS[rank]
        return True, f"Predicted rank set to {emoji} **{display}**."

    @staticmethod
    async def check_rank(discord_id: int) -> tuple[bool, str, Optional[dict]]:
        """Rate-limited rank reveal: once per 30 days per player."""
        from datetime import datetime, timedelta
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                """SELECT `rank`, rank_tier, predicted_rank, predicted_rank_tier, last_rank_check
                   FROM player_profiles WHERE discord_id = %s""",
                (discord_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "No profile found. Play a tournament match first.", None

            last_check = row["last_rank_check"]
            if last_check:
                next_check = last_check + timedelta(days=30)
                if datetime.utcnow() < next_check:
                    days_left = (next_check - datetime.utcnow()).days + 1
                    return False, f"You can check your rank again in **{days_left} day(s)**.", None

            await cur.execute(
                "UPDATE player_profiles SET last_rank_check = NOW() WHERE discord_id = %s",
                (discord_id,)
            )
        return True, "ok", dict(row)

    @staticmethod
    async def set_rank(discord_id: int, rank: Optional[int], tier: Optional[int] = None) -> tuple[bool, str]:
        if rank is not None:
            if rank not in range(1, 7):
                return False, "Rank must be 1–6."
            if tier is not None and tier not in range(1, 4):
                return False, "Tier must be 1–3."
        async with DBContextManager() as cur:
            await cur.execute(
                "UPDATE player_profiles SET `rank` = %s, rank_tier = %s WHERE discord_id = %s",
                (rank, tier, discord_id)
            )
            if not cur.rowcount:
                return False, "Player profile not found."
        from backend.util.role_manager import RoleManager
        await RoleManager.get().apply_rank_roles(discord_id, rank)
        if rank is None:
            return True, "Rank cleared (Unranked)."
        display = rank_display(rank, tier)
        emoji = RANK_EMOJIS[rank]
        return True, f"Rank set to {emoji} **{display}**."

    @staticmethod
    async def promote(discord_id: int) -> tuple[bool, str]:
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT rank FROM player_profiles WHERE discord_id = %s", (discord_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "Player profile not found."
            current = row[0]
            if current is None:
                new_rank = 1
            elif current >= 6:
                return False, f"Already at max rank: {RANK_EMOJIS[6]} **{RANKS[6]}**."
            else:
                new_rank = current + 1
            await cur.execute(
                "UPDATE player_profiles SET rank = %s WHERE discord_id = %s",
                (new_rank, discord_id)
            )
        from backend.util.role_manager import RoleManager
        await RoleManager.get().apply_rank_roles(discord_id, new_rank)
        return True, f"Promoted to {RANK_EMOJIS[new_rank]} **{RANKS[new_rank]}**!"

    # ------------------------------------------------------------------ #
    #  TrueSkill: called after match confirmed                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def update_trueskill_for_match(
        match_id: int,
        winner_team_id: int,
        winner_games: int = 1,
        loser_games: int = 0,
    ) -> list[str]:
        """Update TrueSkill ratings for all players in a completed series.

        Applies one TrueSkill round per game played (winner_games wins for the
        winning team, loser_games wins for the losing team), so a 3-0 sweep
        produces a larger rating change than a 3-2 grind.  Saves a pre-match
        snapshot to tournament_match_ratings so the update can be reverted.

        Returns display names of players skipped (no Discord ID).
        """
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                """SELECT m.team1_id, m.team2_id, m.tournament_id, t.affects_rating
                   FROM tournament_matches m
                   JOIN tournaments t ON t.id = m.tournament_id
                   WHERE m.id = %s""",
                (match_id,)
            )
            match = await cur.fetchone()
            if not match:
                return []

            affects_rating = bool(match["affects_rating"])
            loser_team_id = (
                match["team2_id"] if winner_team_id == match["team1_id"] else match["team1_id"]
            )

            async def get_team_players(team_id):
                await cur.execute(
                    """SELECT s.discord_id, s.display_name,
                              COALESCE(p.trueskill_mu, 25.0) AS mu,
                              COALESCE(p.trueskill_sigma, 8.333) AS sigma,
                              COALESCE(p.games_won, 0) AS games_won,
                              COALESCE(p.games_lost, 0) AS games_lost,
                              COALESCE(p.matches_won, 0) AS matches_won,
                              COALESCE(p.matches_lost, 0) AS matches_lost,
                              COALESCE(p.tournament_wins, 0) AS tournament_wins,
                              COALESCE(p.special_tournament_wins, 0) AS special_tournament_wins
                       FROM tournament_team_members ttm
                       JOIN tournament_signups s ON s.id = ttm.signup_id
                       LEFT JOIN player_profiles p ON p.discord_id = s.discord_id
                       WHERE ttm.team_id = %s""",
                    (team_id,)
                )
                return list(await cur.fetchall())

            skipped: list[str] = []
            winners = await get_team_players(winner_team_id)
            losers = await get_team_players(loser_team_id)

            # --- Ensure snapshot table exists (runtime migration) ---
            try:
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS tournament_match_ratings (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      match_id INT NOT NULL,
                      discord_id BIGINT NOT NULL,
                      mu_before FLOAT NOT NULL,
                      sigma_before FLOAT NOT NULL,
                      games_won_before INT NOT NULL DEFAULT 0,
                      games_lost_before INT NOT NULL DEFAULT 0,
                      matches_won_before INT NOT NULL DEFAULT 0,
                      matches_lost_before INT NOT NULL DEFAULT 0,
                      tournament_wins_before INT NOT NULL DEFAULT 0,
                      special_tournament_wins_before INT NOT NULL DEFAULT 0,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      UNIQUE KEY uq (match_id, discord_id)
                    )
                """)
            except Exception:
                pass

            # --- Save pre-match snapshot ---
            for player in winners + losers:
                if not player["discord_id"]:
                    continue
                await cur.execute(
                    """INSERT IGNORE INTO tournament_match_ratings
                       (match_id, discord_id, mu_before, sigma_before,
                        games_won_before, games_lost_before,
                        matches_won_before, matches_lost_before,
                        tournament_wins_before, special_tournament_wins_before)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (match_id, player["discord_id"],
                     player["mu"], player["sigma"],
                     player["games_won"], player["games_lost"],
                     player["matches_won"], player["matches_lost"],
                     player["tournament_wins"], player["special_tournament_wins"])
                )

            total_games = winner_games + loser_games

            if affects_rating:
                # Run TrueSkill once per game: winner_games rounds where winners win,
                # loser_games rounds where losers win.  This makes 3-0 worth more than 3-2.
                w_ratings = [_TS_ENV.create_rating(p["mu"], p["sigma"]) for p in winners]
                l_ratings = [_TS_ENV.create_rating(p["mu"], p["sigma"]) for p in losers]

                for _ in range(winner_games):
                    w_ratings, l_ratings = _TS_ENV.rate([w_ratings, l_ratings], ranks=[0, 1])

                for _ in range(loser_games):
                    l_ratings, w_ratings = _TS_ENV.rate([l_ratings, w_ratings], ranks=[0, 1])

                for player, new_r in zip(winners, w_ratings):
                    if not player["discord_id"]:
                        skipped.append(player["display_name"])
                        continue
                    await cur.execute(
                        """INSERT INTO player_profiles
                               (discord_id, display_name, trueskill_mu, trueskill_sigma,
                                matches_won, games_won, games_lost, rank, first_played_at)
                           VALUES (%s, '', %s, %s, 1, %s, %s, 1, NOW())
                           ON DUPLICATE KEY UPDATE
                             trueskill_mu = %s,
                             trueskill_sigma = %s,
                             matches_won = matches_won + 1,
                             games_won = games_won + %s,
                             games_lost = games_lost + %s,
                             rank = COALESCE(rank, 1),
                             first_played_at = COALESCE(first_played_at, NOW())""",
                        (player["discord_id"],
                         new_r.mu, new_r.sigma, winner_games, loser_games,
                         new_r.mu, new_r.sigma, winner_games, loser_games)
                    )

                for player, new_r in zip(losers, l_ratings):
                    if not player["discord_id"]:
                        skipped.append(player["display_name"])
                        continue
                    await cur.execute(
                        """INSERT INTO player_profiles
                               (discord_id, display_name, trueskill_mu, trueskill_sigma,
                                matches_lost, games_won, games_lost, rank, first_played_at)
                           VALUES (%s, '', %s, %s, 1, %s, %s, 1, NOW())
                           ON DUPLICATE KEY UPDATE
                             trueskill_mu = %s,
                             trueskill_sigma = %s,
                             matches_lost = matches_lost + 1,
                             games_won = games_won + %s,
                             games_lost = games_lost + %s,
                             rank = COALESCE(rank, 1),
                             first_played_at = COALESCE(first_played_at, NOW())""",
                        (player["discord_id"],
                         new_r.mu, new_r.sigma, loser_games, winner_games,
                         new_r.mu, new_r.sigma, loser_games, winner_games)
                    )
            else:
                for player in winners:
                    if not player["discord_id"]:
                        skipped.append(player["display_name"])
                        continue
                    await cur.execute(
                        """INSERT INTO player_profiles
                               (discord_id, display_name, matches_won, games_won, games_lost, rank, first_played_at)
                           VALUES (%s, '', 1, %s, %s, 1, NOW())
                           ON DUPLICATE KEY UPDATE
                             matches_won = matches_won + 1,
                             games_won = games_won + %s,
                             games_lost = games_lost + %s,
                             rank = COALESCE(rank, 1),
                             first_played_at = COALESCE(first_played_at, NOW())""",
                        (player["discord_id"], winner_games, loser_games, winner_games, loser_games)
                    )
                for player in losers:
                    if not player["discord_id"]:
                        skipped.append(player["display_name"])
                        continue
                    await cur.execute(
                        """INSERT INTO player_profiles
                               (discord_id, display_name, matches_lost, games_won, games_lost, rank, first_played_at)
                           VALUES (%s, '', 1, %s, %s, 1, NOW())
                           ON DUPLICATE KEY UPDATE
                             matches_lost = matches_lost + 1,
                             games_won = games_won + %s,
                             games_lost = games_lost + %s,
                             rank = COALESCE(rank, 1),
                             first_played_at = COALESCE(first_played_at, NOW())""",
                        (player["discord_id"], loser_games, winner_games, loser_games, winner_games)
                    )

        # Update tournament wins for the final match winner
        await ProfileManager._check_tournament_winner(match["tournament_id"], winner_team_id, affects_rating=affects_rating)
        return skipped

    @staticmethod
    async def revert_trueskill_for_match(match_id: int) -> None:
        """Restore pre-match TrueSkill ratings and stat counts from the snapshot saved
        when the match was originally confirmed.  Deletes the snapshot afterwards."""
        async with DBContextManager() as cur:
            try:
                await cur.execute(
                    """SELECT discord_id, mu_before, sigma_before,
                              games_won_before, games_lost_before,
                              matches_won_before, matches_lost_before,
                              tournament_wins_before, special_tournament_wins_before
                       FROM tournament_match_ratings WHERE match_id = %s""",
                    (match_id,)
                )
                rows = await cur.fetchall()
            except Exception:
                return  # table doesn't exist yet — nothing to revert
            for row in rows:
                (discord_id, mu, sigma, gw, gl, mw, ml, tw, stw) = row
                await cur.execute(
                    """UPDATE player_profiles
                       SET trueskill_mu = %s, trueskill_sigma = %s,
                           games_won = %s, games_lost = %s,
                           matches_won = %s, matches_lost = %s,
                           tournament_wins = %s, special_tournament_wins = %s
                       WHERE discord_id = %s""",
                    (mu, sigma, gw, gl, mw, ml, tw, stw, discord_id)
                )
            await cur.execute(
                "DELETE FROM tournament_match_ratings WHERE match_id = %s", (match_id,)
            )

    @staticmethod
    async def adjust_tournament_wins(player_id: int, delta: int) -> tuple[bool, str]:
        """Add (delta=1) or retract (delta=-1) a tournament win for a player."""
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT tournament_wins FROM player_profiles WHERE id = %s", (player_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "Player not found."
            current = row[0] or 0
            new_val = max(0, current + delta)
            await cur.execute(
                "UPDATE player_profiles SET tournament_wins = %s WHERE id = %s",
                (new_val, player_id)
            )
        return True, f"Tournament wins updated to {new_val}."

    @staticmethod
    async def _check_tournament_winner(tournament_id: int, last_winner_team_id: int, affects_rating: bool = True) -> None:
        """If the final match just completed, credit tournament wins to the winning team."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT COUNT(*) AS remaining FROM tournament_matches WHERE tournament_id = %s AND status != 'complete'",
                (tournament_id,)
            )
            if (await cur.fetchone())["remaining"]:
                return  # Not the final match

            await cur.execute(
                """SELECT s.discord_id FROM tournament_team_members ttm
                   JOIN tournament_signups s ON s.id = ttm.signup_id
                   WHERE ttm.team_id = %s AND s.discord_id IS NOT NULL""",
                (last_winner_team_id,)
            )
            winners = await cur.fetchall()
            win_col = "tournament_wins" if affects_rating else "special_tournament_wins"
            for w in winners:
                await cur.execute(
                    f"""INSERT INTO player_profiles (discord_id, display_name, {win_col}, tournaments_played)
                       VALUES (%s, '', 1, 1)
                       ON DUPLICATE KEY UPDATE {win_col} = {win_col} + 1""",
                    (w["discord_id"],)
                )

            # Increment tournaments_played for everyone in the tournament
            await cur.execute(
                """UPDATE player_profiles SET tournaments_played = tournaments_played + 1
                   WHERE discord_id IN (
                     SELECT DISTINCT s.discord_id FROM tournament_signups s
                     JOIN tournament_team_members ttm ON ttm.signup_id = s.id
                     JOIN tournament_teams tt ON tt.id = ttm.team_id
                     WHERE tt.tournament_id = %s AND s.discord_id IS NOT NULL
                   )""",
                (tournament_id,)
            )

    # ------------------------------------------------------------------ #
    #  Leaderboard                                                         #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_leaderboard(sort: str = "rating", limit: int = 20) -> list[dict]:
        order = {
            "rating":       "trueskill_mu - 3 * trueskill_sigma DESC",
            "wins":         "matches_won DESC, tournament_wins DESC",
            "rank":         "rank DESC, trueskill_mu - 3 * trueskill_sigma DESC",
            "tourney_wins": "tournament_wins DESC, trueskill_mu - 3 * trueskill_sigma DESC",
            "special_wins": "special_tournament_wins DESC, trueskill_mu - 3 * trueskill_sigma DESC",
            "total_wins":   "(tournament_wins + special_tournament_wins) DESC, trueskill_mu - 3 * trueskill_sigma DESC",
        }.get(sort, "trueskill_mu - 3 * trueskill_sigma DESC")

        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                f"""SELECT discord_id, display_name, splattag, twitch_username, `rank`, rank_tier,
                           trueskill_mu, trueskill_sigma,
                           tournament_wins, special_tournament_wins, matches_won, matches_lost, tournaments_played
                    FROM player_profiles
                    WHERE first_played_at IS NOT NULL
                    ORDER BY {order}
                    LIMIT %s""",
                (limit,)
            )
            rows = list(await cur.fetchall())

        for r in rows:
            r["rating"] = _conservative(r["trueskill_mu"], r["trueskill_sigma"])
            r["rank_name"] = rank_display(r.get("rank"), r.get("rank_tier"))
            r["rank_emoji"] = RANK_EMOJIS.get(r.get("rank"), "❓")
            total = r["matches_won"] + r["matches_lost"]
            r["win_rate"] = round(r["matches_won"] / total * 100) if total else 0
        return rows

    @staticmethod
    async def get_profile_full(discord_id: int) -> Optional[dict]:
        p = await ProfileManager.get_profile(discord_id=discord_id)
        if not p:
            return None
        p["rating"] = _conservative(p["trueskill_mu"], p["trueskill_sigma"])
        p["rank_name"] = rank_display(p.get("rank"), p.get("rank_tier"))
        p["rank_emoji"] = RANK_EMOJIS.get(p.get("rank"), "❓")
        total = p["matches_won"] + p["matches_lost"]
        p["win_rate"] = round(p["matches_won"] / total * 100) if total else 0
        return p

    @staticmethod
    async def set_rank_by_id(profile_id: int, rank: Optional[int], tier: Optional[int] = None) -> tuple[bool, str]:
        if rank is not None:
            if rank not in range(1, 7):
                return False, "Rank must be 1-6."
            if tier is not None and tier not in range(1, 4):
                return False, "Tier must be 1-3."
        async with DBContextManager() as cur:
            await cur.execute(
                "UPDATE player_profiles SET `rank` = %s, rank_tier = %s WHERE id = %s",
                (rank, tier, profile_id)
            )
            if not cur.rowcount:
                return False, "Player profile not found."
            await cur.execute("SELECT discord_id FROM player_profiles WHERE id = %s", (profile_id,))
            row = await cur.fetchone()
            discord_id = row[0] if row else None
        from backend.util.role_manager import RoleManager
        await RoleManager.get().apply_rank_roles(discord_id, rank)
        if rank is None:
            return True, "Rank cleared (Unranked)."
        return True, f"Rank set to {RANK_EMOJIS[rank]} **{rank_display(rank, tier)}**."

    @staticmethod
    async def set_predicted_rank_by_id(profile_id: int, rank: Optional[int], tier: Optional[int] = None) -> tuple[bool, str]:
        if rank is not None:
            if rank not in range(1, 7):
                return False, "Rank must be 1-6."
            if tier is not None and tier not in range(1, 4):
                return False, "Tier must be 1-3."
        async with DBContextManager() as cur:
            await cur.execute(
                "UPDATE player_profiles SET predicted_rank = %s, predicted_rank_tier = %s WHERE id = %s",
                (rank, tier, profile_id)
            )
            if not cur.rowcount:
                return False, "Player profile not found."
        if rank is None:
            return True, "Predicted rank cleared."
        return True, f"Predicted rank set to {RANK_EMOJIS[rank]} **{rank_display(rank, tier)}**."

    @staticmethod
    async def set_splattag_by_id(profile_id: int, splattag: str) -> tuple[bool, str]:
        if not _SPLATTAG_RE.match(splattag):
            return False, "Invalid splattag format. Use `Name#1234` (up to 20 chars + # + 4 digits)."
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT 1 FROM player_profiles WHERE splattag = %s AND id != %s", (splattag, profile_id)
            )
            if await cur.fetchone():
                return False, f"`{splattag}` is already registered to another player."
            await cur.execute(
                "UPDATE player_profiles SET splattag = %s WHERE id = %s", (splattag, profile_id)
            )
            if not cur.rowcount:
                return False, "Player profile not found."
        return True, f"Splattag set to `{splattag}`."

    @staticmethod
    async def get_all_profiles(search: Optional[str] = None, limit: int = 200) -> list[dict]:
        async with DBContextManager(use_dict=True) as cur:
            # Runtime migration for new columns
            for col, defn in [("games_won", "INT DEFAULT 0"), ("games_lost", "INT DEFAULT 0")]:
                try:
                    await cur.execute(f"ALTER TABLE player_profiles ADD COLUMN {col} {defn}")
                except Exception as e:
                    if "Duplicate column name" not in str(e):
                        raise
            if search:
                pattern = f"%{search}%"
                await cur.execute(
                    """SELECT id, discord_id, display_name, splattag, twitch_username, twitch_native, `rank`, rank_tier,
                              predicted_rank, predicted_rank_tier,
                              trueskill_mu, trueskill_sigma, tournament_wins, special_tournament_wins,
                              matches_won, matches_lost, games_won, games_lost,
                              tournaments_played, first_played_at
                       FROM player_profiles
                       WHERE display_name LIKE %s OR splattag LIKE %s OR twitch_username LIKE %s
                       ORDER BY display_name LIMIT %s""",
                    (pattern, pattern, pattern, limit),
                )
            else:
                await cur.execute(
                    """SELECT id, discord_id, display_name, splattag, twitch_username, twitch_native, `rank`, rank_tier,
                              predicted_rank, predicted_rank_tier,
                              trueskill_mu, trueskill_sigma, tournament_wins, special_tournament_wins,
                              matches_won, matches_lost, games_won, games_lost,
                              tournaments_played, first_played_at
                       FROM player_profiles
                       ORDER BY display_name LIMIT %s""",
                    (limit,),
                )
            rows = list(await cur.fetchall())
        for r in rows:
            if r.get("discord_id") is not None:
                r["discord_id"] = str(r["discord_id"])
            r["rating"] = _conservative(r["trueskill_mu"], r["trueskill_sigma"])
            r["rank_name"] = rank_display(r.get("rank"), r.get("rank_tier"))
            r["rank_emoji"] = RANK_EMOJIS.get(r.get("rank"), "❓")
            total = r["matches_won"] + r["matches_lost"]
            r["win_rate"] = round(r["matches_won"] / total * 100) if total else 0
            if r.get("first_played_at") and hasattr(r["first_played_at"], "isoformat"):
                r["first_played_at"] = r["first_played_at"].isoformat()
        return rows
