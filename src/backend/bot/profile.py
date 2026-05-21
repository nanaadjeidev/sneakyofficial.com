"""Player profile and ranking Discord commands."""
import logging
import interactions
from interactions import slash_command, slash_option, OptionType, Permissions, slash_default_member_permission, Embed, Button, ButtonStyle, ActionRow

from backend.profile import ProfileManager, RANKS, RANK_EMOJIS, TIER_ROMAN

logger = logging.getLogger("ProfileExt")

SORT_LABELS = {"rating": "TrueSkill Rating", "wins": "Match Wins", "rank": "Rank"}


def _embed(title: str, desc: str = "", colour: int = 0x7e32f0) -> Embed:
    return Embed(title=title, description=desc, color=colour)


class ProfileExt(interactions.Extension):

    def __init__(self, bot: interactions.Client) -> None:
        self.bot = bot

    # ------------------------------------------------------------------ #
    #  /profile                                                            #
    # ------------------------------------------------------------------ #

    @slash_command(name="profile", description="View a player profile")
    async def profile(self, ctx: interactions.SlashContext) -> None:
        pass

    @profile.subcommand(sub_cmd_name="view", sub_cmd_description="View your own profile")
    async def profile_view(self, ctx: interactions.SlashContext) -> None:
        p = await ProfileManager.get_or_create(ctx.author_id, ctx.author.display_name or ctx.author.username)
        await ctx.send(embed=self._profile_embed(p), ephemeral=True)

    @profile.subcommand(sub_cmd_name="rank", sub_cmd_description="Check your current rank (once per month)")
    async def profile_rank(self, ctx: interactions.SlashContext) -> None:
        ok, msg, data = await ProfileManager.check_rank(ctx.author_id)
        if not ok:
            await ctx.send(embed=_embed("Rank Check", msg, 0xe74c3c), ephemeral=True)
            return
        rank = data.get("rank")
        tier = data.get("rank_tier")
        pred_rank = data.get("predicted_rank")
        pred_tier = data.get("predicted_rank_tier")
        from backend.profile.manager import rank_display
        embed = _embed("Your Rank", colour=0x7e32f0)
        rank_emoji = RANK_EMOJIS.get(rank, "❓")
        embed.add_field(
            "Current Rank",
            f"{rank_emoji} **{rank_display(rank, tier)}**" if rank else "❓ **Unranked**",
            inline=True,
        )
        if pred_rank:
            pred_emoji = RANK_EMOJIS.get(pred_rank, "❓")
            embed.add_field("Predicted Rank", f"{pred_emoji} **{rank_display(pred_rank, pred_tier)}**", inline=True)
        embed.set_footer(text="Next check available in 30 days.")
        await ctx.send(embed=embed, ephemeral=True)

    @profile.subcommand(sub_cmd_name="lookup", sub_cmd_description="View another player's profile")
    @slash_option(name="user", description="Player to look up", required=True, opt_type=OptionType.USER)
    async def profile_lookup(self, ctx: interactions.SlashContext, user: interactions.Member) -> None:
        p = await ProfileManager.get_profile(discord_id=user.id)
        if not p:
            await ctx.send(f"{user.display_name} hasn't played in a tournament yet.", ephemeral=True)
            return
        await ctx.send(embed=self._profile_embed(p))

    @profile.subcommand(sub_cmd_name="splattag", sub_cmd_description="Set your Splatoon splattag (can only be set once)")
    @slash_option(name="tag", description="Your splattag in Name#1234 format", required=True, opt_type=OptionType.STRING)
    async def profile_splattag(self, ctx: interactions.SlashContext, tag: str) -> None:
        from backend.profile.manager import _SPLATTAG_RE
        p = await ProfileManager.get_or_create(ctx.author_id, ctx.author.display_name or ctx.author.username)

        if not _SPLATTAG_RE.match(tag):
            await ctx.send(embed=_embed("❌ Error", "Invalid format. Use `Name#1234` (up to 20 chars + # + 4 digits)."), ephemeral=True)
            return
        if p.get("splattag"):
            await ctx.send(embed=_embed("❌ Error", f"Your splattag is already set to `{p['splattag']}`. Contact an admin to change it."), ephemeral=True)
            return

        confirm_id = f"splattag_confirm_{ctx.author_id}"
        cancel_id = f"splattag_cancel_{ctx.author_id}"
        row = ActionRow(
            Button(style=ButtonStyle.SUCCESS, label="Yes, that's my tag", custom_id=confirm_id),
            Button(style=ButtonStyle.DANGER, label="No, cancel", custom_id=cancel_id),
        )
        await ctx.send(
            embed=_embed("Confirm Splattag", f"Set your splattag to `{tag}`?\n\nOnce confirmed it can only be changed by an admin."),
            components=[row],
            ephemeral=True,
        )

        try:
            result = await self.bot.wait_for_component(components=[confirm_id, cancel_id], timeout=30)
            btn_ctx = result.ctx
            if btn_ctx.custom_id == confirm_id:
                ok, msg = await ProfileManager.set_splattag(ctx.author_id, tag)
                colour = 0x2ecc71 if ok else 0xe74c3c
                if ok and not p.get("twitch_username"):
                    msg += "\n\nDon't forget to link your Twitch with `/profile twitch <username>` to sign up from chat too."
                await btn_ctx.edit_origin(embed=_embed("Splattag Set" if ok else "❌ Error", msg, colour), components=[])
            else:
                await btn_ctx.edit_origin(embed=_embed("Cancelled", "Splattag not changed."), components=[])
        except Exception:
            await ctx.edit(embed=_embed("Timed Out", "Confirmation timed out. Run `/profile splattag` again to retry."), components=[])

    @profile.subcommand(sub_cmd_name="twitch", sub_cmd_description="Link your Twitch username (can only be set once)")
    @slash_option(name="username", description="Your Twitch username (no @)", required=True, opt_type=OptionType.STRING)
    async def profile_twitch(self, ctx: interactions.SlashContext, username: str) -> None:
        await ProfileManager.get_or_create(ctx.author_id, ctx.author.display_name or ctx.author.username)
        ok, msg = await ProfileManager.set_twitch(ctx.author_id, username.lstrip("@"))
        colour = 0x2ecc71 if ok else 0xe74c3c
        await ctx.send(embed=_embed("Twitch Linked" if ok else "❌ Error", msg, colour), ephemeral=True)

    # ------------------------------------------------------------------ #
    #  /rank                                                               #
    # ------------------------------------------------------------------ #

    @slash_command(name="rank", description="Manage player ranks (admin only)")
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    async def rank_cmd(self, ctx: interactions.SlashContext) -> None:
        pass

    @rank_cmd.subcommand(sub_cmd_name="set", sub_cmd_description="Set a player's rank")
    @slash_option(name="user", description="Target player", required=True, opt_type=OptionType.USER)
    @slash_option(name="rank", description="Rank to assign", required=True, opt_type=OptionType.INTEGER,
                  choices=[
                      interactions.SlashCommandChoice(
                          name=f"{RANK_EMOJIS[(v - 1) // 3 + 1]} {RANKS[(v - 1) // 3 + 1]} {TIER_ROMAN[(v - 1) % 3 + 1]}",
                          value=v,
                      )
                      for v in range(1, 19)
                  ])
    async def rank_set(self, ctx: interactions.SlashContext, user: interactions.Member, rank: int) -> None:
        r, t = (rank - 1) // 3 + 1, (rank - 1) % 3 + 1
        ok, msg = await ProfileManager.set_rank(user.id, r, t)
        colour = 0x2ecc71 if ok else 0xe74c3c
        await ctx.send(embed=_embed("Rank Set" if ok else "❌ Error", f"{user.mention}: {msg}", colour))

    @rank_cmd.subcommand(sub_cmd_name="predict", sub_cmd_description="Set a player's predicted rank")
    @slash_option(name="user", description="Target player", required=True, opt_type=OptionType.USER)
    @slash_option(name="rank", description="Predicted rank to assign", required=True, opt_type=OptionType.INTEGER,
                  choices=[
                      interactions.SlashCommandChoice(
                          name=f"{RANK_EMOJIS[(v - 1) // 3 + 1]} {RANKS[(v - 1) // 3 + 1]} {TIER_ROMAN[(v - 1) % 3 + 1]}",
                          value=v,
                      )
                      for v in range(1, 19)
                  ])
    async def rank_predict(self, ctx: interactions.SlashContext, user: interactions.Member, rank: int) -> None:
        r, t = (rank - 1) // 3 + 1, (rank - 1) % 3 + 1
        ok, msg = await ProfileManager.set_predicted_rank(user.id, r, t)
        colour = 0x2ecc71 if ok else 0xe74c3c
        await ctx.send(embed=_embed("Predicted Rank Set" if ok else "❌ Error", f"{user.mention}: {msg}", colour))

    @rank_cmd.subcommand(sub_cmd_name="promote", sub_cmd_description="Promote a player one rank")
    @slash_option(name="user", description="Target player", required=True, opt_type=OptionType.USER)
    async def rank_promote(self, ctx: interactions.SlashContext, user: interactions.Member) -> None:
        ok, msg = await ProfileManager.promote(user.id)
        colour = 0x2ecc71 if ok else 0xe74c3c
        await ctx.send(embed=_embed("Promoted!" if ok else "❌ Error", f"{user.mention}: {msg}", colour))

    # ------------------------------------------------------------------ #
    #  /leaderboard                                                        #
    # ------------------------------------------------------------------ #

    @slash_command(name="leaderboard", description="Show the tournament leaderboard")
    @slash_option(name="sort", description="Sort by", required=False, opt_type=OptionType.STRING,
                  choices=[
                      interactions.SlashCommandChoice(name="TrueSkill Rating", value="rating"),
                      interactions.SlashCommandChoice(name="Match Wins", value="wins"),
                      interactions.SlashCommandChoice(name="Rank", value="rank"),
                  ])
    async def leaderboard(self, ctx: interactions.SlashContext, sort: str = "rating") -> None:
        await ctx.defer()
        rows = await ProfileManager.get_leaderboard(sort=sort, limit=15)
        if not rows:
            await ctx.send(embed=_embed("Leaderboard", "No players have competed yet."))
            return

        lines = []
        for i, p in enumerate(rows, 1):
            tag = f"`{p['splattag']}`" if p.get("splattag") else p["display_name"]
            rank_icon = p["rank_emoji"]
            rating = p["rating"]
            wins = p["matches_won"]
            t_wins = p["tournament_wins"]
            lines.append(f"**{i}.** {rank_icon} {tag} - ⚡ {rating} | 🏆 {t_wins} tourney | ✅ {wins} wins")

        embed = _embed(
            f"🏆 Leaderboard: {SORT_LABELS.get(sort, sort)}",
            "\n".join(lines),
        )
        embed.set_footer(text=f"Sorted by {SORT_LABELS.get(sort, sort)} · {len(rows)} players")
        await ctx.send(embed=embed)

    # ------------------------------------------------------------------ #
    #  Helpers                                                             #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _profile_embed(p: dict) -> Embed:
        from backend.profile.manager import _conservative
        rating = _conservative(p.get("trueskill_mu", 25.0), p.get("trueskill_sigma", 8.333))
        total = (p.get("matches_won") or 0) + (p.get("matches_lost") or 0)
        wr = round((p.get("matches_won") or 0) / total * 100) if total else 0
        splattag = p.get("splattag") or "Not set"
        first = p.get("first_played_at")
        first_str = first.strftime("%Y-%m-%d") if first else "Never"

        embed = Embed(title=p.get("display_name", "Player"), color=0x7e32f0)
        embed.add_field("Splattag", f"`{splattag}`", inline=True)
        embed.add_field("TrueSkill Rating", f"⚡ **{rating}**", inline=True)
        embed.add_field("Tournament Wins", str(p.get("tournament_wins") or 0), inline=True)
        embed.add_field("Match W/L", f"{p.get('matches_won',0)} / {p.get('matches_lost',0)} ({wr}%)", inline=True)
        embed.add_field("First Played", first_str, inline=True)
        embed.set_footer(text="Use /profile rank to check your rank (once per month).")
        return embed
