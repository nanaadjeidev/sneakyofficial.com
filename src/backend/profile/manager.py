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
    async def set_splattag(discord_id: int, splattag: str) -> tuple[bool, str]:
        if not _SPLATTAG_RE.match(splattag):
            return False, "Invalid splattag format. Use `Name#1234` (up to 20 chars + # + 4 digits)."
        async with DBContextManager() as cur:
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

    # ------------------------------------------------------------------ #
    #  Rank management (admin only)                                        #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def set_rank(discord_id: int, rank: int) -> tuple[bool, str]:
        if rank not in range(1, 7):
            return False, "Rank must be 1–6."
        async with DBContextManager() as cur:
            await cur.execute(
                "UPDATE player_profiles SET rank = %s WHERE discord_id = %s",
                (rank, discord_id)
            )
            if not cur.rowcount:
                return False, "Player profile not found. They must play a match first."
        name = RANKS[rank]
        emoji = RANK_EMOJIS[rank]
        return True, f"Rank set to {emoji} **{name}**."

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
    #  TrueSkill — called after match confirmed                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def update_trueskill_for_match(match_id: int, winner_team_id: int) -> None:
        """Update individual TrueSkill ratings for all 8 players in a match."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT team1_id, team2_id, tournament_id FROM tournament_matches WHERE id = %s",
                (match_id,)
            )
            match = await cur.fetchone()
            if not match:
                return

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

            w_ratings = [_TS_ENV.create_rating(p["mu"], p["sigma"]) for p in winners]
            l_ratings = [_TS_ENV.create_rating(p["mu"], p["sigma"]) for p in losers]

            new_w, new_l = _TS_ENV.rate([w_ratings, l_ratings], ranks=[0, 1])

            now_str = "NOW()"
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

        # Update tournament wins for the final match winner
        await ProfileManager._check_tournament_winner(match["tournament_id"], winner_team_id)

    @staticmethod
    async def _check_tournament_winner(tournament_id: int, last_winner_team_id: int) -> None:
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
            for w in winners:
                await cur.execute(
                    """INSERT INTO player_profiles (discord_id, display_name, tournament_wins, tournaments_played)
                       VALUES (%s, '', 1, 1)
                       ON DUPLICATE KEY UPDATE tournament_wins = tournament_wins + 1""",
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
            "rating": "trueskill_mu - 3 * trueskill_sigma DESC",
            "wins":   "matches_won DESC, tournament_wins DESC",
            "rank":   "rank DESC, trueskill_mu - 3 * trueskill_sigma DESC",
        }.get(sort, "trueskill_mu - 3 * trueskill_sigma DESC")

        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                f"""SELECT discord_id, display_name, splattag, twitch_username, rank,
                           trueskill_mu, trueskill_sigma,
                           tournament_wins, matches_won, matches_lost, tournaments_played
                    FROM player_profiles
                    WHERE first_played_at IS NOT NULL
                    ORDER BY {order}
                    LIMIT %s""",
                (limit,)
            )
            rows = list(await cur.fetchall())

        for r in rows:
            r["rating"] = _conservative(r["trueskill_mu"], r["trueskill_sigma"])
            r["rank_name"] = RANKS.get(r["rank"], "Unranked")
            r["rank_emoji"] = RANK_EMOJIS.get(r["rank"], "❓")
            total = r["matches_won"] + r["matches_lost"]
            r["win_rate"] = round(r["matches_won"] / total * 100) if total else 0
        return rows

    @staticmethod
    async def get_profile_full(discord_id: int) -> Optional[dict]:
        p = await ProfileManager.get_profile(discord_id=discord_id)
        if not p:
            return None
        p["rating"] = _conservative(p["trueskill_mu"], p["trueskill_sigma"])
        p["rank_name"] = RANKS.get(p["rank"], "Unranked")
        p["rank_emoji"] = RANK_EMOJIS.get(p["rank"], "❓")
        total = p["matches_won"] + p["matches_lost"]
        p["win_rate"] = round(p["matches_won"] / total * 100) if total else 0
        return p
