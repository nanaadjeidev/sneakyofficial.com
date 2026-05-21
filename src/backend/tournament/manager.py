"""Shared tournament logic used by both the Discord bot and Twitch bot."""
import logging
import math
import random
import string
from typing import Optional


def _random_room_code() -> str:
    return "".join(random.choices(string.digits, k=4))

from backend.util.database_context_manager import DBContextManager
# Imported lazily inside confirm_win to avoid circular imports
_profile_manager = None


def _get_profile_manager():
    global _profile_manager
    if _profile_manager is None:
        from backend.profile.manager import ProfileManager
        _profile_manager = ProfileManager
    return _profile_manager

logger = logging.getLogger("TournamentManager")


async def _ensure_is_sub_column(cur) -> None:
    """Add is_sub to tournament_team_members if it doesn't exist yet.
    ADD COLUMN IF NOT EXISTS requires MySQL 8.0.3+; use try/except for compatibility."""
    try:
        await cur.execute(
            "ALTER TABLE tournament_team_members ADD COLUMN is_sub TINYINT(1) NOT NULL DEFAULT 0"
        )
    except Exception as e:
        if "Duplicate column name" not in str(e):
            raise

ADJECTIVES = [
    "Booyah", "Fresh", "Inky", "Radical", "Sneaky", "Fierce", "Elite",
    "Turbo", "Blazing", "Oceanic", "Deadly", "Tactical", "Grizzco", "Anarchy",
    "Salty", "Cracked", "Sweaty", "Stealthy", "Tenta", "Fuzzy",
]
SUBJECTS = [
    "Inklings", "Octolings", "Squids", "Tentacles", "Rollers", "Chargers",
    "Sloshers", "Dualies", "Brellas", "Splatlings", "Krakens", "Salmonids",
    "Agents", "Warriors", "Champions", "Raiders", "Stingers", "Zipcasters",
]


def _generate_team_name(used: set[str]) -> str:
    for _ in range(50):
        name = f"{random.choice(ADJECTIVES)} {random.choice(SUBJECTS)}"
        if name not in used:
            return name
    return f"Team {random.randint(100, 999)}"


def _next_power_of_two(n: int) -> int:
    p = 1
    while p < n:
        p *= 2
    return p


def _build_r1_slots(team_ids: list[int]) -> list[tuple[Optional[int], Optional[int]]]:
    """Pair teams into R1 matches, distributing byes to top seeds."""
    n = len(team_ids)
    p = _next_power_of_two(n)
    byes = p - n
    slots: list[Optional[int]] = []

    # Interleave: first 'byes' pairs are (team, None), rest are (team, team)
    team_idx = 0
    for i in range(p // 2):
        if i < byes:
            slots.append(team_ids[team_idx])
            slots.append(None)
            team_idx += 1
        else:
            slots.append(team_ids[team_idx])
            team_idx += 1
            slots.append(team_ids[team_idx])
            team_idx += 1

    return [(slots[i], slots[i + 1]) for i in range(0, p, 2)]


class TournamentManager:

    # ------------------------------------------------------------------ #
    #  Tournament lifecycle                                                #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def create(guild_id: int, name: str, channel_id: int, created_by: int, team_size: int = 4, special_rules: Optional[str] = None, affects_rating: bool = True) -> tuple[bool, str, Optional[int]]:
        """Open a new tournament for signups. Returns (ok, message, tournament_id)."""
        team_size = max(2, min(4, team_size))
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id FROM tournaments WHERE guild_id = %s AND status IN ('signup','active')",
                (guild_id,)
            )
            if await cur.fetchone():
                return False, "A tournament is already running. Cancel it first.", None

            await cur.execute(
                "INSERT INTO tournaments (guild_id, name, status, team_size, special_rules, affects_rating, channel_id, created_by) VALUES (%s, %s, 'signup', %s, %s, %s, %s, %s)",
                (guild_id, name, team_size, special_rules or None, affects_rating, channel_id, created_by)
            )
            tid = cur.lastrowid
        return True, f"Tournament **{name}** created! ({team_size}v{team_size}) Sign-ups are open.", tid

    @staticmethod
    async def cancel(guild_id: int) -> tuple[bool, str]:
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id, name FROM tournaments WHERE guild_id = %s AND status IN ('signup','active') ORDER BY created_at DESC LIMIT 1",
                (guild_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "No active tournament to cancel."
            tid, name = row
            await cur.execute("UPDATE tournaments SET status = 'cancelled' WHERE id = %s", (tid,))
            # Clear all associated data so the next tournament starts clean
            await cur.execute("DELETE FROM tournament_round_schedule WHERE tournament_id = %s", (tid,))
            await cur.execute("DELETE FROM tournament_matches WHERE tournament_id = %s", (tid,))
            await cur.execute("DELETE FROM tournament_teams WHERE tournament_id = %s", (tid,))
            await cur.execute("DELETE FROM tournament_signups WHERE tournament_id = %s", (tid,))
        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({"event": "tournament_cancelled", "tournament_id": tid})
        return True, f"Tournament **{name}** has been cancelled."

    # ------------------------------------------------------------------ #
    #  Sign-ups                                                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def signup(guild_id: int, discord_id: Optional[int], twitch_username: Optional[str], display_name: str) -> tuple[bool, str]:
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id, name FROM tournaments WHERE guild_id = %s AND status = 'signup' ORDER BY created_at DESC LIMIT 1",
                (guild_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "No tournament is currently open for sign-ups."
            tid, name = row

            # Profile completeness check
            if discord_id:
                await cur.execute(
                    "SELECT splattag, twitch_username FROM player_profiles WHERE discord_id = %s", (discord_id,)
                )
                profile = await cur.fetchone()
                if not profile or not profile[0]:
                    return False, "You need to set your Splatoon tag first! Use `/profile splattag Name#1234` on Discord."
                if not profile[1]:
                    return False, "You need to link your Twitch account first! Use `/profile twitch <username>` on Discord."
            elif twitch_username:
                await cur.execute(
                    "SELECT splattag, discord_id FROM player_profiles WHERE LOWER(twitch_username) = LOWER(%s)",
                    (twitch_username,),
                )
                profile = await cur.fetchone()
                if not profile or not profile[0]:
                    return False, "You need a Splatoon tag to sign up. Use !splattag YourName#1234 in chat first."
                if not profile[1]:
                    return False, "You need to link your Discord account to sign up. Join our Discord and use /profile twitch to link up."
                await cur.execute(
                    "UPDATE player_profiles SET twitch_native = TRUE WHERE LOWER(twitch_username) = LOWER(%s)",
                    (twitch_username,)
                )

            # Duplicate check
            if discord_id:
                await cur.execute(
                    "SELECT id FROM tournament_signups WHERE tournament_id = %s AND discord_id = %s",
                    (tid, discord_id)
                )
            else:
                await cur.execute(
                    "SELECT id FROM tournament_signups WHERE tournament_id = %s AND twitch_username = %s",
                    (tid, twitch_username)
                )
            if await cur.fetchone():
                return False, f"You're already signed up for **{name}**!"

            await cur.execute(
                "INSERT INTO tournament_signups (tournament_id, discord_id, twitch_username, display_name) VALUES (%s, %s, %s, %s)",
                (tid, discord_id, twitch_username, display_name)
            )

            await cur.execute("SELECT COUNT(*) FROM tournament_signups WHERE tournament_id = %s", (tid,))
            count = (await cur.fetchone())[0]
        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "signup",
            "tournament_id": tid,
            "display_name": display_name,
            "discord_id": str(discord_id) if discord_id else None,
            "twitch_username": twitch_username,
            "count": count,
        })
        return True, f"✅ **{display_name}** signed up for **{name}**! ({count} players so far)"

    @staticmethod
    async def leave(guild_id: int, discord_id: Optional[int], twitch_username: Optional[str]) -> tuple[bool, str]:
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id, name FROM tournaments WHERE guild_id = %s AND status = 'signup' ORDER BY created_at DESC LIMIT 1",
                (guild_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "No tournament is currently open for sign-ups."
            tid, name = row

            if discord_id:
                await cur.execute(
                    "SELECT display_name FROM tournament_signups WHERE tournament_id = %s AND discord_id = %s",
                    (tid, discord_id)
                )
            else:
                await cur.execute(
                    "SELECT display_name FROM tournament_signups WHERE tournament_id = %s AND twitch_username = %s",
                    (tid, twitch_username)
                )
            name_row = await cur.fetchone()

            if discord_id:
                await cur.execute(
                    "DELETE FROM tournament_signups WHERE tournament_id = %s AND discord_id = %s",
                    (tid, discord_id)
                )
            else:
                await cur.execute(
                    "DELETE FROM tournament_signups WHERE tournament_id = %s AND twitch_username = %s",
                    (tid, twitch_username)
                )
            if not cur.rowcount:
                return False, "You're not signed up for this tournament."

            await cur.execute("SELECT COUNT(*) FROM tournament_signups WHERE tournament_id = %s", (tid,))
            count = (await cur.fetchone())[0]

        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "leave",
            "tournament_id": tid,
            "display_name": name_row[0] if name_row else None,
            "discord_id": str(discord_id) if discord_id else None,
            "twitch_username": twitch_username,
            "count": count,
        })
        return True, f"You've left **{name}**."

    # ------------------------------------------------------------------ #
    #  Lock & bracket generation                                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def lock(guild_id: int) -> tuple[bool, str, list[dict]]:
        """Close sign-ups, form teams, generate bracket. Returns (ok, message, teams_list)."""
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id, name, team_size FROM tournaments WHERE guild_id = %s AND status = 'signup' ORDER BY created_at DESC LIMIT 1",
                (guild_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "No tournament is open for sign-ups.", []
            tid, tournament_name, team_size = row

            # Collect pre-created teams
            await cur.execute(
                """SELECT tt.id, tt.team_name, tt.captain_discord_id,
                          GROUP_CONCAT(s.id ORDER BY s.signed_up_at SEPARATOR ',') AS signup_ids,
                          GROUP_CONCAT(s.display_name ORDER BY s.signed_up_at SEPARATOR '||') AS member_names
                   FROM tournament_teams tt
                   JOIN tournament_team_members ttm ON ttm.team_id = tt.id
                   JOIN tournament_signups s ON s.id = ttm.signup_id
                   WHERE tt.tournament_id = %s AND tt.is_pre_created = TRUE
                   GROUP BY tt.id""",
                (tid,)
            )
            pre_teams_raw = list(await cur.fetchall())

            used_names: set[str] = set()
            team_ids: list[int] = []
            teams_info: list[dict] = []
            assigned_signup_ids: set[int] = set()

            for row in pre_teams_raw:
                team_id, tname, cap_id, sids_str, mnames_str = row
                member_names = mnames_str.split("||") if mnames_str else []
                sids = [int(x) for x in sids_str.split(",") if x]
                assigned_signup_ids.update(sids)
                used_names.add(tname)
                team_ids.append(team_id)
                teams_info.append({"id": team_id, "name": tname, "members": member_names, "captain_discord_id": cap_id})
                # Mark as no longer pre-created (now locked)
                await cur.execute("UPDATE tournament_teams SET is_pre_created = FALSE WHERE id = %s", (team_id,))

            # Get unassigned signups for auto-grouping
            await cur.execute(
                "SELECT id, display_name FROM tournament_signups WHERE tournament_id = %s AND (assigned_team_id IS NULL) ORDER BY RAND()",
                (tid,)
            )
            unassigned = list(await cur.fetchall())

            extra_teams = len(unassigned) // team_size
            dropped_count = len(unassigned) - extra_teams * team_size

            for i in range(extra_teams):
                members = unassigned[i * team_size:(i + 1) * team_size]
                gen_name = _generate_team_name(used_names)
                used_names.add(gen_name)
                seed = len(team_ids) + 1

                # Captain = first Discord-linked member
                cap_id = None
                for sid, _ in members:
                    await cur.execute(
                        "SELECT discord_id FROM tournament_signups WHERE id = %s AND discord_id IS NOT NULL",
                        (sid,)
                    )
                    r = await cur.fetchone()
                    if r:
                        cap_id = r[0]
                        break

                await cur.execute(
                    """INSERT INTO tournament_teams
                       (tournament_id, team_name, seed, captain_discord_id, is_pre_created)
                       VALUES (%s, %s, %s, %s, FALSE)""",
                    (tid, gen_name, seed, cap_id)
                )
                team_id = cur.lastrowid
                team_ids.append(team_id)

                member_names = []
                for signup_id, display_name in members:
                    await cur.execute(
                        "INSERT INTO tournament_team_members (team_id, signup_id) VALUES (%s, %s)",
                        (team_id, signup_id)
                    )
                    member_names.append(display_name)

                teams_info.append({"id": team_id, "name": gen_name, "members": member_names, "captain_discord_id": cap_id})

            num_teams = len(team_ids)
            if num_teams < 2:
                min_players = team_size * 2
                needed = min_players - (len(pre_teams_raw) * team_size + len(unassigned))
                await cur.execute("SELECT COUNT(*) FROM tournament_signups WHERE tournament_id = %s", (tid,))
                total_signups = (await cur.fetchone())[0]
                detail = (
                    f"Found {len(pre_teams_raw)} saved team(s) and {len(unassigned)} unassigned player(s) "
                    f"({total_signups} total signups in this tournament)."
                )
                return False, f"Need at least {min_players} players (2 full teams of {team_size}). Need {max(0, needed)} more. {detail}", []

            # Generate R1 slot pairs
            r1_matches = _build_r1_slots(team_ids)
            p = _next_power_of_two(num_teams)
            total_rounds = int(math.log2(p))

            # Pre-create all match slots for every round
            match_count = p // 2
            for rnd in range(1, total_rounds + 1):
                for mnum in range(1, match_count + 1):
                    if rnd == 1:
                        t1, t2 = r1_matches[mnum - 1]
                        is_bye = t2 is None
                        status = "complete" if is_bye else "pending"
                        winner_id = t1 if is_bye else None
                        home_team = random.choice([t1, t2]) if not is_bye else None
                        room_code = _random_room_code() if not is_bye else None
                        await cur.execute(
                            """INSERT INTO tournament_matches
                               (tournament_id, round, match_number, team1_id, team2_id, winner_id, status, home_team_id, room_code)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                            (tid, rnd, mnum, t1, t2, winner_id, status, home_team, room_code)
                        )
                    else:
                        await cur.execute(
                            """INSERT INTO tournament_matches
                               (tournament_id, round, match_number, team1_id, team2_id, winner_id, status)
                               VALUES (%s, %s, %s, NULL, NULL, NULL, 'pending')""",
                            (tid, rnd, mnum)
                        )
                match_count //= 2

            # Advance all bye winners from R1
            await cur.execute(
                "SELECT id, winner_id, match_number FROM tournament_matches WHERE tournament_id = %s AND round = 1 AND status = 'complete'",
                (tid,)
            )
            bye_rows = list(await cur.fetchall())
            for _, winner_id, match_num in bye_rows:
                await TournamentManager._advance_winner(cur, tid, 1, match_num, winner_id)

            await cur.execute("UPDATE tournaments SET status = 'active' WHERE id = %s", (tid,))

        drop_msg = (
            f" ({dropped_count} player(s) dropped — not enough for a full team)"
            if dropped_count else ""
        )
        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({"event": "tournament_locked", "tournament_id": tid})
        return True, f"**{tournament_name}** locked! {num_teams} teams formed.{drop_msg}", teams_info

    # ------------------------------------------------------------------ #
    #  Win reporting & confirmation                                        #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_player_match(tournament_id: int, discord_id: Optional[int] = None, twitch_username: Optional[str] = None) -> Optional[dict]:
        """Find the current pending match for a player."""
        async with DBContextManager(use_dict=True) as cur:
            if discord_id:
                await cur.execute(
                    """SELECT ttm.team_id FROM tournament_team_members ttm
                       JOIN tournament_signups s ON ttm.signup_id = s.id
                       WHERE s.tournament_id = %s AND s.discord_id = %s""",
                    (tournament_id, discord_id)
                )
            else:
                await cur.execute(
                    """SELECT ttm.team_id FROM tournament_team_members ttm
                       JOIN tournament_signups s ON ttm.signup_id = s.id
                       WHERE s.tournament_id = %s AND s.twitch_username = %s""",
                    (tournament_id, twitch_username)
                )
            team_row = await cur.fetchone()
            if not team_row:
                return None
            team_id = team_row["team_id"]

            await cur.execute(
                """SELECT id, round, match_number, team1_id, team2_id, status
                   FROM tournament_matches
                   WHERE tournament_id = %s AND status = 'pending'
                     AND (team1_id = %s OR team2_id = %s)
                   ORDER BY round ASC LIMIT 1""",
                (tournament_id, team_id, team_id)
            )
            match = await cur.fetchone()
            if match:
                match["player_team_id"] = team_id
            return match

    @staticmethod
    async def get_player_active_match(tournament_id: int, discord_id: Optional[int] = None, twitch_username: Optional[str] = None) -> Optional[dict]:
        """Find the current pending or awaiting-confirmation match for a player, with reported_winner_id."""
        async with DBContextManager(use_dict=True) as cur:
            if discord_id:
                await cur.execute(
                    """SELECT ttm.team_id FROM tournament_team_members ttm
                       JOIN tournament_signups s ON ttm.signup_id = s.id
                       WHERE s.tournament_id = %s AND (
                           s.discord_id = %s
                           OR (s.discord_id IS NULL AND s.twitch_username IS NOT NULL
                               AND LOWER(s.twitch_username) = (
                                   SELECT LOWER(twitch_username) FROM player_profiles
                                   WHERE discord_id = %s AND twitch_username IS NOT NULL LIMIT 1
                               ))
                       )""",
                    (tournament_id, discord_id, discord_id)
                )
            else:
                await cur.execute(
                    """SELECT ttm.team_id FROM tournament_team_members ttm
                       JOIN tournament_signups s ON ttm.signup_id = s.id
                       WHERE s.tournament_id = %s AND s.twitch_username = %s""",
                    (tournament_id, twitch_username)
                )
            team_row = await cur.fetchone()
            if not team_row:
                return None
            team_id = team_row["team_id"]

            await cur.execute(
                """SELECT m.id, m.round, m.match_number, m.team1_id, m.team2_id, m.status,
                          t1.team_name AS team1_name, t2.team_name AS team2_name,
                          wr.reported_winner_id, m.home_team_id, m.room_code
                   FROM tournament_matches m
                   LEFT JOIN tournament_teams t1 ON t1.id = m.team1_id
                   LEFT JOIN tournament_teams t2 ON t2.id = m.team2_id
                   LEFT JOIN tournament_win_reports wr ON wr.match_id = m.id AND wr.status = 'pending'
                   WHERE m.tournament_id = %s AND m.status IN ('pending', 'awaiting_confirmation')
                     AND (m.team1_id = %s OR m.team2_id = %s)
                   ORDER BY m.round ASC LIMIT 1""",
                (tournament_id, team_id, team_id)
            )
            match = await cur.fetchone()
            if match:
                match["player_team_id"] = team_id
                match["opposing_team_id"] = match["team2_id"] if team_id == match["team1_id"] else match["team1_id"]
                match["is_home_team"] = match["home_team_id"] == team_id
                if not match["is_home_team"]:
                    match["room_code"] = None  # away team never sees the code
            return match

    @staticmethod
    async def get_player_team_id(tournament_id: int, discord_id: Optional[int] = None, twitch_username: Optional[str] = None) -> Optional[int]:
        """Return the team_id for a player (main or sub) in the given tournament, or None."""
        async with DBContextManager(use_dict=True) as cur:
            if discord_id:
                await cur.execute(
                    """SELECT ttm.team_id FROM tournament_team_members ttm
                       JOIN tournament_signups s ON ttm.signup_id = s.id
                       WHERE s.tournament_id = %s AND (
                           s.discord_id = %s
                           OR (s.discord_id IS NULL AND s.twitch_username IS NOT NULL
                               AND LOWER(s.twitch_username) = (
                                   SELECT LOWER(twitch_username) FROM player_profiles
                                   WHERE discord_id = %s AND twitch_username IS NOT NULL LIMIT 1
                               ))
                       ) LIMIT 1""",
                    (tournament_id, discord_id, discord_id)
                )
            else:
                await cur.execute(
                    """SELECT ttm.team_id FROM tournament_team_members ttm
                       JOIN tournament_signups s ON ttm.signup_id = s.id
                       WHERE s.tournament_id = %s AND LOWER(s.twitch_username) = LOWER(%s) LIMIT 1""",
                    (tournament_id, twitch_username)
                )
            row = await cur.fetchone()
            return row["team_id"] if row else None

    @staticmethod
    async def report_win(
        match_id: int,
        winner_team_id: int,
        reporter_discord: Optional[int] = None,
        reporter_twitch: Optional[str] = None,
    ) -> tuple[bool, str]:
        """Create a pending win report. Returns (ok, message)."""
        async with DBContextManager() as cur:
            await cur.execute("SELECT status, tournament_id FROM tournament_matches WHERE id = %s", (match_id,))
            row = await cur.fetchone()
            if not row:
                return False, "Match not found."
            if row[0] != "pending":
                return False, "This match has already been decided."
            tournament_id = row[1]

            await cur.execute(
                "SELECT id FROM tournament_win_reports WHERE match_id = %s AND status = 'pending'",
                (match_id,)
            )
            if await cur.fetchone():
                return False, "A result has already been reported for this match. Awaiting confirmation."

            await cur.execute(
                """INSERT INTO tournament_win_reports
                   (match_id, reported_winner_id, reported_by_discord, reported_by_twitch)
                   VALUES (%s, %s, %s, %s)""",
                (match_id, winner_team_id, reporter_discord, reporter_twitch)
            )
            await cur.execute(
                "UPDATE tournament_matches SET status = 'awaiting_confirmation' WHERE id = %s",
                (match_id,)
            )
        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "match_reported",
            "tournament_id": tournament_id,
            "match_id": match_id,
            "winner_team_id": winner_team_id,
        })
        return True, "Result reported! Waiting for the opposing team to confirm."

    @staticmethod
    async def confirm_win(
        match_id: int,
        confirmer_discord: Optional[int] = None,
        confirmer_twitch: Optional[str] = None,
    ) -> tuple[bool, str, Optional[int]]:
        """Confirm a pending win report. Returns (ok, message, winner_team_id)."""
        from backend.util.config import global_config
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT reported_winner_id FROM tournament_win_reports WHERE match_id = %s AND status = 'pending'",
                (match_id,)
            )
            report = await cur.fetchone()
            if not report:
                return False, "No pending result to confirm for this match.", None
            winner_team_id = report[0]

            await cur.execute(
                "SELECT team1_id, team2_id, tournament_id, round, match_number FROM tournament_matches WHERE id = %s",
                (match_id,)
            )
            match = await cur.fetchone()
            if not match:
                return False, "Match not found.", None
            team1_id, team2_id, tournament_id, rnd, match_num = match

            # The confirmer must be on the opposing team (admins may bypass)
            opposing_team_id = team2_id if winner_team_id == team1_id else team1_id

            is_admin = bool(confirmer_discord and confirmer_discord in global_config.tournament_admin_ids)
            if not is_admin:
                if confirmer_discord:
                    await cur.execute(
                        """SELECT 1 FROM tournament_team_members ttm
                           JOIN tournament_signups s ON ttm.signup_id = s.id
                           WHERE ttm.team_id = %s AND s.discord_id = %s""",
                        (opposing_team_id, confirmer_discord)
                    )
                else:
                    await cur.execute(
                        """SELECT 1 FROM tournament_team_members ttm
                           JOIN tournament_signups s ON ttm.signup_id = s.id
                           WHERE ttm.team_id = %s AND LOWER(s.twitch_username) = LOWER(%s)""",
                        (opposing_team_id, confirmer_twitch)
                    )
                if not await cur.fetchone():
                    return False, "Only a member of the opposing team can confirm this result.", None

            await cur.execute(
                """UPDATE tournament_win_reports SET status = 'confirmed', confirmed_by_discord = %s, confirmed_by_twitch = %s
                   WHERE match_id = %s AND status = 'pending'""",
                (confirmer_discord, confirmer_twitch, match_id)
            )
            await cur.execute(
                "UPDATE tournament_matches SET winner_id = %s, status = 'complete' WHERE id = %s",
                (winner_team_id, match_id)
            )

            await TournamentManager._advance_winner(cur, tournament_id, rnd, match_num, winner_team_id)

            await cur.execute("SELECT team_name FROM tournament_teams WHERE id = %s", (winner_team_id,))
            name_row = await cur.fetchone()
            winner_name = name_row[0] if name_row else "Unknown"

            # Check if tournament is now complete (final match done)
            await cur.execute(
                "SELECT COUNT(*) FROM tournament_matches WHERE tournament_id = %s AND status != 'complete'",
                (tournament_id,)
            )
            remaining = (await cur.fetchone())[0]
            if not remaining:
                await cur.execute("UPDATE tournaments SET status = 'complete' WHERE id = %s", (tournament_id,))

        # Update TrueSkill ratings asynchronously (non-blocking, best-effort)
        skipped_players: list[str] = []
        try:
            skipped_players = await _get_profile_manager().update_trueskill_for_match(match_id, winner_team_id)
        except Exception as e:
            logger.warning("TrueSkill update failed for match %s: %s", match_id, e)

        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "match_complete",
            "tournament_id": tournament_id,
            "match_id": match_id,
            "winner_team_id": winner_team_id,
            "winner_name": winner_name,
        })
        confirmed_by = "Admin override" if is_admin else "Opponent"
        msg = f"✅ Result confirmed ({confirmed_by})! **{winner_name}** wins!"
        if skipped_players:
            names = ", ".join(skipped_players)
            msg += f"\n⚠️ Stats not updated for: {names} (no linked Discord account)."
        return True, msg, winner_team_id

    @staticmethod
    async def dispute_win(match_id: int) -> tuple[bool, str]:
        """Flag a result as disputed for admin review."""
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id FROM tournament_win_reports WHERE match_id = %s AND status = 'pending'",
                (match_id,)
            )
            if not await cur.fetchone():
                return False, "No pending result to dispute."
            await cur.execute(
                "UPDATE tournament_win_reports SET status = 'disputed' WHERE match_id = %s AND status = 'pending'",
                (match_id,)
            )
            await cur.execute(
                "UPDATE tournament_matches SET status = 'pending' WHERE id = %s",
                (match_id,)
            )
        return True, "⚠️ Result disputed. An admin needs to resolve this match manually."

    # ------------------------------------------------------------------ #
    #  Admin team pre-assignment                                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_signups_for_admin(tournament_id: int) -> dict:
        """Return all signups + current pre-team assignments for the admin UI."""
        async with DBContextManager(use_dict=True) as cur:
            await _ensure_is_sub_column(cur)

            await cur.execute(
                """SELECT s.id, s.display_name, s.discord_id, s.twitch_username, s.assigned_team_id,
                          COALESCE(pp.trueskill_mu, 25.0) AS rating,
                          pp.`rank`, pp.rank_tier, pp.splattag,
                          COALESCE(ttm.is_sub, 0) AS is_sub
                   FROM tournament_signups s
                   LEFT JOIN player_profiles pp ON (
                       (s.discord_id IS NOT NULL AND pp.discord_id = s.discord_id)
                       OR (s.discord_id IS NULL AND s.twitch_username IS NOT NULL
                           AND LOWER(pp.twitch_username) = LOWER(s.twitch_username))
                   )
                   LEFT JOIN tournament_team_members ttm ON ttm.signup_id = s.id
                   WHERE s.tournament_id = %s ORDER BY s.signed_up_at""",
                (tournament_id,)
            )
            signups = list(await cur.fetchall())

            await cur.execute(
                """SELECT id, team_name, captain_discord_id, name_confirmed
                   FROM tournament_teams WHERE tournament_id = %s AND is_pre_created = TRUE""",
                (tournament_id,)
            )
            pre_teams = list(await cur.fetchall())

        return {"signups": signups, "pre_teams": pre_teams}

    @staticmethod
    async def get_public_signups(tournament_id: int) -> list[dict]:
        """Return display_name, discord_id, twitch_username for all signups (public view)."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT display_name, discord_id, twitch_username FROM tournament_signups WHERE tournament_id = %s ORDER BY signed_up_at",
                (tournament_id,)
            )
            rows = list(await cur.fetchall())
        for r in rows:
            if r.get("discord_id") is not None:
                r["discord_id"] = str(r["discord_id"])
        return rows

    @staticmethod
    async def save_pre_teams(tournament_id: int, teams_data: list[dict]) -> tuple[bool, str]:
        """Save manual team assignments from the web UI.

        teams_data: [{"name": str, "signup_ids": [int, ...], "captain_signup_id": int|None, "sub_signup_ids": [int, ...]}]
        """
        async with DBContextManager() as cur:
            await _ensure_is_sub_column(cur)

            await cur.execute(
                "SELECT status FROM tournaments WHERE id = %s", (tournament_id,)
            )
            row = await cur.fetchone()
            if not row or row[0] != "signup":
                return False, "Tournament is not in sign-up phase."

            # Collect all signup IDs (main + subs) for validation
            all_ids = list({
                int(sid)
                for team in teams_data
                for sid in (team.get("signup_ids", []) + team.get("sub_signup_ids", []))
                if sid
            })
            if all_ids:
                fmt = ",".join(["%s"] * len(all_ids))
                await cur.execute(
                    f"SELECT COUNT(*) FROM tournament_signups WHERE tournament_id = %s AND id IN ({fmt})",
                    [tournament_id] + all_ids,
                )
                valid_count = (await cur.fetchone())[0]
                if valid_count < len(all_ids):
                    return False, (
                        f"Player list is out of sync ({valid_count}/{len(all_ids)} IDs match this tournament). "
                        "Please refresh the page and try again."
                    )

            # Clear existing pre-created teams and their assignments
            await cur.execute(
                "SELECT id FROM tournament_teams WHERE tournament_id = %s AND is_pre_created = TRUE",
                (tournament_id,)
            )
            old_team_ids = [r[0] for r in await cur.fetchall()]
            if old_team_ids:
                fmt = ",".join(["%s"] * len(old_team_ids))
                await cur.execute(f"DELETE FROM tournament_team_members WHERE team_id IN ({fmt})", old_team_ids)
                await cur.execute(f"DELETE FROM tournament_teams WHERE id IN ({fmt})", old_team_ids)

            # Reset any previous assignments on signups
            await cur.execute(
                "UPDATE tournament_signups SET assigned_team_id = NULL WHERE tournament_id = %s",
                (tournament_id,)
            )

            saved = 0
            used_names_this_save: set[str] = set()

            # Pre-validate explicit names for duplicates before any inserts
            explicit_names = [t.get("name", "").strip().lower() for t in teams_data if t.get("name", "").strip()]
            if len(explicit_names) != len(set(explicit_names)):
                return False, "Two or more teams have the same name. Please give each team a unique name."

            for i, team in enumerate(teams_data):
                signup_ids = team.get("signup_ids", [])
                sub_signup_ids = team.get("sub_signup_ids", [])
                if not signup_ids and not sub_signup_ids:
                    continue

                team_name = team.get("name") or _generate_team_name(used_names_this_save)
                used_names_this_save.add(team_name.lower())
                captain_id = None

                # Use admin-designated captain if provided
                explicit_captain_signup_id = team.get("captain_signup_id")
                if explicit_captain_signup_id:
                    await cur.execute(
                        "SELECT discord_id FROM tournament_signups WHERE id = %s AND discord_id IS NOT NULL",
                        (int(explicit_captain_signup_id),)
                    )
                    cap_row = await cur.fetchone()
                    if cap_row:
                        captain_id = cap_row[0]

                # Fall back to first Discord-linked player
                if captain_id is None and signup_ids:
                    fmt = ",".join(["%s"] * len(signup_ids))
                    await cur.execute(
                        f"SELECT id, discord_id FROM tournament_signups WHERE id IN ({fmt}) AND discord_id IS NOT NULL ORDER BY signed_up_at LIMIT 1",
                        signup_ids
                    )
                    cap_row = await cur.fetchone()
                    if cap_row:
                        captain_id = cap_row[1]

                await cur.execute(
                    """INSERT INTO tournament_teams
                       (tournament_id, team_name, seed, captain_discord_id, name_confirmed, is_pre_created)
                       VALUES (%s, %s, %s, %s, %s, TRUE)""",
                    (tournament_id, team_name, i + 1, captain_id, bool(team.get("name")))
                )
                team_id = cur.lastrowid
                saved += 1

                for sid in signup_ids:
                    await cur.execute(
                        "INSERT INTO tournament_team_members (team_id, signup_id, is_sub) VALUES (%s, %s, 0)",
                        (team_id, sid)
                    )
                    await cur.execute(
                        "UPDATE tournament_signups SET assigned_team_id = %s WHERE id = %s",
                        (team_id, sid)
                    )

                for sid in sub_signup_ids:
                    await cur.execute(
                        "INSERT INTO tournament_team_members (team_id, signup_id, is_sub) VALUES (%s, %s, 1)",
                        (team_id, sid)
                    )
                    await cur.execute(
                        "UPDATE tournament_signups SET assigned_team_id = %s WHERE id = %s",
                        (team_id, sid)
                    )

        return True, f"{saved} team(s) saved."

    @staticmethod
    async def set_team_name(team_id: int, new_name: str, requestor_discord_id: int) -> tuple[bool, str]:
        """Allow captain (or admin) to rename a team."""
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT captain_discord_id, tournament_id FROM tournament_teams WHERE id = %s",
                (team_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "Team not found."
            captain_id, tournament_id = row

            from backend.util.config import global_config
            is_admin = requestor_discord_id in global_config.tournament_admin_ids
            if not is_admin and captain_id != requestor_discord_id:
                return False, "Only the team captain or an admin can rename the team."

            await cur.execute(
                "SELECT id FROM tournament_teams WHERE tournament_id = %s AND LOWER(team_name) = LOWER(%s) AND id != %s",
                (tournament_id, new_name, team_id)
            )
            if await cur.fetchone():
                return False, f"A team named **{new_name}** already exists in this tournament."

            await cur.execute(
                "UPDATE tournament_teams SET team_name = %s, name_confirmed = TRUE WHERE id = %s",
                (new_name, team_id)
            )
        return True, f"Team renamed to **{new_name}**!"

    @staticmethod
    async def admin_complete_match(match_id: int, winner_team_id: int) -> tuple[bool, str]:
        """Admin force-complete a match without needing a confirmation."""
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT tournament_id, round, match_number, team1_id, team2_id FROM tournament_matches WHERE id = %s",
                (match_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "Match not found."
            tournament_id, rnd, match_num, team1_id, team2_id = row
            if winner_team_id not in (team1_id, team2_id):
                return False, "Winner must be one of the two teams in this match."

            await cur.execute(
                "UPDATE tournament_win_reports SET status = 'confirmed' WHERE match_id = %s AND status = 'pending'",
                (match_id,)
            )
            await cur.execute(
                "UPDATE tournament_matches SET winner_id = %s, status = 'complete' WHERE id = %s",
                (winner_team_id, match_id)
            )
            await TournamentManager._advance_winner(cur, tournament_id, rnd, match_num, winner_team_id)

            await cur.execute(
                "SELECT COUNT(*) FROM tournament_matches WHERE tournament_id = %s AND status != 'complete'",
                (tournament_id,)
            )
            if not (await cur.fetchone())[0]:
                await cur.execute("UPDATE tournaments SET status = 'complete' WHERE id = %s", (tournament_id,))

            await cur.execute("SELECT team_name FROM tournament_teams WHERE id = %s", (winner_team_id,))
            name_row = await cur.fetchone()
        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "match_complete",
            "tournament_id": tournament_id,
            "match_id": match_id,
            "winner_team_id": winner_team_id,
            "winner_name": name_row[0] if name_row else None,
        })
        return True, f"Match completed. **{name_row[0] if name_row else 'Winner'}** advances!"

    # ------------------------------------------------------------------ #
    #  Data retrieval                                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_active_tournament(guild_id: int) -> Optional[dict]:
        """Return the active/signup tournament for a guild, or None."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id, name, status, team_size, special_rules, affects_rating FROM tournaments WHERE guild_id = %s AND status IN ('signup','active') ORDER BY created_at DESC LIMIT 1",
                (guild_id,)
            )
            return await cur.fetchone()

    @staticmethod
    async def get_recent_completed_tournament(guild_id: int) -> Optional[dict]:
        """Return the most recently completed tournament for a guild, or None."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id, name, status, team_size, special_rules, affects_rating FROM tournaments WHERE guild_id = %s AND status = 'complete' ORDER BY created_at DESC LIMIT 1",
                (guild_id,)
            )
            return await cur.fetchone()

    @staticmethod
    async def get_bracket_data(tournament_id: int) -> dict:
        """Return full bracket data for the API / frontend."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id, name, status, team_size, special_rules, affects_rating, created_at FROM tournaments WHERE id = %s",
                (tournament_id,)
            )
            t = await cur.fetchone()
            if not t:
                return {}

            await cur.execute(
                """SELECT tt.id, tt.team_name, tt.seed,
                          GROUP_CONCAT(s.display_name ORDER BY s.signed_up_at SEPARATOR '||') AS members
                   FROM tournament_teams tt
                   JOIN tournament_team_members ttm ON ttm.team_id = tt.id
                   JOIN tournament_signups s ON s.id = ttm.signup_id
                   WHERE tt.tournament_id = %s
                   GROUP BY tt.id""",
                (tournament_id,)
            )
            teams_raw = await cur.fetchall()
            teams = {
                row["id"]: {
                    "id": row["id"],
                    "name": row["team_name"],
                    "seed": row["seed"],
                    "members": row["members"].split("||") if row["members"] else [],
                }
                for row in teams_raw
            }

            await cur.execute(
                """SELECT id, round, match_number, team1_id, team2_id, winner_id, status
                   FROM tournament_matches
                   WHERE tournament_id = %s ORDER BY round, match_number""",
                (tournament_id,)
            )
            matches_raw = await cur.fetchall()

            # Build lookup (round, match_number) → raw row for feeder ID calculation
            match_lookup: dict[tuple, dict] = {
                (m["round"], m["match_number"]): m for m in matches_raw
            }

            rounds: dict[int, list] = {}
            for m in matches_raw:
                rnd = m["round"]
                if rnd not in rounds:
                    rounds[rnd] = []
                mn = m["match_number"]
                prev = rnd - 1
                f1 = match_lookup.get((prev, 2 * mn - 1))
                f2 = match_lookup.get((prev, 2 * mn))
                rounds[rnd].append({
                    "id": m["id"],
                    "match_number": mn,
                    "team1": teams.get(m["team1_id"]) if m["team1_id"] else None,
                    "team2": teams.get(m["team2_id"]) if m["team2_id"] else None,
                    "winner_id": m["winner_id"],
                    "status": m["status"],
                    "is_bye": m["team2_id"] is None and m["status"] == "complete",
                    "feeder1_match_id": f1["id"] if f1 else None,
                    "feeder2_match_id": f2["id"] if f2 else None,
                })

            await cur.execute(
                "SELECT round, stage_name, mode_id, mode_name FROM tournament_round_schedule WHERE tournament_id = %s",
                (tournament_id,)
            )
            schedule_rows = await cur.fetchall()
            schedule = {
                row["round"]: {"stage_name": row["stage_name"], "mode_id": row["mode_id"], "mode_name": row["mode_name"]}
                for row in schedule_rows
            }

            return {
                "tournament": {
                    "id": t["id"],
                    "name": t["name"],
                    "status": t["status"],
                    "team_size": t["team_size"],
                    "special_rules": t["special_rules"],
                    "affects_rating": bool(t["affects_rating"]),
                    "created_at": t["created_at"].isoformat() if t["created_at"] else None,
                },
                "rounds": [
                    {"round": rnd, "matches": rounds[rnd], "schedule": schedule.get(rnd)}
                    for rnd in sorted(rounds.keys())
                ],
            }

    # ------------------------------------------------------------------ #
    #  Match info for bot announcements                                    #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_match_for_announcement(tournament_id: int, round_num: int, match_num: int) -> Optional[dict]:
        """Return a match with full team/member details for Discord announcement embeds."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                """SELECT m.id, m.round, m.match_number, m.team1_id, m.team2_id, m.status,
                          t.name AS tournament_name, t.channel_id, t.team_size,
                          (SELECT MAX(round) FROM tournament_matches WHERE tournament_id = %s) AS total_rounds
                   FROM tournament_matches m
                   JOIN tournaments t ON t.id = m.tournament_id
                   WHERE m.tournament_id = %s AND m.round = %s AND m.match_number = %s""",
                (tournament_id, tournament_id, round_num, match_num)
            )
            match = await cur.fetchone()
            if not match or not match["team1_id"] or not match["team2_id"]:
                return None

            await cur.execute(
                "SELECT stage_name, mode_id, mode_name FROM tournament_round_schedule "
                "WHERE tournament_id = %s AND round = %s",
                (tournament_id, round_num)
            )
            schedule = await cur.fetchone()

            teams = []
            for team_id in [match["team1_id"], match["team2_id"]]:
                await cur.execute("SELECT team_name FROM tournament_teams WHERE id = %s", (team_id,))
                team_row = await cur.fetchone()
                await cur.execute(
                    """SELECT s.display_name, s.discord_id
                       FROM tournament_team_members ttm
                       JOIN tournament_signups s ON s.id = ttm.signup_id
                       WHERE ttm.team_id = %s""",
                    (team_id,)
                )
                members = list(await cur.fetchall())
                teams.append({"id": team_id, "name": team_row["team_name"] if team_row else "Unknown", "members": members})

        return {
            "id": match["id"],
            "round": match["round"],
            "match_number": match["match_number"],
            "total_rounds": match["total_rounds"] or 1,
            "tournament_name": match["tournament_name"],
            "channel_id": match["channel_id"],
            "status": match["status"],
            "teams": teams,
            "schedule": dict(schedule) if schedule else None,
        }

    @staticmethod
    async def get_r1_matches_for_announcement(tournament_id: int) -> list[dict]:
        """Return all pending R1 matches with member details for the bracket-locked announcement."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT MAX(round) AS total FROM tournament_matches WHERE tournament_id = %s",
                (tournament_id,)
            )
            total_row = await cur.fetchone()
            total_rounds = total_row["total"] if total_row else 1

            await cur.execute(
                "SELECT id, round, match_number, team1_id, team2_id FROM tournament_matches "
                "WHERE tournament_id = %s AND round = 1 AND status = 'pending' "
                "AND team1_id IS NOT NULL AND team2_id IS NOT NULL ORDER BY match_number",
                (tournament_id,)
            )
            matches_raw = list(await cur.fetchall())

            await cur.execute(
                "SELECT stage_name, mode_id, mode_name FROM tournament_round_schedule "
                "WHERE tournament_id = %s AND round = 1",
                (tournament_id,)
            )
            schedule = await cur.fetchone()

            await cur.execute("SELECT name FROM tournaments WHERE id = %s", (tournament_id,))
            t_row = await cur.fetchone()
            tournament_name = t_row["name"] if t_row else ""

            results = []
            for match in matches_raw:
                teams = []
                for team_id in [match["team1_id"], match["team2_id"]]:
                    await cur.execute("SELECT team_name FROM tournament_teams WHERE id = %s", (team_id,))
                    team_row = await cur.fetchone()
                    await cur.execute(
                        """SELECT s.display_name, s.discord_id
                           FROM tournament_team_members ttm
                           JOIN tournament_signups s ON s.id = ttm.signup_id
                           WHERE ttm.team_id = %s""",
                        (team_id,)
                    )
                    members = list(await cur.fetchall())
                    teams.append({"id": team_id, "name": team_row["team_name"] if team_row else "Unknown", "members": members})
                results.append({
                    "id": match["id"],
                    "round": 1,
                    "match_number": match["match_number"],
                    "total_rounds": total_rounds,
                    "tournament_name": tournament_name,
                    "teams": teams,
                    "schedule": dict(schedule) if schedule else None,
                })
        return results

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def _advance_winner(cur, tournament_id: int, current_round: int, current_match_num: int, winner_team_id: int) -> None:
        """Move the winner of a completed match into the next round's match slot."""
        next_round = current_round + 1
        next_match_num = (current_match_num + 1) // 2
        slot = 1 if current_match_num % 2 == 1 else 2

        await cur.execute(
            "SELECT id, team1_id, team2_id FROM tournament_matches WHERE tournament_id = %s AND round = %s AND match_number = %s",
            (tournament_id, next_round, next_match_num)
        )
        next_match = await cur.fetchone()
        if not next_match:
            return  # This was the final

        next_match_id, existing_t1, existing_t2 = next_match
        col = "team1_id" if slot == 1 else "team2_id"
        await cur.execute(
            f"UPDATE tournament_matches SET {col} = %s WHERE id = %s",
            (winner_team_id, next_match_id)
        )

        # Once both teams are known, assign a home team and room code
        other = existing_t2 if slot == 1 else existing_t1
        if other is not None:
            home_team = random.choice([winner_team_id, other])
            await cur.execute(
                "UPDATE tournament_matches SET home_team_id = %s, room_code = %s WHERE id = %s",
                (home_team, _random_room_code(), next_match_id)
            )
