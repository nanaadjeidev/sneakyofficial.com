"""Single-elimination Splatoon community tournament system."""
import asyncio
import logging
import random

import interactions
from interactions import (
    slash_command, slash_option, OptionType, Permissions,
    slash_default_member_permission, Button, ButtonStyle,
    Embed, listen, ActionRow,
)
from interactions.api.events import Component as ComponentEvent

from backend.util.config import global_config
from backend.util.database_context_manager import DBContextManager
from backend.tournament import TournamentManager

logger = logging.getLogger("Tournament")

BRACKET_URL = f"{global_config.website_url}/tournament"


async def post_match_confirmation_embed(
    bot: interactions.Client,
    match_id: int,
    winner_team_id: int,
    winner_name: str,
    opposing_discord_ids: list[int],
) -> None:
    """Post a confirm/dispute embed to the configured results channel."""
    channel_id = global_config.tournament_results_channel
    if not channel_id:
        logger.warning("TOURNAMENT_RESULTS_CHANNEL not set — skipping confirmation embed")
        return
    try:
        channel = await bot.fetch_channel(channel_id)
        mentions = " ".join(f"<@{uid}>" for uid in opposing_discord_ids) if opposing_discord_ids else "(opposing team)"
        embed = _embed(
            "⚔️ Match Result Reported",
            f"**{winner_name}** has been reported as the winner.\n\nOpposing team must confirm or dispute below.",
            0xf39c12,
        )
        embed.set_footer(text=f"Match ID: {match_id}")
        confirm_btn = Button(style=ButtonStyle.GREEN, label="Confirm Win", custom_id=f"tourney_confirm_{match_id}_{winner_team_id}")
        dispute_btn = Button(style=ButtonStyle.RED, label="Dispute", custom_id=f"tourney_dispute_{match_id}_{winner_team_id}")
        await channel.send(
            content=f"📣 {mentions} — please confirm or dispute:",
            embed=embed,
            components=[ActionRow(confirm_btn, dispute_btn)],
        )
    except Exception:
        logger.exception("Failed to post match confirmation embed for match %s", match_id)

_BOT_ADJECTIVES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot",
                   "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima",
                   "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo",
                   "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "Xray"]

# ------------------------------------------------------------------ #
#  Splatoon 3 stage images & mode labels                              #
# ------------------------------------------------------------------ #

_STAGE_IMAGES: dict[str, str] = {
    "Scorch Gorge":         "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/1/1c/S3_Stage_Scorch_Gorge.png/300px-S3_Stage_Scorch_Gorge.png",
    "Eeltail Alley":        "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/7/7d/S3_Stage_Eeltail_Alley.png/300px-S3_Stage_Eeltail_Alley.png",
    "Hagglefish Market":    "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/a/ad/S3_Stage_Hagglefish_Market.png/300px-S3_Stage_Hagglefish_Market.png",
    "Undertow Spillway":    "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/a/ad/S3_Stage_Undertow_Spillway.png/300px-S3_Stage_Undertow_Spillway.png",
    "Mincemeat Metalworks": "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/d/d1/S3_Stage_Mincemeat_Metalworks.png/300px-S3_Stage_Mincemeat_Metalworks.png",
    "Hammerhead Bridge":    "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/9/94/S3_Stage_Hammerhead_Bridge.png/300px-S3_Stage_Hammerhead_Bridge.png",
    "Museum d'Alfonsino":   "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/6/6a/S3_Stage_Museum_d'Alfonsino.png/300px-S3_Stage_Museum_d'Alfonsino.png",
    "Mahi-Mahi Resort":     "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/6/6b/S3_Stage_Mahi-Mahi_Resort.png/300px-S3_Stage_Mahi-Mahi_Resort.png",
    "Inkblot Art Academy":  "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/4/45/S3_Stage_Inkblot_Art_Academy.png/300px-S3_Stage_Inkblot_Art_Academy.png",
    "Sturgeon Shipyard":    "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/4/45/S3_Stage_Sturgeon_Shipyard.png/300px-S3_Stage_Sturgeon_Shipyard.png",
    "MakoMart":             "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/4/47/S3_Stage_MakoMart.png/300px-S3_Stage_MakoMart.png",
    "Wahoo World":          "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/7/71/S3_Stage_Wahoo_World.png/300px-S3_Stage_Wahoo_World.png",
    "Brinewater Springs":   "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/f/fc/S3_Stage_Brinewater_Springs.png/300px-S3_Stage_Brinewater_Springs.png",
    "Flounder Heights":     "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/2/23/S3_Stage_Flounder_Heights.png/300px-S3_Stage_Flounder_Heights.png",
    "Um'ami Ruins":         "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/9/95/S3_Stage_Um'ami_Ruins.png/300px-S3_Stage_Um'ami_Ruins.png",
    "Manta Maria":          "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/8/86/S3_Stage_Manta_Maria.png/300px-S3_Stage_Manta_Maria.png",
    "Barnacle & Dime":      "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/2/2a/S3_Stage_Barnacle_&_Dime.png/300px-S3_Stage_Barnacle_&_Dime.png",
    "Humpback Pump Track":  "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/5/57/S3_Stage_Humpback_Pump_Track.png/300px-S3_Stage_Humpback_Pump_Track.png",
    "Crableg Capital":      "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/b/bb/S3_Stage_Crableg_Capital.png/300px-S3_Stage_Crableg_Capital.png",
    "Shipshape Cargo Co.":  "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/8/8b/S3_Stage_Shipshape_Cargo_Co..png/300px-S3_Stage_Shipshape_Cargo_Co..png",
    "Robo ROM-en":          "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/9/92/S3_Stage_Robo_ROM-en.png/300px-S3_Stage_Robo_ROM-en.png",
    "Bluefin Depot":        "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/6/69/S3_Stage_Bluefin_Depot.png/300px-S3_Stage_Bluefin_Depot.png",
    "Marlin Airport":       "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/b/b6/S3_Stage_Marlin_Airport.png/300px-S3_Stage_Marlin_Airport.png",
    "Lemuria Hub":          "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/2/22/S3_Stage_Lemuria_Hub.png/300px-S3_Stage_Lemuria_Hub.png",
    "Urchin Underpass":     "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/f/fa/S3_Stage_Urchin_Underpass.png/300px-S3_Stage_Urchin_Underpass.png",
}

_MODE_EMOJI: dict[str, str] = {
    "turf_war":      "🎨",
    "splat_zones":   "🟩",
    "tower_control": "🗼",
    "rainmaker":     "☔",
    "clam_blitz":    "🦀",
}


# ------------------------------------------------------------------ #
#  Embed helpers                                                       #
# ------------------------------------------------------------------ #

def _embed(title: str, description: str, colour: int = 0x7e32f0) -> Embed:
    return Embed(title=title, description=description, color=colour)


def _round_label(round_num: int, total_rounds: int) -> str:
    if round_num == total_rounds:
        return "Final"
    if round_num == total_rounds - 1 and total_rounds > 2:
        return "Semi-Final"
    return f"Round {round_num}"


def _schedule_line(schedule: dict | None) -> str:
    """Return e.g. '🟩 Splat Zones · Scorch Gorge' or empty string."""
    if not schedule:
        return ""
    parts = []
    mode_id = schedule.get("mode_id") or ""
    mode_name = schedule.get("mode_name") or ""
    stage_name = schedule.get("stage_name") or ""
    if mode_name:
        emoji = _MODE_EMOJI.get(mode_id, "🎮")
        parts.append(f"{emoji} {mode_name}")
    if stage_name:
        parts.append(stage_name)
    return " · ".join(parts)


def _match_embed(match_data: dict) -> Embed:
    """Build a match-announcement embed with stage image, mode, and team members."""
    round_num = match_data["round"]
    total_rounds = match_data["total_rounds"]
    match_num = match_data["match_number"]
    tournament_name = match_data["tournament_name"]
    schedule = match_data.get("schedule")
    teams = match_data["teams"]

    label = _round_label(round_num, total_rounds)
    sched = _schedule_line(schedule)
    desc = f"**{label} · Match {match_num}**"
    if sched:
        desc += f"\n{sched}"

    e = Embed(description=desc, color=0x7e32f0)
    e.set_footer(text=f"🦑 Splatoon 3 · {tournament_name} · /tournament report to submit results")

    team_emojis = ["🟣", "🔵"]
    for i, team in enumerate(teams):
        members_str = "  ".join(
            f"<@{m['discord_id']}>" if m.get("discord_id") else m["display_name"]
            for m in team["members"]
        )
        e.add_field(name=f"{team_emojis[i]} {team['name']}", value=members_str or "—", inline=True)

    if schedule:
        stage_name = schedule.get("stage_name") or ""
        img_url = _STAGE_IMAGES.get(stage_name)
        if img_url:
            e.set_image(url=img_url)

    return e


# ------------------------------------------------------------------ #
#  Extension                                                           #
# ------------------------------------------------------------------ #

class TournamentExt(interactions.Extension):

    def __init__(self, bot: interactions.Client) -> None:
        self.bot = bot

    # ------------------------------------------------------------------ #
    #  Internal announcement helpers                                       #
    # ------------------------------------------------------------------ #

    async def _post_bracket_announcement(self, channel, tournament_id: int, tournament_name: str) -> None:
        """Post the bracket-locked announcement with R1 match embeds."""
        matches = await TournamentManager.get_r1_matches_for_announcement(tournament_id)
        if not matches:
            return

        name_padded = tournament_name[:30]
        header = (
            "```\n"
            "╔══════════════════════════════════╗\n"
            "║   🦑  SPLATOON 3 TOURNAMENT  🦑  ║\n"
            f"║  {name_padded.center(32)}  ║\n"
            "║      ⚔️  BRACKET IS LOCKED!  ⚔️  ║\n"
            "╚══════════════════════════════════╝\n"
            "```"
        )
        await channel.send(content=header)
        for m in matches:
            embed = _match_embed(m)
            mentions = " ".join(
                f"<@{mem['discord_id']}>"
                for team in m["teams"] for mem in team["members"] if mem.get("discord_id")
            )
            content = f"⚔️ Match {m['match_number']}: **{m['teams'][0]['name']}** vs **{m['teams'][1]['name']}**"
            if mentions:
                content += f"\n{mentions}"
            await channel.send(content=content, embed=embed)

    async def _announce_next_match(self, confirmed_match_id: int) -> None:
        """After a win is confirmed, post the winner's next match if both teams are ready."""
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT m.round, m.match_number, m.tournament_id, t.channel_id "
                "FROM tournament_matches m JOIN tournaments t ON t.id = m.tournament_id WHERE m.id = %s",
                (confirmed_match_id,)
            )
            row = await cur.fetchone()
            if not row or not row["channel_id"]:
                return

            tournament_id = row["tournament_id"]
            channel_id = row["channel_id"]
            next_round = row["round"] + 1
            next_match_num = (row["match_number"] + 1) // 2

            await cur.execute(
                "SELECT id FROM tournament_matches "
                "WHERE tournament_id = %s AND round = %s AND match_number = %s "
                "AND status = 'pending' AND team1_id IS NOT NULL AND team2_id IS NOT NULL",
                (tournament_id, next_round, next_match_num)
            )
            next_match_row = await cur.fetchone()
            if not next_match_row:
                return  # both teams not decided yet, or tournament over

        match_data = await TournamentManager.get_match_for_announcement(
            tournament_id, next_round, next_match_num
        )
        if not match_data:
            return

        try:
            channel = await self.bot.fetch_channel(channel_id)
            embed = _match_embed(match_data)
            mentions = " ".join(
                f"<@{mem['discord_id']}>"
                for team in match_data["teams"] for mem in team["members"] if mem.get("discord_id")
            )
            label = _round_label(next_round, match_data["total_rounds"])
            content = f"⚔️ **{label} — Match {match_data['match_number']}** is ready!"
            if mentions:
                content += f"\n{mentions}"
            await channel.send(content=content, embed=embed)
        except Exception as e:
            logger.warning("Could not post next match announcement: %s", e)

    # ------------------------------------------------------------------ #
    #  Admin commands                                                      #
    # ------------------------------------------------------------------ #

    @slash_command(
        name="tournament",
        description="Tournament management",
        scopes=[global_config.tournament_guild_id] if global_config.tournament_guild_id else interactions.MISSING,
    )
    async def tournament(self, ctx: interactions.SlashContext) -> None:
        pass

    @tournament.subcommand(sub_cmd_name="create", sub_cmd_description="Create and open a tournament for sign-ups")
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    @slash_option(name="name", description="Tournament name", required=True, opt_type=OptionType.STRING)
    @slash_option(
        name="team_size",
        description="Players per team (default: 4)",
        required=False,
        opt_type=OptionType.INTEGER,
        choices=[
            interactions.SlashCommandChoice(name="4v4 (default)", value=4),
            interactions.SlashCommandChoice(name="3v3", value=3),
            interactions.SlashCommandChoice(name="2v2", value=2),
        ],
    )
    @slash_option(
        name="affects_rating",
        description="Whether results count towards TrueSkill ratings and tournament wins (default: yes)",
        required=False,
        opt_type=OptionType.BOOLEAN,
    )
    async def tournament_create(self, ctx: interactions.SlashContext, name: str, team_size: int = 4, affects_rating: bool = True) -> None:
        await ctx.defer()
        ok, msg, tid = await TournamentManager.create(
            guild_id=ctx.guild_id,
            name=name,
            channel_id=ctx.channel_id,
            created_by=ctx.author_id,
            team_size=team_size,
            affects_rating=affects_rating,
        )
        embed = _embed(
            "🏆 Tournament Created" if ok else "❌ Error",
            msg,
            colour=0x2ecc71 if ok else 0xe74c3c,
        )
        if ok:
            embed.add_field("Bracket", f"[View bracket]({BRACKET_URL})", inline=True)
            embed.add_field("Sign-up command", "`/tournament signup`", inline=True)
            embed.add_field("Team size", f"{team_size}v{team_size}", inline=True)
            embed.add_field("Ratings", "Affects rating" if affects_rating else "No rating impact", inline=True)
        await ctx.send(embed=embed)

    @tournament.subcommand(sub_cmd_name="lock", sub_cmd_description="Close sign-ups and generate the bracket")
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    async def tournament_lock(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer()
        ok, msg, teams = await TournamentManager.lock(guild_id=ctx.guild_id)

        if not ok:
            await ctx.send(embed=_embed("❌ Error", msg, 0xe74c3c))
            return

        team_lines = []
        for t in teams:
            members = ", ".join(t["members"])
            team_lines.append(f"**{t['name']}**: {members}")

        embed = _embed("🔒 Tournament Locked!", msg + "\n\n" + "\n".join(team_lines), 0x2ecc71)
        embed.add_field("Bracket", f"[View bracket]({BRACKET_URL})", inline=False)
        embed.set_footer(text="Use /tournament report to report match results.")
        await ctx.send(embed=embed)

        # Post individual match announcements with map/mode if set
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id, name FROM tournaments WHERE guild_id = %s AND status = 'active' ORDER BY created_at DESC LIMIT 1",
                (ctx.guild_id,)
            )
            t = await cur.fetchone()
        if t:
            await self._post_bracket_announcement(ctx.channel, t["id"], t["name"])

    @tournament.subcommand(sub_cmd_name="cancel", sub_cmd_description="Cancel the current tournament")
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    async def tournament_cancel(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer()
        ok, msg = await TournamentManager.cancel(guild_id=ctx.guild_id)
        colour = 0x2ecc71 if ok else 0xe74c3c
        await ctx.send(embed=_embed("Tournament Cancelled" if ok else "❌ Error", msg, colour))

    # ------------------------------------------------------------------ #
    #  Dev / testing commands (admin only)                                 #
    # ------------------------------------------------------------------ #

    @tournament.subcommand(
        sub_cmd_name="seed",
        sub_cmd_description="[Dev] Fill the current sign-up tournament with fake bot players",
    )
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    @slash_option(
        name="count",
        description="Number of fake players to add (default: 2 full teams)",
        required=False,
        opt_type=OptionType.INTEGER,
    )
    async def tournament_seed(self, ctx: interactions.SlashContext, count: int = 0) -> None:
        await ctx.defer()
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id, name, status, team_size FROM tournaments WHERE guild_id = %s AND status IN ('signup','active') ORDER BY created_at DESC LIMIT 1",
                (ctx.guild_id,)
            )
            row = await cur.fetchone()
            if not row:
                await ctx.send(
                    embed=_embed("❌ No open tournament", "Start a sign-up phase first with `/tournament create`.", 0xe74c3c),
                    ephemeral=True,
                )
                return
            tid, tname, status, team_size = row
            if status != 'signup':
                await ctx.send(
                    embed=_embed("❌ Sign-ups are closed", f"**{tname}** is already active. Cancel it first with `/tournament cancel`.", 0xe74c3c),
                    ephemeral=True,
                )
                return
            if count == 0:
                count = team_size * 2  # default: 2 full teams

            if count < 1:
                await ctx.send(
                    embed=_embed("❌ Invalid count", "Count must be at least 1.", 0xe74c3c),
                    ephemeral=True,
                )
                return

            await cur.execute("SELECT COUNT(*) FROM tournament_signups WHERE tournament_id = %s", (tid,))
            existing = (await cur.fetchone())[0]

            added_names: list[str] = []
            for i in range(count):
                display = f"TestBot {existing + i + 1}"
                await cur.execute(
                    "INSERT INTO tournament_signups (tournament_id, discord_id, twitch_username, display_name) VALUES (%s, NULL, NULL, %s)",
                    (tid, display),
                )
                added_names.append(display)

        embed = _embed(
            "🤖 Bots Added",
            f"Added **{len(added_names)}** fake players to **{tname}**.\n"
            f"Total signups now: **{existing + len(added_names)}**\n\n"
            f"Lock the tournament from the admin panel or `/tournament lock` when ready.",
            0x3498db,
        )
        await ctx.send(embed=embed)

        # Broadcast each bot signup so the frontend animates them in one by one
        from backend.util.broadcaster import TournamentBroadcaster
        broadcaster = TournamentBroadcaster.get()
        for i, display in enumerate(added_names):
            await broadcaster.broadcast({
                "event": "signup",
                "tournament_id": tid,
                "display_name": display,
                "discord_id": None,
                "twitch_username": None,
                "count": existing + i + 1,
            })
            await asyncio.sleep(0.15)

    @tournament.subcommand(
        sub_cmd_name="quicktest",
        sub_cmd_description="[Dev] Create, seed, and lock a full test bracket in one command",
    )
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    @slash_option(
        name="teams",
        description="Number of teams (2–8, default 2)",
        required=False,
        opt_type=OptionType.INTEGER,
    )
    @slash_option(
        name="team_size",
        description="Players per team (default: 4)",
        required=False,
        opt_type=OptionType.INTEGER,
        choices=[
            interactions.SlashCommandChoice(name="4v4 (default)", value=4),
            interactions.SlashCommandChoice(name="3v3", value=3),
            interactions.SlashCommandChoice(name="2v2", value=2),
        ],
    )
    async def tournament_quicktest(self, ctx: interactions.SlashContext, teams: int = 2, team_size: int = 4) -> None:
        await ctx.defer()

        if teams < 2 or teams > 8:
            await ctx.send(
                embed=_embed("❌ Invalid team count", "Teams must be between 2 and 8.", 0xe74c3c),
                ephemeral=True,
            )
            return

        # Auto-cancel any existing tournament so quicktest can always be run fresh
        await TournamentManager.cancel(ctx.guild_id)

        ok, msg, tid = await TournamentManager.create(
            guild_id=ctx.guild_id,
            name="Test Tournament",
            channel_id=ctx.channel_id,
            created_by=ctx.author_id,
            team_size=team_size,
        )
        if not ok:
            await ctx.send(embed=_embed("❌ Could not create tournament", msg, 0xe74c3c))
            return

        count = teams * team_size
        adjectives = list(_BOT_ADJECTIVES[:count])
        random.shuffle(adjectives)
        async with DBContextManager() as cur:
            for adj in adjectives[:count]:
                await cur.execute(
                    "INSERT INTO tournament_signups (tournament_id, discord_id, twitch_username, display_name) VALUES (%s, NULL, NULL, %s)",
                    (tid, f"TestBot {adj}"),
                )

        ok, lock_msg, bracket_teams = await TournamentManager.lock(guild_id=ctx.guild_id)
        if not ok:
            await ctx.send(embed=_embed("❌ Lock failed", lock_msg, 0xe74c3c))
            return

        team_lines = "\n".join(
            f"**{t['name']}**: {', '.join(t['members'])}" for t in bracket_teams
        )
        embed = _embed(
            "🧪 Test Tournament Ready",
            f"{len(bracket_teams)} teams · {count} bot players ({team_size}v{team_size})\n\n{team_lines}",
            0x3498db,
        )
        embed.add_field("Bracket", f"[View bracket]({BRACKET_URL})", inline=True)
        embed.add_field("Advance matches", "`/tournament simwin`", inline=True)
        embed.set_footer(text="Use /tournament simwin to randomly decide each match.")
        await ctx.send(embed=embed)

    @tournament.subcommand(
        sub_cmd_name="simwin",
        sub_cmd_description="[Dev] Randomly advance a pending match — no player confirmation needed",
    )
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    @slash_option(
        name="match_id",
        description="Specific match ID to advance (leave blank to auto-pick the next pending match)",
        required=False,
        opt_type=OptionType.INTEGER,
    )
    async def tournament_simwin(self, ctx: interactions.SlashContext, match_id: int = 0) -> None:
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id FROM tournaments WHERE guild_id = %s AND status = 'active' ORDER BY created_at DESC LIMIT 1",
                (ctx.guild_id,)
            )
            t = await cur.fetchone()
            if not t:
                await ctx.send(
                    embed=_embed("❌ No active tournament", "Lock a tournament first.", 0xe74c3c),
                    ephemeral=True,
                )
                return
            tid = t["id"]

            if match_id:
                await cur.execute(
                    "SELECT id, round, match_number, team1_id, team2_id, status FROM tournament_matches WHERE id = %s AND tournament_id = %s",
                    (match_id, tid)
                )
            else:
                await cur.execute(
                    "SELECT id, round, match_number, team1_id, team2_id, status FROM tournament_matches "
                    "WHERE tournament_id = %s AND status = 'pending' AND team1_id IS NOT NULL AND team2_id IS NOT NULL "
                    "ORDER BY round ASC, match_number ASC LIMIT 1",
                    (tid,)
                )
            match = await cur.fetchone()

        if not match:
            await ctx.send(embed=_embed("✅ No pending matches", "All matches are done — check the bracket!", 0x2ecc71))
            return

        if match["status"] != "pending":
            await ctx.send(
                embed=_embed("❌ Match not pending", f"Match {match['id']} has status `{match['status']}`.", 0xe74c3c),
                ephemeral=True,
            )
            return

        winner_team_id = random.choice([match["team1_id"], match["team2_id"]])
        ok, msg = await TournamentManager.admin_complete_match(match["id"], winner_team_id)

        colour = 0x2ecc71 if ok else 0xe74c3c
        embed = _embed("⚔️ Match Simulated" if ok else "❌ Error", msg, colour)
        if ok:
            embed.add_field("Round", str(match["round"]), inline=True)
            embed.add_field("Match", str(match["match_number"]), inline=True)
            embed.add_field("Bracket", f"[View bracket]({BRACKET_URL})", inline=False)
            await ctx.send(embed=embed)
            await self._announce_next_match(match["id"])
        else:
            await ctx.send(embed=embed)

    # ------------------------------------------------------------------ #
    #  Player commands                                                     #
    # ------------------------------------------------------------------ #

    @tournament.subcommand(sub_cmd_name="signup", sub_cmd_description="Sign up for the current tournament")
    async def tournament_signup(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer()
        ok, msg = await TournamentManager.signup(
            guild_id=ctx.guild_id,
            discord_id=ctx.author_id,
            twitch_username=None,
            display_name=ctx.author.display_name or ctx.author.username,
        )
        colour = 0x2ecc71 if ok else 0xe74c3c
        await ctx.send(embed=_embed("Sign-Up" if ok else "❌ Error", msg, colour), ephemeral=not ok)

    @tournament.subcommand(sub_cmd_name="leave", sub_cmd_description="Leave the current tournament sign-up")
    async def tournament_leave(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer(ephemeral=True)
        ok, msg = await TournamentManager.leave(
            guild_id=ctx.guild_id,
            discord_id=ctx.author_id,
            twitch_username=None,
        )
        colour = 0x2ecc71 if ok else 0xe74c3c
        await ctx.send(embed=_embed("Left Tournament" if ok else "❌ Error", msg, colour), ephemeral=True)

    @tournament.subcommand(sub_cmd_name="status", sub_cmd_description="Show current tournament status with current round info")
    async def tournament_status(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id, name, status, team_size FROM tournaments WHERE guild_id = %s AND status IN ('signup','active','complete') ORDER BY created_at DESC LIMIT 1",
                (ctx.guild_id,)
            )
            t = await cur.fetchone()

        if not t:
            await ctx.send(embed=_embed("No Tournament", "There is no active tournament right now.", 0x95a5a6))
            return

        status_map = {"signup": "Open for sign-ups 📝", "active": "In progress ⚔️", "complete": "Completed 🏆"}
        embed = _embed(
            f"🏆 {t['name']}",
            f"**Status:** {status_map.get(t['status'], t['status'])}\n**Format:** {t['team_size']}v{t['team_size']} Splatoon 3",
        )

        if t["status"] == "signup":
            async with DBContextManager() as cur:
                await cur.execute("SELECT COUNT(*) FROM tournament_signups WHERE tournament_id = %s", (t["id"],))
                count = (await cur.fetchone())[0]
            embed.add_field("Players signed up", str(count), inline=True)
            embed.add_field("Sign up", "`/tournament signup`", inline=True)

        elif t["status"] == "active":
            # Show current round's pending matches with schedule
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute(
                    "SELECT MIN(round) AS cur_round FROM tournament_matches "
                    "WHERE tournament_id = %s AND status = 'pending' AND team1_id IS NOT NULL AND team2_id IS NOT NULL",
                    (t["id"],)
                )
                rnd_row = await cur.fetchone()
                cur_round = rnd_row["cur_round"] if rnd_row and rnd_row["cur_round"] else None

                if cur_round:
                    await cur.execute(
                        "SELECT MAX(round) AS total FROM tournament_matches WHERE tournament_id = %s",
                        (t["id"],)
                    )
                    total_row = await cur.fetchone()
                    total_rounds = total_row["total"] if total_row else 1
                    label = _round_label(cur_round, total_rounds)

                    await cur.execute(
                        "SELECT stage_name, mode_id, mode_name FROM tournament_round_schedule "
                        "WHERE tournament_id = %s AND round = %s",
                        (t["id"], cur_round)
                    )
                    schedule = await cur.fetchone()

                    await cur.execute(
                        "SELECT m.match_number, t1.team_name AS t1_name, t2.team_name AS t2_name "
                        "FROM tournament_matches m "
                        "JOIN tournament_teams t1 ON t1.id = m.team1_id "
                        "JOIN tournament_teams t2 ON t2.id = m.team2_id "
                        "WHERE m.tournament_id = %s AND m.round = %s AND m.status = 'pending' "
                        "ORDER BY m.match_number",
                        (t["id"], cur_round)
                    )
                    pending = list(await cur.fetchall())

                    sched_str = _schedule_line(dict(schedule) if schedule else None)
                    embed.add_field(
                        name=f"🎮 {label}",
                        value=(sched_str if sched_str else "Schedule TBD") + "\n" +
                              "\n".join(f"Match {m['match_number']}: **{m['t1_name']}** vs **{m['t2_name']}**" for m in pending),
                        inline=False,
                    )

                    if schedule and schedule["stage_name"]:
                        img_url = _STAGE_IMAGES.get(schedule["stage_name"])
                        if img_url:
                            embed.set_image(url=img_url)

        embed.add_field("Bracket", f"[View here]({BRACKET_URL})", inline=False)
        await ctx.send(embed=embed)

    @tournament.subcommand(sub_cmd_name="players", sub_cmd_description="List all signed-up players")
    async def tournament_players(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id, name FROM tournaments WHERE guild_id = %s AND status = 'signup' ORDER BY created_at DESC LIMIT 1",
                (ctx.guild_id,)
            )
            t = await cur.fetchone()
            if not t:
                await ctx.send(embed=_embed("No Open Tournament", "No tournament is open for sign-ups.", 0x95a5a6))
                return

            await cur.execute(
                "SELECT display_name, discord_id FROM tournament_signups WHERE tournament_id = %s ORDER BY signed_up_at",
                (t["id"],)
            )
            rows = await cur.fetchall()

        if not rows:
            await ctx.send(embed=_embed(f"{t['name']} — Players", "No one has signed up yet.", 0x95a5a6))
            return

        lines = []
        for i, row in enumerate(rows, 1):
            mention = f"<@{row['discord_id']}>" if row["discord_id"] else row["display_name"]
            lines.append(f"{i}. {mention}")

        embed = _embed(f"{t['name']} — {len(rows)} player(s)", "\n".join(lines))
        await ctx.send(embed=embed)

    @tournament.subcommand(sub_cmd_name="nameteam", sub_cmd_description="Set your team's name (captains only)")
    @slash_option(name="name", description="Your team's new name", required=True, opt_type=OptionType.STRING)
    async def tournament_nameteam(self, ctx: interactions.SlashContext, name: str) -> None:
        await ctx.defer()
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT id FROM tournament_teams WHERE captain_discord_id = %s AND tournament_id IN (SELECT id FROM tournaments WHERE guild_id = %s AND status = 'active') LIMIT 1",
                (ctx.author_id, ctx.guild_id)
            )
            row = await cur.fetchone()
        if not row:
            await ctx.send("You're not the captain of any team in the active tournament.", ephemeral=True)
            return
        ok, msg = await TournamentManager.set_team_name(row[0], name, ctx.author_id)
        colour = 0x2ecc71 if ok else 0xe74c3c
        await ctx.send(embed=_embed("Team Renamed" if ok else "❌ Error", msg, colour), ephemeral=not ok)

    @tournament.subcommand(sub_cmd_name="bracket", sub_cmd_description="Show the bracket link and current round info")
    async def tournament_bracket(self, ctx: interactions.SlashContext) -> None:
        await ctx.send(embed=_embed("🏆 Tournament Bracket", f"[View the bracket here]({BRACKET_URL})\n\nUse `/tournament status` to see the current round's map and mode."))

    @tournament.subcommand(sub_cmd_name="matchinfo", sub_cmd_description="Show your current match details — map, mode, and opponent")
    async def tournament_matchinfo(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer(ephemeral=True)
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id FROM tournaments WHERE guild_id = %s AND status = 'active' ORDER BY created_at DESC LIMIT 1",
                (ctx.guild_id,)
            )
            t = await cur.fetchone()

        if not t:
            await ctx.send(embed=_embed("No Tournament", "No active tournament right now.", 0x95a5a6), ephemeral=True)
            return

        match = await TournamentManager.get_player_match(t["id"], discord_id=ctx.author_id)
        if not match:
            await ctx.send(embed=_embed("No Match", "You don't have a pending match right now.", 0x95a5a6), ephemeral=True)
            return

        match_data = await TournamentManager.get_match_for_announcement(t["id"], match["round"], match["match_number"])
        if not match_data:
            await ctx.send(embed=_embed("Match Not Ready", "Your match isn't fully set up yet.", 0x95a5a6), ephemeral=True)
            return

        # Mark which team is theirs
        player_team_id = match["player_team_id"]
        teams = match_data["teams"]
        yours_idx = 0 if teams[0]["id"] == player_team_id else 1
        teams[yours_idx]["name"] += " ← Your Team"

        embed = _match_embed(match_data)
        await ctx.send(embed=embed, ephemeral=True)

    # ------------------------------------------------------------------ #
    #  Match reporting                                                     #
    # ------------------------------------------------------------------ #

    @tournament.subcommand(sub_cmd_name="room", sub_cmd_description="Get your match room code (home team only)")
    async def tournament_room(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer(ephemeral=True)
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id FROM tournaments WHERE guild_id = %s AND status = 'active' ORDER BY created_at DESC LIMIT 1",
                (ctx.guild_id,)
            )
            t = await cur.fetchone()
        if not t:
            await ctx.send(embed=_embed("❌ No active tournament", "There is no tournament in progress.", 0xe74c3c), ephemeral=True)
            return

        match = await TournamentManager.get_player_active_match(t["id"], discord_id=ctx.author_id)
        if not match:
            await ctx.send(embed=_embed("❌ No match found", "You don't have an active match right now.", 0xe74c3c), ephemeral=True)
            return

        if not match.get("is_home_team"):
            await ctx.send(
                embed=_embed("Away Team", "Your team is the **away team** this match. Ask the home team to share the room code with you.", 0x95a5a6),
                ephemeral=True,
            )
            return

        code = match.get("room_code", "????")
        embed = _embed("🏠 Room Code", f"Your team is the **home team**. Create the private lobby and share the code below with the opposing team.", 0x2ecc71)
        embed.add_field("Room Code", f"```{code}```", inline=False)
        embed.add_field("Round", str(match["round"]), inline=True)
        embed.set_footer(text="Only you can see this message.")
        await ctx.send(embed=embed, ephemeral=True)

    @tournament.subcommand(sub_cmd_name="report", sub_cmd_description="Report your match result")
    @slash_option(name="result", description="Did your team win or lose?", required=True, opt_type=OptionType.STRING,
                  choices=[
                      interactions.SlashCommandChoice(name="We won", value="win"),
                      interactions.SlashCommandChoice(name="We lost", value="loss"),
                  ])
    async def tournament_report(self, ctx: interactions.SlashContext, result: str) -> None:
        await ctx.defer(ephemeral=True)

        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id FROM tournaments WHERE guild_id = %s AND status = 'active' ORDER BY created_at DESC LIMIT 1",
                (ctx.guild_id,)
            )
            t = await cur.fetchone()

        if not t:
            await ctx.send("No active tournament.", ephemeral=True)
            return

        match = await TournamentManager.get_player_active_match(t["id"], discord_id=ctx.author_id)
        if not match:
            await ctx.send("You don't have an active match right now.", ephemeral=True)
            return
        if match["status"] == "awaiting_confirmation":
            await ctx.send("Your match result is already reported — waiting for the opposing team to confirm.", ephemeral=True)
            return

        player_team_id = match["player_team_id"]
        team1_id = match["team1_id"]
        team2_id = match["team2_id"]
        match_id = match["id"]

        winner_team_id = player_team_id if result == "win" else (team2_id if player_team_id == team1_id else team1_id)

        ok, msg = await TournamentManager.report_win(
            match_id=match_id,
            winner_team_id=winner_team_id,
            reporter_discord=ctx.author_id,
        )
        if not ok:
            await ctx.send(msg, ephemeral=True)
            return

        async with DBContextManager(use_dict=True) as cur:
            await cur.execute("SELECT team_name FROM tournament_teams WHERE id = %s", (winner_team_id,))
            winner_row = await cur.fetchone()
            winner_name = winner_row["team_name"] if winner_row else "Unknown"

            opposing_id = team2_id if winner_team_id == team1_id else team1_id
            await cur.execute(
                """SELECT s.discord_id FROM tournament_team_members ttm
                   JOIN tournament_signups s ON s.id = ttm.signup_id
                   WHERE ttm.team_id = %s AND s.discord_id IS NOT NULL""",
                (opposing_id,)
            )
            opposing_members = await cur.fetchall()

        opposing_ids = [m["discord_id"] for m in opposing_members]
        await post_match_confirmation_embed(self.bot, match_id, winner_team_id, winner_name, opposing_ids)
        await ctx.send("Result reported! Check the results channel.", ephemeral=True)

    @tournament.subcommand(sub_cmd_name="confirm", sub_cmd_description="Manually confirm a match result by match ID")
    @slash_option(name="match_id", description="Match ID (shown on the report message)", required=True, opt_type=OptionType.INTEGER)
    async def tournament_confirm_cmd(self, ctx: interactions.SlashContext, match_id: int) -> None:
        await ctx.defer(ephemeral=True)
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT reported_winner_id FROM tournament_win_reports WHERE match_id = %s AND status = 'pending'",
                (match_id,)
            )
            row = await cur.fetchone()
        if not row:
            await ctx.send("No pending result for that match ID.", ephemeral=True)
            return
        winner_team_id = row[0]
        await self._process_confirm(ctx, match_id, winner_team_id)

    # ------------------------------------------------------------------ #
    #  Component handler                                                   #
    # ------------------------------------------------------------------ #

    @listen(ComponentEvent)
    async def on_component(self, event: ComponentEvent) -> None:
        ctx = event.ctx
        cid = ctx.custom_id

        if cid.startswith("tourney_confirm_"):
            parts = cid.split("_")
            match_id = int(parts[2])
            winner_team_id = int(parts[3])
            await self._process_confirm(ctx, match_id, winner_team_id)

        elif cid.startswith("tourney_dispute_"):
            parts = cid.split("_")
            match_id = int(parts[2])
            await self._process_dispute(ctx, match_id)

    async def _process_confirm(self, ctx, match_id: int, winner_team_id: int) -> None:
        ok, msg, _ = await TournamentManager.confirm_win(
            match_id=match_id,
            confirmer_discord=ctx.author_id,
        )
        colour = 0x2ecc71 if ok else 0xe74c3c
        embed = _embed("✅ Confirmed" if ok else "❌ Error", msg, colour)
        if ok:
            embed.add_field("Bracket", f"[Updated bracket]({BRACKET_URL})", inline=False)

        try:
            await ctx.edit_origin(embed=embed, components=[])
        except Exception:
            await ctx.send(embed=embed, ephemeral=not ok)

        if ok:
            await self._announce_next_match(match_id)

    async def _process_dispute(self, ctx, match_id: int) -> None:
        ok, msg = await TournamentManager.dispute_win(match_id=match_id)
        embed = _embed("⚠️ Disputed" if ok else "❌ Error", msg, 0xe67e22 if ok else 0xe74c3c)
        if ok:
            embed.add_field("Admin action needed", "Please resolve this match manually.", inline=False)

        try:
            await ctx.edit_origin(embed=embed, components=[])
        except Exception:
            await ctx.send(embed=embed, ephemeral=True)
