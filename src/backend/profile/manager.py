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
        return True, f"Promoted to {RANK_EMOJIS[new_rank]} **{RANKS[new_rank]}**!"

    # ------------------------------------------------------------------ #
    #  TrueSkill: called after match confirmed                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def update_trueskill_for_match(match_id: int, winner_team_id: int) -> None:
        """Update individual TrueSkill ratings for all 8 players in a match."""
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
                return

            affects_rating = bool(match["affects_rating"])
            loser_team_id = (
                match["team2_id"] if winner_team_id == match["team1_id"] else match["team1_id"]
            )

            async def get_team_players(team_id):
                await cur.execute(
                    """SELECT s.discord_id, COALESCE(p.trueskill_mu, 25.0) AS mu,
                              COALESCE(p.trueskill_sigma, 8.333) AS sigma
                       FROM tournament_team_members ttm
                       JOIN tournament_signups s ON s.id = ttm.signup_id
                       LEFT JOIN player_profiles p ON p.discord_id = s.discord_id
                       WHERE ttm.team_id = %s""",
                    (team_id,)
                )
                return list(await cur.fetchall())

            winners = await get_team_players(winner_team_id)
            losers = await get_team_players(loser_team_id)

            if affects_rating:
                w_ratings = [_TS_ENV.create_rating(p["mu"], p["sigma"]) for p in winners]
                l_ratings = [_TS_ENV.create_rating(p["mu"], p["sigma"]) for p in losers]
                new_w, new_l = _TS_ENV.rate([w_ratings, l_ratings], ranks=[0, 1])

                for player, new_r in zip(winners, new_w):
                    if not player["discord_id"]:
                        continue
                    await cur.execute(
                        """INSERT INTO player_profiles (discord_id, display_name, trueskill_mu, trueskill_sigma, matches_won, rank, first_played_at)
                           VALUES (%s, '', %s, %s, 1, 1, NOW())
                           ON DUPLICATE KEY UPDATE
                             trueskill_mu = %s,
                             trueskill_sigma = %s,
                             matches_won = matches_won + 1,
                             rank = COALESCE(rank, 1),
                             first_played_at = COALESCE(first_played_at, NOW())""",
                        (player["discord_id"], new_r.mu, new_r.sigma, new_r.mu, new_r.sigma)
                    )

                for player, new_r in zip(losers, new_l):
                    if not player["discord_id"]:
                        continue
                    await cur.execute(
                        """INSERT INTO player_profiles (discord_id, display_name, trueskill_mu, trueskill_sigma, matches_lost, rank, first_played_at)
                           VALUES (%s, '', %s, %s, 1, 1, NOW())
                           ON DUPLICATE KEY UPDATE
                             trueskill_mu = %s,
                             trueskill_sigma = %s,
                             matches_lost = matches_lost + 1,
                             rank = COALESCE(rank, 1),
                             first_played_at = COALESCE(first_played_at, NOW())""",
                        (player["discord_id"], new_r.mu, new_r.sigma, new_r.mu, new_r.sigma)
                    )
            else:
                # Still track match participation but don't touch TrueSkill
                for player in winners:
                    if not player["discord_id"]:
                        continue
                    await cur.execute(
                        """INSERT INTO player_profiles (discord_id, display_name, matches_won, rank, first_played_at)
                           VALUES (%s, '', 1, 1, NOW())
                           ON DUPLICATE KEY UPDATE
                             matches_won = matches_won + 1,
                             rank = COALESCE(rank, 1),
                             first_played_at = COALESCE(first_played_at, NOW())""",
                        (player["discord_id"],)
                    )
                for player in losers:
                    if not player["discord_id"]:
                        continue
                    await cur.execute(
                        """INSERT INTO player_profiles (discord_id, display_name, matches_lost, rank, first_played_at)
                           VALUES (%s, '', 1, 1, NOW())
                           ON DUPLICATE KEY UPDATE
                             matches_lost = matches_lost + 1,
                             rank = COALESCE(rank, 1),
                             first_played_at = COALESCE(first_played_at, NOW())""",
                        (player["discord_id"],)
                    )

        # Update tournament wins for the final match winner
        await ProfileManager._check_tournament_winner(match["tournament_id"], winner_team_id, affects_rating=affects_rating)

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
            if search:
                pattern = f"%{search}%"
                await cur.execute(
                    """SELECT id, discord_id, display_name, splattag, twitch_username, twitch_native, `rank`, rank_tier,
                              predicted_rank, predicted_rank_tier,
                              trueskill_mu, trueskill_sigma, tournament_wins, special_tournament_wins, matches_won, matches_lost,
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
                              trueskill_mu, trueskill_sigma, tournament_wins, special_tournament_wins, matches_won, matches_lost,
                              tournaments_played, first_played_at
                       FROM player_profiles
                       ORDER BY display_name LIMIT %s""",
                    (limit,),
                )
            rows = list(await cur.fetchall())
        for r in rows:
            r["rating"] = _conservative(r["trueskill_mu"], r["trueskill_sigma"])
            r["rank_name"] = rank_display(r.get("rank"), r.get("rank_tier"))
            r["rank_emoji"] = RANK_EMOJIS.get(r.get("rank"), "❓")
            total = r["matches_won"] + r["matches_lost"]
            r["win_rate"] = round(r["matches_won"] / total * 100) if total else 0
            if r.get("first_played_at") and hasattr(r["first_played_at"], "isoformat"):
                r["first_played_at"] = r["first_played_at"].isoformat()
        return rows
