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


async def _ensure_match_games_table(cur) -> None:
    """Create tournament_match_games for per-game results if it doesn't exist."""
    await cur.execute("""
        CREATE TABLE IF NOT EXISTS tournament_match_games (
          id INT AUTO_INCREMENT PRIMARY KEY,
          match_id INT NOT NULL,
          game_number INT NOT NULL,
          winner_team_id INT NOT NULL,
          reported_by_discord BIGINT,
          confirmed_by_discord BIGINT,
          status ENUM('pending','confirmed','disputed') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_match_game (match_id, game_number),
          FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE,
          FOREIGN KEY (winner_team_id) REFERENCES tournament_teams(id)
        )
    """)


async def _ensure_round_games_match_id(cur) -> None:
    """Add match_id column to tournament_round_games for per-match map storage.
    0 = round-level (schedule), non-zero = match-specific counterpick."""
    try:
        await cur.execute(
            "ALTER TABLE tournament_round_games ADD COLUMN match_id INT NOT NULL DEFAULT 0 AFTER round"
        )
    except Exception as e:
        if "Duplicate column name" not in str(e):
            raise
    # Add the composite unique key if it doesn't already exist
    try:
        await cur.execute(
            "ALTER TABLE tournament_round_games ADD UNIQUE KEY uq_game_per_match (tournament_id, round, match_id, game_number)"
        )
    except Exception as e:
        if "Duplicate key name" not in str(e) and "duplicate key" not in str(e).lower():
            raise


async def _ensure_map_pools_table(cur) -> None:
    """Create tournament_map_pools for per-mode stage restrictions."""
    await cur.execute("""
        CREATE TABLE IF NOT EXISTS tournament_map_pools (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tournament_id INT NOT NULL,
          mode_id VARCHAR(50) NOT NULL,
          stage_name VARCHAR(100) NOT NULL,
          UNIQUE KEY uq_pool (tournament_id, mode_id, stage_name)
        )
    """)

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

    # In-memory overlay state (resets on server restart — fine for live stream use)
    _pinned: dict[int, int | None] = {}          # guild_id → match_id
    _game_scores: dict[int, list[int]] = {}       # match_id → [team1_games, team2_games]
    _game_results: dict[int, dict[int, int]] = {} # match_id → {game_number: winner (1 or 2)}

    @classmethod
    def pin_match(cls, guild_id: int, match_id: int | None) -> None:
        cls._pinned[guild_id] = match_id

    @classmethod
    def get_pinned_match_id(cls, guild_id: int) -> int | None:
        return cls._pinned.get(guild_id)

    @classmethod
    def set_game_score(cls, match_id: int, team1_games: int, team2_games: int) -> None:
        old = cls._game_scores.get(match_id, [0, 0])
        old_total = old[0] + old[1]
        new_total = team1_games + team2_games
        results = cls._game_results.setdefault(match_id, {})
        if new_total > old_total:
            # A game was just completed — record which team won it
            game_num = new_total
            results[game_num] = 1 if team1_games > old[0] else 2
        elif new_total < old_total:
            # Admin corrected score downward — remove invalidated game results
            for g in [k for k in results if k > new_total]:
                del results[g]
        cls._game_scores[match_id] = [team1_games, team2_games]

    @classmethod
    def get_game_score(cls, match_id: int) -> list[int]:
        return cls._game_scores.get(match_id, [0, 0])

    @classmethod
    def get_game_results(cls, match_id: int) -> list[dict]:
        results = cls._game_results.get(match_id, {})
        return [{"game_number": g, "winner": w} for g, w in sorted(results.items())]

    @staticmethod
    @staticmethod
    async def _fetch_team(cur, team_id: int) -> dict:
        await cur.execute("SELECT team_name, captain_discord_id, captain_signup_id, tournament_id FROM tournament_teams WHERE id = %s", (team_id,))
        team_row = await cur.fetchone()
        await cur.execute(
            """SELECT s.display_name FROM tournament_team_members ttm
               JOIN tournament_signups s ON s.id = ttm.signup_id
               WHERE ttm.team_id = %s ORDER BY s.signed_up_at""",
            (team_id,)
        )
        members = [r["display_name"] for r in await cur.fetchall()]
        captain = None
        if team_row:
            if team_row["captain_signup_id"]:
                await cur.execute(
                    "SELECT display_name FROM tournament_signups WHERE id = %s LIMIT 1",
                    (team_row["captain_signup_id"],)
                )
                cap_row = await cur.fetchone()
                if cap_row:
                    captain = cap_row["display_name"]
            if not captain and team_row["captain_discord_id"]:
                await cur.execute(
                    "SELECT display_name FROM tournament_signups WHERE discord_id = %s AND tournament_id = %s LIMIT 1",
                    (team_row["captain_discord_id"], team_row["tournament_id"])
                )
                cap_row = await cur.fetchone()
                if cap_row:
                    captain = cap_row["display_name"]
        if not captain and members:
            captain = members[0]
        return {"id": team_id, "name": team_row["team_name"] if team_row else "Unknown", "members": members, "captain": captain}

    @staticmethod
    async def get_pinned_match_data(guild_id: int) -> dict | None:
        """Return full overlay data for the currently pinned match."""
        match_id = TournamentManager.get_pinned_match_id(guild_id)
        if not match_id:
            return None
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                """SELECT m.id, m.round, m.match_number, m.team1_id, m.team2_id, m.status,
                          m.tournament_id, t.name AS tournament_name,
                          (SELECT MAX(round) FROM tournament_matches WHERE tournament_id = m.tournament_id) AS total_rounds
                   FROM tournament_matches m
                   JOIN tournaments t ON t.id = m.tournament_id
                   WHERE m.id = %s""",
                (match_id,)
            )
            match = await cur.fetchone()
            if not match or not match["team1_id"] or not match["team2_id"]:
                return None

            await cur.execute(
                "SELECT stage_name, mode_id, mode_name, best_of FROM tournament_round_schedule "
                "WHERE tournament_id = %s AND round = %s",
                (match["tournament_id"], match["round"])
            )
            schedule = await cur.fetchone()

            await _ensure_round_games_match_id(cur)
            # Fetch both round-level (match_id=0) and match-specific rows; prefer match-specific
            await cur.execute(
                "SELECT game_number, stage_name, match_id FROM tournament_round_games "
                "WHERE tournament_id = %s AND round = %s AND match_id IN (0, %s) ORDER BY game_number, match_id DESC",
                (match["tournament_id"], match["round"], match_id)
            )
            game_rows = await cur.fetchall()
            # For each game_number keep the first row (match-specific wins due to ORDER BY match_id DESC)
            seen: set[int] = set()
            games = []
            for r in game_rows:
                if r["game_number"] not in seen:
                    games.append({"game_number": r["game_number"], "stage_name": r["stage_name"]})
                    seen.add(r["game_number"])

            teams = [await TournamentManager._fetch_team(cur, tid) for tid in [match["team1_id"], match["team2_id"]]]

        scores = TournamentManager.get_game_score(match_id)
        best_of = schedule["best_of"] if schedule and schedule.get("best_of") else 1
        current_game = scores[0] + scores[1] + 1
        current_stage = next((g["stage_name"] for g in games if g["game_number"] == current_game), None)
        return {
            "match_id": match_id,
            "round": match["round"],
            "total_rounds": match["total_rounds"] or 1,
            "tournament_name": match["tournament_name"],
            "status": match["status"],
            "team1": teams[0],
            "team2": teams[1],
            "team1_games": scores[0],
            "team2_games": scores[1],
            "best_of": best_of,
            "stage_name": current_stage,
            "mode_name": schedule["mode_name"] if schedule else None,
            "games": games,
            "game_results": TournamentManager.get_game_results(match_id),
        }

    @staticmethod
    async def get_next_pending_match_data(guild_id: int) -> dict | None:
        """Return the next pending match after the pinned one (for 'up next' overlay)."""
        pinned_id = TournamentManager.get_pinned_match_id(guild_id)
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                """SELECT t.id AS tournament_id FROM tournaments t
                   WHERE t.guild_id = %s AND t.status = 'active'
                   ORDER BY t.created_at DESC LIMIT 1""",
                (guild_id,)
            )
            t_row = await cur.fetchone()
            if not t_row:
                return None
            tournament_id = t_row["tournament_id"]

            await cur.execute(
                """SELECT m.id, m.round, m.match_number, m.team1_id, m.team2_id,
                          (SELECT MAX(round) FROM tournament_matches WHERE tournament_id = m.tournament_id) AS total_rounds,
                          t.name AS tournament_name
                   FROM tournament_matches m
                   JOIN tournaments t ON t.id = m.tournament_id
                   WHERE m.tournament_id = %s AND m.status = 'pending'
                     AND m.team1_id IS NOT NULL AND m.team2_id IS NOT NULL
                     AND (%s IS NULL OR m.id != %s)
                   ORDER BY m.round, m.match_number LIMIT 1""",
                (tournament_id, pinned_id, pinned_id)
            )
            match = await cur.fetchone()
            if not match:
                return None

            await cur.execute(
                "SELECT mode_id, mode_name, best_of FROM tournament_round_schedule "
                "WHERE tournament_id = %s AND round = %s",
                (tournament_id, match["round"])
            )
            schedule = await cur.fetchone()

            await cur.execute(
                "SELECT game_number, stage_name FROM tournament_round_games "
                "WHERE tournament_id = %s AND round = %s ORDER BY game_number",
                (tournament_id, match["round"])
            )
            game_rows = await cur.fetchall()
            games = [{"game_number": r["game_number"], "stage_name": r["stage_name"]} for r in game_rows]

            teams = [await TournamentManager._fetch_team(cur, tid) for tid in [match["team1_id"], match["team2_id"]]]

        game1_stage = next((g["stage_name"] for g in games if g["game_number"] == 1), None)
        return {
            "match_id": match["id"],
            "round": match["round"],
            "total_rounds": match["total_rounds"] or 1,
            "tournament_name": match["tournament_name"],
            "team1": teams[0],
            "team2": teams[1],
            "best_of": schedule["best_of"] if schedule and schedule.get("best_of") else 1,
            "mode_name": schedule["mode_name"] if schedule else None,
            "stage_name": game1_stage,
            "games": games,
        }

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
            await cur.execute("DELETE FROM tournament_round_games WHERE tournament_id = %s", (tid,))
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
                """SELECT tt.id, tt.team_name, tt.captain_discord_id, tt.captain_signup_id,
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
                team_id, tname, cap_discord_id, cap_signup_id, sids_str, mnames_str = row
                member_names = mnames_str.split("||") if mnames_str else []
                sids = [int(x) for x in sids_str.split(",") if x]
                assigned_signup_ids.update(sids)
                used_names.add(tname)
                team_ids.append(team_id)
                teams_info.append({"id": team_id, "name": tname, "members": member_names, "captain_discord_id": cap_discord_id})
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

                # Captain = first member; prefer Discord-linked if available
                cap_signup_id = members[0][0] if members else None
                cap_discord_id = None
                for sid, _ in members:
                    await cur.execute(
                        "SELECT discord_id FROM tournament_signups WHERE id = %s AND discord_id IS NOT NULL",
                        (sid,)
                    )
                    r = await cur.fetchone()
                    if r:
                        cap_discord_id = r[0]
                        cap_signup_id = sid
                        break

                await cur.execute(
                    """INSERT INTO tournament_teams
                       (tournament_id, team_name, seed, captain_discord_id, captain_signup_id, is_pre_created)
                       VALUES (%s, %s, %s, %s, %s, FALSE)""",
                    (tid, gen_name, seed, cap_discord_id, cap_signup_id)
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

            # Validate all rounds have a mode assigned
            await cur.execute(
                """SELECT DISTINCT round FROM tournament_round_schedule
                   WHERE tournament_id = %s AND mode_id IS NOT NULL AND round BETWEEN 1 AND %s""",
                (tid, total_rounds)
            )
            scheduled_rounds = {r[0] for r in await cur.fetchall()}
            missing_rounds = [r for r in range(1, total_rounds + 1) if r not in scheduled_rounds]
            if missing_rounds:
                return False, f"Please set a mode for all {total_rounds} rounds before locking. Missing: Round(s) {', '.join(str(r) for r in missing_rounds)}.", []

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

                # Fetch round schedule (mode + best_of)
                await cur.execute(
                    "SELECT mode_id, mode_name, best_of FROM tournament_round_schedule "
                    "WHERE tournament_id = %s AND round = %s LIMIT 1",
                    (tournament_id, match["round"])
                )
                sched = await cur.fetchone()
                match["schedule"] = dict(sched) if sched else None
                best_of = sched["best_of"] if sched and sched.get("best_of") else 1

                # Fetch allowed stages for this match's mode from map pool
                mode_id = sched["mode_id"] if sched and sched.get("mode_id") else None
                if mode_id:
                    await _ensure_map_pools_table(cur)
                    await cur.execute(
                        "SELECT stage_name FROM tournament_map_pools WHERE tournament_id = %s AND mode_id = %s",
                        (tournament_id, mode_id)
                    )
                    pool_rows = await cur.fetchall()
                    match["allowed_stages"] = [r["stage_name"] for r in pool_rows]
                else:
                    match["allowed_stages"] = []

                # Fetch game stages: round-level defaults AND match-specific overrides (override wins)
                await _ensure_round_games_match_id(cur)
                await cur.execute(
                    """SELECT game_number, stage_name, match_id FROM tournament_round_games
                       WHERE tournament_id = %s AND round = %s AND (match_id = 0 OR match_id = %s)
                       ORDER BY game_number ASC, match_id DESC""",
                    (tournament_id, match["round"], match["id"])
                )
                game_rows = await cur.fetchall()
                seen_games: set[int] = set()
                games: list[dict] = []
                for g in game_rows:
                    if g["game_number"] not in seen_games:
                        games.append({"game_number": g["game_number"], "stage_name": g["stage_name"]})
                        seen_games.add(g["game_number"])
                match["games"] = games

                # Fetch per-game results
                await _ensure_match_games_table(cur)
                await cur.execute(
                    """SELECT game_number, winner_team_id FROM tournament_match_games
                       WHERE match_id = %s AND status = 'confirmed' ORDER BY game_number""",
                    (match["id"],)
                )
                game_results = [dict(r) for r in await cur.fetchall()]
                match["game_results"] = game_results

                # Fetch pending game (awaiting confirmation)
                await cur.execute(
                    """SELECT game_number, winner_team_id AS reported_winner_id FROM tournament_match_games
                       WHERE match_id = %s AND status = 'pending' ORDER BY game_number DESC LIMIT 1""",
                    (match["id"],)
                )
                pending_row = await cur.fetchone()
                match["pending_game"] = dict(pending_row) if pending_row else None

                # Compute scores and series state
                t1_wins = sum(1 for r in game_results if r["winner_team_id"] == match["team1_id"])
                t2_wins = sum(1 for r in game_results if r["winner_team_id"] == match["team2_id"])
                match["team1_games"] = t1_wins
                match["team2_games"] = t2_wins

                wins_needed = math.ceil(best_of / 2)
                series_complete = t1_wins >= wins_needed or t2_wins >= wins_needed

                confirmed_count = len(game_results)
                if match["pending_game"]:
                    match["current_game_number"] = match["pending_game"]["game_number"]
                else:
                    match["current_game_number"] = confirmed_count + 1

                # Determine counterpick state
                match["needs_counterpick"] = False
                match["opponent_needs_counterpick"] = False
                match["counterpick_game_number"] = None

                if not series_complete and match["pending_game"] is None:
                    next_game = confirmed_count + 1
                    if next_game > best_of:
                        pass  # series over
                    else:
                        # Who picks for next_game?
                        if next_game == 1:
                            picker_team_id = match["home_team_id"]
                        elif game_results:
                            last_winner = game_results[-1]["winner_team_id"]
                            picker_team_id = match["team2_id"] if last_winner == match["team1_id"] else match["team1_id"]
                        else:
                            picker_team_id = match["home_team_id"]

                        # Check if map is already set for next_game
                        map_set = any(
                            g["game_number"] == next_game and g["stage_name"]
                            for g in games
                        )
                        if not map_set and picker_team_id is not None:
                            match["counterpick_game_number"] = next_game
                            match["needs_counterpick"] = (team_id == picker_team_id)
                            match["opponent_needs_counterpick"] = (team_id != picker_team_id)

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
                           WHERE ttm.team_id = %s AND (
                               s.discord_id = %s
                               OR (s.discord_id IS NULL AND s.twitch_username IS NOT NULL
                                   AND LOWER(s.twitch_username) = (
                                       SELECT LOWER(twitch_username) FROM player_profiles
                                       WHERE discord_id = %s AND twitch_username IS NOT NULL LIMIT 1
                                   ))
                           )""",
                        (opposing_team_id, confirmer_discord, confirmer_discord)
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
    #  Game-by-game reporting                                              #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def report_game_win(
        match_id: int,
        game_number: int,
        winner_team_id: int,
        reporter_discord: Optional[int] = None,
    ) -> tuple[bool, str]:
        """Report the winner of a single game within a match."""
        async with DBContextManager() as cur:
            await _ensure_match_games_table(cur)

            await cur.execute(
                "SELECT status, tournament_id, team1_id, team2_id FROM tournament_matches WHERE id = %s",
                (match_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "Match not found."
            if row[0] == "complete":
                return False, "This match is already complete."
            if row[0] == "awaiting_confirmation":
                return False, "A game result is already awaiting confirmation."
            tournament_id = row[1]
            team1_id, team2_id = row[2], row[3]

            if winner_team_id not in (team1_id, team2_id):
                return False, "Winner must be one of the two teams in this match."

            # Validate game_number is the next expected game
            await cur.execute(
                "SELECT COUNT(*) FROM tournament_match_games WHERE match_id = %s AND status = 'confirmed'",
                (match_id,)
            )
            confirmed_count = (await cur.fetchone())[0]
            if game_number != confirmed_count + 1:
                return False, f"Expected to report game {confirmed_count + 1}, not game {game_number}."

            # Check for existing non-disputed entry
            await cur.execute(
                "SELECT status FROM tournament_match_games WHERE match_id = %s AND game_number = %s",
                (match_id, game_number)
            )
            existing = await cur.fetchone()
            if existing:
                if existing[0] == "pending":
                    return False, "A result for this game is already reported — awaiting confirmation."
                elif existing[0] == "confirmed":
                    return False, "This game result is already confirmed."
                # disputed: allow re-report
                await cur.execute(
                    """UPDATE tournament_match_games
                       SET winner_team_id = %s, reported_by_discord = %s, status = 'pending'
                       WHERE match_id = %s AND game_number = %s""",
                    (winner_team_id, reporter_discord, match_id, game_number)
                )
            else:
                await cur.execute(
                    """INSERT INTO tournament_match_games (match_id, game_number, winner_team_id, reported_by_discord)
                       VALUES (%s, %s, %s, %s)""",
                    (match_id, game_number, winner_team_id, reporter_discord)
                )

            await cur.execute(
                "UPDATE tournament_matches SET status = 'awaiting_confirmation' WHERE id = %s",
                (match_id,)
            )

        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "game_reported",
            "tournament_id": tournament_id,
            "match_id": match_id,
            "game_number": game_number,
            "winner_team_id": winner_team_id,
        })
        return True, f"Game {game_number} result reported! Waiting for the opposing team to confirm."

    @staticmethod
    async def confirm_game_win(
        match_id: int,
        game_number: int,
        confirmer_discord: Optional[int] = None,
    ) -> tuple[bool, str, bool]:
        """Confirm a pending game result. Returns (ok, msg, series_complete)."""
        from backend.util.config import global_config
        async with DBContextManager() as cur:
            await _ensure_match_games_table(cur)

            await cur.execute(
                "SELECT winner_team_id FROM tournament_match_games WHERE match_id = %s AND game_number = %s AND status = 'pending'",
                (match_id, game_number)
            )
            game_row = await cur.fetchone()
            if not game_row:
                return False, "No pending game result to confirm.", False
            winner_team_id = game_row[0]

            await cur.execute(
                "SELECT team1_id, team2_id, tournament_id, round, match_number FROM tournament_matches WHERE id = %s",
                (match_id,)
            )
            match = await cur.fetchone()
            if not match:
                return False, "Match not found.", False
            team1_id, team2_id, tournament_id, rnd, match_num = match

            opposing_team_id = team2_id if winner_team_id == team1_id else team1_id

            is_admin = bool(confirmer_discord and confirmer_discord in global_config.tournament_admin_ids)
            if not is_admin:
                if confirmer_discord:
                    await cur.execute(
                        """SELECT 1 FROM tournament_team_members ttm
                           JOIN tournament_signups s ON ttm.signup_id = s.id
                           WHERE ttm.team_id = %s AND (
                               s.discord_id = %s
                               OR (s.discord_id IS NULL AND s.twitch_username IS NOT NULL
                                   AND LOWER(s.twitch_username) = (
                                       SELECT LOWER(twitch_username) FROM player_profiles
                                       WHERE discord_id = %s AND twitch_username IS NOT NULL LIMIT 1
                                   ))
                           )""",
                        (opposing_team_id, confirmer_discord, confirmer_discord)
                    )
                    if not await cur.fetchone():
                        return False, "Only a member of the opposing team can confirm this result.", False

            await cur.execute(
                """UPDATE tournament_match_games
                   SET status = 'confirmed', confirmed_by_discord = %s
                   WHERE match_id = %s AND game_number = %s""",
                (confirmer_discord, match_id, game_number)
            )

            # Compute updated scores
            await cur.execute(
                "SELECT winner_team_id FROM tournament_match_games WHERE match_id = %s AND status = 'confirmed'",
                (match_id,)
            )
            all_results = await cur.fetchall()
            t1_wins = sum(1 for r in all_results if r[0] == team1_id)
            t2_wins = sum(1 for r in all_results if r[0] == team2_id)

            # Update in-memory scores for overlay
            TournamentManager.set_game_score(match_id, t1_wins, t2_wins)
            game_results = TournamentManager.get_game_results(match_id)

            await cur.execute(
                "SELECT best_of FROM tournament_round_schedule WHERE tournament_id = %s AND round = %s",
                (tournament_id, rnd)
            )
            sched = await cur.fetchone()
            best_of = sched[0] if sched else 1
            wins_needed = math.ceil(best_of / 2)

            series_complete = t1_wins >= wins_needed or t2_wins >= wins_needed

            if series_complete:
                series_winner_id = team1_id if t1_wins >= wins_needed else team2_id
                await cur.execute(
                    "UPDATE tournament_matches SET winner_id = %s, status = 'complete' WHERE id = %s",
                    (series_winner_id, match_id)
                )
                await TournamentManager._advance_winner(cur, tournament_id, rnd, match_num, series_winner_id)

                await cur.execute(
                    "SELECT COUNT(*) FROM tournament_matches WHERE tournament_id = %s AND status != 'complete'",
                    (tournament_id,)
                )
                if not (await cur.fetchone())[0]:
                    await cur.execute("UPDATE tournaments SET status = 'complete' WHERE id = %s", (tournament_id,))

                await cur.execute("SELECT team_name FROM tournament_teams WHERE id = %s", (series_winner_id,))
                name_row = await cur.fetchone()
                winner_name = name_row[0] if name_row else "Unknown"
            else:
                # Series ongoing — set match back to pending so next game can be reported
                await cur.execute("UPDATE tournament_matches SET status = 'pending' WHERE id = %s", (match_id,))
                series_winner_id = None
                winner_name = None

        if series_complete:
            try:
                await _get_profile_manager().update_trueskill_for_match(match_id, series_winner_id)
            except Exception as e:
                logger.warning("TrueSkill update failed for match %s: %s", match_id, e)

        from backend.util.broadcaster import TournamentBroadcaster
        if series_complete:
            await TournamentBroadcaster.get().broadcast({
                "event": "match_complete",
                "tournament_id": tournament_id,
                "match_id": match_id,
                "winner_team_id": series_winner_id,
                "winner_name": winner_name,
            })
            return True, f"✅ Game confirmed! **{winner_name}** wins the series!", True
        else:
            await TournamentBroadcaster.get().broadcast({
                "event": "game_confirmed",
                "tournament_id": tournament_id,
                "match_id": match_id,
                "game_number": game_number,
                "winner_team_id": winner_team_id,
                "team1_games": t1_wins,
                "team2_games": t2_wins,
                "game_results": game_results,
            })
            return True, f"Game {game_number} confirmed!", False

    @staticmethod
    async def dispute_game(match_id: int, game_number: int) -> tuple[bool, str]:
        """Dispute a pending game result."""
        async with DBContextManager() as cur:
            await _ensure_match_games_table(cur)
            await cur.execute(
                "SELECT id FROM tournament_match_games WHERE match_id = %s AND game_number = %s AND status = 'pending'",
                (match_id, game_number)
            )
            if not await cur.fetchone():
                return False, "No pending game result to dispute."
            await cur.execute(
                """UPDATE tournament_match_games SET status = 'disputed'
                   WHERE match_id = %s AND game_number = %s""",
                (match_id, game_number)
            )
            await cur.execute(
                "UPDATE tournament_matches SET status = 'pending' WHERE id = %s",
                (match_id,)
            )
        return True, "⚠️ Game result disputed. Re-report the result when resolved."

    @staticmethod
    async def admin_set_game_result(
        match_id: int,
        game_number: int,
        winner_team_id: int,
    ) -> tuple[bool, str]:
        """Admin force-sets a confirmed result for a specific game, overwriting any existing record."""
        async with DBContextManager() as cur:
            await _ensure_match_games_table(cur)

            await cur.execute(
                "SELECT tournament_id, team1_id, team2_id FROM tournament_matches WHERE id = %s",
                (match_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "Match not found."
            tournament_id, team1_id, team2_id = row

            if winner_team_id not in (team1_id, team2_id):
                return False, "Winner must be one of the two teams in this match."

            # Upsert as confirmed, overwriting pending/disputed/confirmed
            await cur.execute(
                """INSERT INTO tournament_match_games (match_id, game_number, winner_team_id, status)
                   VALUES (%s, %s, %s, 'confirmed')
                   ON DUPLICATE KEY UPDATE winner_team_id = VALUES(winner_team_id), status = 'confirmed'""",
                (match_id, game_number, winner_team_id)
            )

            # Clear awaiting_confirmation match status so next game can be reported
            await cur.execute(
                "UPDATE tournament_matches SET status = 'pending' WHERE id = %s AND status = 'awaiting_confirmation'",
                (match_id,)
            )

            # Recount confirmed wins
            await cur.execute(
                "SELECT winner_team_id FROM tournament_match_games WHERE match_id = %s AND status = 'confirmed'",
                (match_id,)
            )
            results = await cur.fetchall()
            t1_wins = sum(1 for r in results if r[0] == team1_id)
            t2_wins = sum(1 for r in results if r[0] == team2_id)

        # Sync in-memory overlay scores
        TournamentManager.set_game_score(match_id, t1_wins, t2_wins)
        game_results = TournamentManager.get_game_results(match_id)

        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "game_score",
            "match_id": match_id,
            "team1_games": t1_wins,
            "team2_games": t2_wins,
            "game_results": game_results,
        })
        return True, f"Game {game_number} result set (admin override)."

    @staticmethod
    async def player_set_counterpick(
        match_id: int,
        game_number: int,
        stage_name: str,
        picker_discord: Optional[int] = None,
    ) -> tuple[bool, str]:
        """Player locks in the counterpick stage for an upcoming game."""
        from backend.util.config import global_config
        async with DBContextManager() as cur:
            await _ensure_match_games_table(cur)
            await _ensure_round_games_match_id(cur)

            await cur.execute(
                "SELECT tournament_id, round, team1_id, team2_id, home_team_id, status FROM tournament_matches WHERE id = %s",
                (match_id,)
            )
            match = await cur.fetchone()
            if not match:
                return False, "Match not found."
            tournament_id, rnd, team1_id, team2_id, home_team_id, status = match
            if status == "complete":
                return False, "Match is already complete."
            if status == "awaiting_confirmation":
                return False, "Awaiting game confirmation — counterpick will be available after."

            is_admin = bool(picker_discord and picker_discord in global_config.tournament_admin_ids)

            if not is_admin:
                # Verify picker is in this match — handles both Discord and Twitch signups
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
                    (tournament_id, picker_discord, picker_discord)
                )
                team_row = await cur.fetchone()
                if not team_row or team_row[0] not in (team1_id, team2_id):
                    return False, "You are not a participant in this match."
                picker_team_id = team_row[0]

                # Determine who is authorised to pick for this game
                if game_number == 1:
                    authorised_team_id = home_team_id
                else:
                    await cur.execute(
                        "SELECT winner_team_id FROM tournament_match_games WHERE match_id = %s AND game_number = %s AND status = 'confirmed'",
                        (match_id, game_number - 1)
                    )
                    prev_result = await cur.fetchone()
                    if not prev_result:
                        return False, f"Game {game_number - 1} has not been confirmed yet."
                    prev_winner = prev_result[0]
                    authorised_team_id = team2_id if prev_winner == team1_id else team1_id

                if picker_team_id != authorised_team_id:
                    return False, "It is not your team's turn to pick a map."

            await cur.execute(
                """INSERT INTO tournament_round_games (tournament_id, round, match_id, game_number, stage_name)
                   VALUES (%s, %s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE stage_name = VALUES(stage_name)""",
                (tournament_id, rnd, match_id, game_number, stage_name)
            )

        from backend.util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "counterpick_set",
            "tournament_id": tournament_id,
            "match_id": match_id,
            "game_number": game_number,
            "stage_name": stage_name,
        })
        label = "Home pick" if game_number == 1 else "Counterpick"
        return True, f"{label} locked in: {stage_name} for Game {game_number}."

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
        from backend.util.content_filter import check_team_name
        for team in teams_data:
            provided_name = team.get("name")
            if provided_name:
                ok, reason = check_team_name(provided_name)
                if not ok:
                    return False, f"Team name \"{provided_name}\": {reason}"

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
                captain_signup_id = None
                captain_discord_id = None

                # Use admin-designated captain directly by signup id
                explicit_captain_signup_id = team.get("captain_signup_id")
                if explicit_captain_signup_id:
                    captain_signup_id = int(explicit_captain_signup_id)
                    # Also grab discord_id if available (for bot commands)
                    await cur.execute(
                        "SELECT discord_id FROM tournament_signups WHERE id = %s AND discord_id IS NOT NULL",
                        (captain_signup_id,)
                    )
                    cap_row = await cur.fetchone()
                    if cap_row:
                        captain_discord_id = cap_row[0]

                # Fall back to first Discord-linked player for captain_discord_id
                if captain_discord_id is None and signup_ids:
                    fmt = ",".join(["%s"] * len(signup_ids))
                    await cur.execute(
                        f"SELECT id, discord_id FROM tournament_signups WHERE id IN ({fmt}) AND discord_id IS NOT NULL ORDER BY signed_up_at LIMIT 1",
                        signup_ids
                    )
                    cap_row = await cur.fetchone()
                    if cap_row:
                        captain_discord_id = cap_row[1]
                        if captain_signup_id is None:
                            captain_signup_id = cap_row[0]

                await cur.execute(
                    """INSERT INTO tournament_teams
                       (tournament_id, team_name, seed, captain_discord_id, captain_signup_id, name_confirmed, is_pre_created)
                       VALUES (%s, %s, %s, %s, %s, %s, TRUE)""",
                    (tournament_id, team_name, i + 1, captain_discord_id, captain_signup_id, bool(team.get("name")))
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
        """Allow captain (or admin) to rename a team once."""
        from backend.util.content_filter import check_team_name
        ok, reason = check_team_name(new_name)
        if not ok:
            return False, reason  # type: ignore[return-value]

        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT captain_discord_id, tournament_id, name_confirmed FROM tournament_teams WHERE id = %s",
                (team_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False, "Team not found."
            captain_id, tournament_id, name_confirmed = row

            from backend.util.config import global_config
            is_admin = requestor_discord_id in global_config.tournament_admin_ids
            if not is_admin and captain_id != requestor_discord_id:
                return False, "Only the team captain or an admin can rename the team."

            if not is_admin and name_confirmed:
                return False, "Your team has already used its one rename."

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
    async def get_tournament_list(guild_id: int) -> list[dict]:
        """Return all completed tournaments for a guild, newest first."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id, name, status, created_at FROM tournaments WHERE guild_id = %s AND status = 'complete' ORDER BY created_at DESC",
                (guild_id,)
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

    @staticmethod
    async def get_map_pool(tournament_id: int) -> dict:
        """Return {mode_id: [stage_names]} for the given tournament. Empty dict if no pool set."""
        async with DBContextManager(use_dict=True) as cur:
            await _ensure_map_pools_table(cur)
            await cur.execute(
                "SELECT mode_id, stage_name FROM tournament_map_pools WHERE tournament_id = %s ORDER BY mode_id, stage_name",
                (tournament_id,)
            )
            rows = await cur.fetchall()
        pool: dict = {}
        for row in rows:
            pool.setdefault(row["mode_id"], []).append(row["stage_name"])
        return pool

    @staticmethod
    async def set_map_pool(tournament_id: int, pool: dict) -> None:
        """Replace the map pool for a tournament. pool = {mode_id: [stage_names]}."""
        async with DBContextManager(use_dict=True) as cur:
            await _ensure_map_pools_table(cur)
            await cur.execute("DELETE FROM tournament_map_pools WHERE tournament_id = %s", (tournament_id,))
            for mode_id, stages in pool.items():
                for stage in stages:
                    if stage:
                        await cur.execute(
                            "INSERT IGNORE INTO tournament_map_pools (tournament_id, mode_id, stage_name) VALUES (%s, %s, %s)",
                            (tournament_id, mode_id, stage)
                        )

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
                """SELECT tt.id, tt.team_name, tt.seed, tt.captain_discord_id,
                          GROUP_CONCAT(s.display_name ORDER BY s.signed_up_at SEPARATOR '||') AS members,
                          COALESCE(
                            (SELECT s2.display_name FROM tournament_signups s2 WHERE s2.id = tt.captain_signup_id LIMIT 1),
                            (SELECT s2.display_name FROM tournament_signups s2
                             WHERE s2.tournament_id = tt.tournament_id
                               AND s2.discord_id = tt.captain_discord_id LIMIT 1)
                          ) AS captain_name
                   FROM tournament_teams tt
                   JOIN tournament_team_members ttm ON ttm.team_id = tt.id
                   JOIN tournament_signups s ON s.id = ttm.signup_id
                   WHERE tt.tournament_id = %s
                   GROUP BY tt.id""",
                (tournament_id,)
            )
            teams_raw = await cur.fetchall()
            def _team_row(row: dict) -> dict:
                members = row["members"].split("||") if row["members"] else []
                captain = row["captain_name"] or (members[0] if members else None)
                return {"id": row["id"], "name": row["team_name"], "seed": row["seed"], "members": members, "captain": captain}
            teams = {row["id"]: _team_row(row) for row in teams_raw}

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
                gs = TournamentManager.get_game_score(m["id"])
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
                    "team1_games": gs[0],
                    "team2_games": gs[1],
                })

            await cur.execute(
                "SELECT round, stage_name, mode_id, mode_name, best_of FROM tournament_round_schedule WHERE tournament_id = %s",
                (tournament_id,)
            )
            schedule_rows = await cur.fetchall()
            schedule = {
                row["round"]: {"stage_name": row["stage_name"], "mode_id": row["mode_id"], "mode_name": row["mode_name"], "best_of": row.get("best_of") or 1}
                for row in schedule_rows
            }

            await cur.execute(
                "SELECT round, game_number, stage_name FROM tournament_round_games WHERE tournament_id = %s ORDER BY round, game_number",
                (tournament_id,)
            )
            game_rows = await cur.fetchall()
            games_by_round: dict[int, list] = {}
            for gr in game_rows:
                games_by_round.setdefault(gr["round"], []).append({"game_number": gr["game_number"], "stage_name": gr["stage_name"]})

            for rnd, sched in schedule.items():
                sched["games"] = games_by_round.get(rnd, [])

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
                "teams": list(teams.values()),
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
