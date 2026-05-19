"""Twitch bot for tournament sign-ups, status, and stream fun."""
import logging
import random
from typing import Optional

from twitchio.ext import commands

from backend.util.config import global_config
from backend.tournament import TournamentManager

logger = logging.getLogger("TwitchBot")

_GG_MESSAGES = [
    "🦑 Booyah! GGs all round!",
    "🐙 Fresh plays out there! GG!",
    "💜 That was clean, GGs!",
    "🌊 Inked it up nicely! GGs!",
    "🎨 Turf secured! Well played everyone!",
    "⚡ Electrifying game! GGs!",
    "🏆 Champions play! GGs!",
    "🦑 Stay fresh out there! GGs!",
    "🎯 On point! GGs all!",
    "🌙 Sneaky good plays! GGs!",
]

_RANK_NAMES = {
    1: ("Starter Squid", "🦑"),
    2: ("Amateur Squid", "🐙"),
    3: ("Cool Squid", "💜"),
    4: ("Pro Squid", "⚡"),
    5: ("Legendary Squid", "🌟"),
    6: ("God Squid", "👑"),
}


class TwitchBot(commands.Bot):

    def __init__(self) -> None:
        super().__init__(
            token=global_config.twitch_bot_token,
            prefix="!",
            initial_channels=[global_config.twitch_channel] if global_config.twitch_channel else [],
        )
        self._pending_match_id: Optional[int] = None
        self._pending_winner_team_id: Optional[int] = None

    async def event_ready(self) -> None:
        logger.info("Twitch bot ready: %s", self.nick)

    async def event_message(self, message) -> None:
        if message.echo:
            return
        await self.handle_commands(message)

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    async def _get_guild_id(self) -> int | None:
        if global_config.twitch_guild_id:
            return global_config.twitch_guild_id
        from backend.util.database_context_manager import DBContextManager
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT guild_id FROM tournaments WHERE status IN ('signup','active') ORDER BY created_at DESC LIMIT 1"
            )
            row = await cur.fetchone()
            return row[0] if row else None

    # ------------------------------------------------------------------ #
    #  Tournament commands                                                 #
    # ------------------------------------------------------------------ #

    @commands.command(name="signup")
    async def cmd_signup(self, ctx: commands.Context) -> None:
        guild_id = await self._get_guild_id()
        if not guild_id:
            await ctx.send(f"@{ctx.author.name} No tournament is currently active.")
            return
        ok, msg = await TournamentManager.signup(
            guild_id=guild_id,
            discord_id=None,
            twitch_username=ctx.author.name.lower(),
            display_name=ctx.author.display_name or ctx.author.name,
        )
        suffix = f" | {global_config.website_url}/tournament" if ok else ""
        await ctx.send(f"@{ctx.author.name} {msg}{suffix}")

    @commands.command(name="unsignup", aliases=["leavetournament"])
    async def cmd_unsignup(self, ctx: commands.Context) -> None:
        guild_id = await self._get_guild_id()
        if not guild_id:
            return
        ok, msg = await TournamentManager.leave(
            guild_id=guild_id,
            discord_id=None,
            twitch_username=ctx.author.name.lower(),
        )
        await ctx.send(f"@{ctx.author.name} {msg}")

    @commands.command(name="bracket")
    async def cmd_bracket(self, ctx: commands.Context) -> None:
        await ctx.send(f"🏆 Tournament bracket → {global_config.website_url}/tournament")

    @commands.command(name="tournament")
    async def cmd_tournament(self, ctx: commands.Context) -> None:
        guild_id = await self._get_guild_id()
        if not guild_id:
            await ctx.send("No tournament is currently active.")
            return
        t = await TournamentManager.get_active_tournament(guild_id)
        if not t:
            await ctx.send("No tournament is currently active.")
            return
        status_map = {"signup": "open for sign-ups 📝", "active": "in progress ⚔️", "complete": "completed 🏆"}
        label = status_map.get(t["status"], t["status"])
        size = t.get("team_size", 4)
        await ctx.send(f"🦑 {t['name']} ({size}v{size}) — {label} | {global_config.website_url}/tournament")

    @commands.command(name="confirm")
    async def cmd_confirm(self, ctx: commands.Context) -> None:
        if self._pending_match_id is None:
            await ctx.send(f"@{ctx.author.name} No pending match result to confirm right now.")
            return
        ok, msg, _ = await TournamentManager.confirm_win(
            match_id=self._pending_match_id,
            confirmer_twitch=ctx.author.name.lower(),
        )
        if ok:
            self._pending_match_id = None
            self._pending_winner_team_id = None
        await ctx.send(f"@{ctx.author.name} {msg} {global_config.website_url}/tournament")

    @commands.command(name="dispute")
    async def cmd_dispute(self, ctx: commands.Context) -> None:
        if self._pending_match_id is None:
            await ctx.send(f"@{ctx.author.name} No pending match result to dispute right now.")
            return
        ok, msg = await TournamentManager.dispute_win(match_id=self._pending_match_id)
        if ok:
            self._pending_match_id = None
            self._pending_winner_team_id = None
        await ctx.send(f"@{ctx.author.name} {msg} An admin will review.")

    # ------------------------------------------------------------------ #
    #  Rank & stats commands                                               #
    # ------------------------------------------------------------------ #

    @commands.command(name="rank")
    async def cmd_rank(self, ctx: commands.Context) -> None:
        """!rank — show your tournament rank, or !rank username for someone else."""
        from backend.util.database_context_manager import DBContextManager
        parts = ctx.message.content.strip().split()
        target = parts[1].lstrip("@").lower() if len(parts) > 1 else ctx.author.name.lower()

        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT display_name, `rank`, trueskill_mu, trueskill_sigma, matches_won, matches_lost, tournament_wins "
                "FROM player_profiles WHERE LOWER(twitch_username) = %s OR LOWER(display_name) = %s LIMIT 1",
                (target, target)
            )
            p = await cur.fetchone()

        if not p:
            await ctx.send(f"@{ctx.author.name} No profile found for '{target}' — they need to play a tournament match first.")
            return

        rank_num = p["rank"]
        rank_name, rank_emoji = _RANK_NAMES.get(rank_num, ("Unranked", "🦑")) if rank_num else ("Unranked", "🦑")
        rating = round(p["trueskill_mu"] - 3 * p["trueskill_sigma"], 1)
        w, l = p["matches_won"], p["matches_lost"]
        win_rate = round(w / (w + l) * 100) if (w + l) > 0 else 0
        trophies = f" | 🏆 {p['tournament_wins']} trophy win(s)" if p["tournament_wins"] > 0 else ""
        await ctx.send(
            f"{rank_emoji} {p['display_name']} — {rank_name} | Rating: {rating} | W/L: {w}/{l} ({win_rate}%){trophies}"
        )

    @commands.command(name="stats")
    async def cmd_stats(self, ctx: commands.Context) -> None:
        """Alias for !rank."""
        ctx.message.content = ctx.message.content.replace("!stats", "!rank", 1)
        await self.cmd_rank(ctx)

    # ------------------------------------------------------------------ #
    #  Fun / social commands                                               #
    # ------------------------------------------------------------------ #

    @commands.command(name="discord")
    async def cmd_discord(self, ctx: commands.Context) -> None:
        await ctx.send(f"💜 Join the Discord! → {global_config.discord_invite}")

    @commands.command(name="website", aliases=["site"])
    async def cmd_website(self, ctx: commands.Context) -> None:
        await ctx.send(f"🌙 sneakyofficial.com → {global_config.website_url}")

    @commands.command(name="socials")
    async def cmd_socials(self, ctx: commands.Context) -> None:
        await ctx.send(
            f"🌙 Website: {global_config.website_url} "
            f"| 💜 Discord: {global_config.discord_invite}"
        )

    @commands.command(name="gg")
    async def cmd_gg(self, ctx: commands.Context) -> None:
        await ctx.send(random.choice(_GG_MESSAGES))

    @commands.command(name="booyah")
    async def cmd_booyah(self, ctx: commands.Context) -> None:
        await ctx.send(f"🦑 BOOYAH! @{ctx.author.name} is feeling fresh tonight! 💜")

    @commands.command(name="splatstats", aliases=["leaderboard"])
    async def cmd_leaderboard(self, ctx: commands.Context) -> None:
        await ctx.send(f"🏆 Full tournament leaderboard → {global_config.website_url}/leaderboard")

    @commands.command(name="commands", aliases=["cmds", "help"])
    async def cmd_commands(self, ctx: commands.Context) -> None:
        await ctx.send(
            "🦑 Commands: "
            "!signup !unsignup !bracket !tournament !confirm !dispute — tournament | "
            "!rank [user] !stats [user] !leaderboard — rankings | "
            "!discord !website !socials !gg !booyah — fun stuff"
        )

    # ------------------------------------------------------------------ #
    #  Called by the Discord bot to sync pending confirmations             #
    # ------------------------------------------------------------------ #

    def set_pending_confirmation(self, match_id: int, winner_team_id: int) -> None:
        self._pending_match_id = match_id
        self._pending_winner_team_id = winner_team_id
