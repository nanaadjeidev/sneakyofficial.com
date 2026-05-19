"""Twitch bot for tournament sign-ups and status."""
import logging
from typing import Optional

from twitchio.ext import commands

from backend.util.config import global_config
from backend.tournament import TournamentManager

logger = logging.getLogger("TwitchBot")


class TwitchBot(commands.Bot):

    def __init__(self) -> None:
        super().__init__(
            token=global_config.twitch_bot_token,
            prefix="!",
            initial_channels=[global_config.twitch_channel] if global_config.twitch_channel else [],
        )
        # Tracks the match currently awaiting Twitch-side confirmation (one at a time per channel)
        self._pending_match_id: Optional[int] = None
        self._pending_winner_team_id: Optional[int] = None

    async def event_ready(self) -> None:
        logger.info("Twitch bot ready: %s", self.nick)

    async def event_message(self, message) -> None:
        if message.echo:
            return
        await self.handle_commands(message)

    # ------------------------------------------------------------------ #
    #  Commands                                                            #
    # ------------------------------------------------------------------ #

    async def _get_guild_id(self) -> int | None:
        """Return configured guild_id, or look up the most recent active tournament's guild."""
        if global_config.twitch_guild_id:
            return global_config.twitch_guild_id
        from backend.util.database_context_manager import DBContextManager
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT guild_id FROM tournaments WHERE status IN ('signup','active') ORDER BY created_at DESC LIMIT 1"
            )
            row = await cur.fetchone()
            return row[0] if row else None

    @commands.command(name="signup")
    async def cmd_signup(self, ctx: commands.Context) -> None:
        guild_id = await self._get_guild_id()
        if not guild_id:
            await ctx.send(f"@{ctx.author.name} No tournament is currently active.")
            return

        twitch_username = ctx.author.name.lower()
        display_name = ctx.author.display_name or ctx.author.name

        ok, msg = await TournamentManager.signup(
            guild_id=guild_id,
            discord_id=None,
            twitch_username=twitch_username,
            display_name=display_name,
        )
        bracket_suffix = f" | {global_config.website_url}/tournament" if ok else ""
        await ctx.send(f"@{ctx.author.name} {msg}{bracket_suffix}")

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
        await ctx.send(f"🏆 Tournament bracket: {global_config.website_url}/tournament")

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
        status_map = {"signup": "open for sign-ups", "active": "in progress", "complete": "completed"}
        label = status_map.get(t["status"], t["status"])
        await ctx.send(f"🏆 {t['name']} — {label} | {global_config.website_url}/tournament")

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

    def set_pending_confirmation(self, match_id: int, winner_team_id: int) -> None:
        """Called by the Discord bot when a result is reported, so Twitch players can also confirm."""
        self._pending_match_id = match_id
        self._pending_winner_team_id = winner_team_id
