"""
Team Drafting Extension for Discord Bot
"""
import logging
import random
import json
from typing import Dict, Optional, Any

import interactions
from interactions import (
    slash_command, slash_option, OptionType, Permissions,
    slash_default_member_permission, Button, ButtonStyle,
    Embed, listen, StringSelectMenu, StringSelectOption,
    Modal, ShortText
)
from interactions.api.events import Component as ComponentEvent, Startup
from backend.util.config import global_config
from backend.util.database_context_manager import DBContextManager

logger = logging.getLogger("TeamDrafting")


class DraftingExt(interactions.Extension):
    """Team drafting extension for creating balanced teams.

    This extension provides slash commands for organizing team drafts,
    managing player participation, and automatically creating balanced teams
    with optional voice channel organization.

    Attributes:
        bot: The Discord bot client instance.
        active_drafts: Dictionary tracking active drafts by guild ID.
        adjectives: List of adjective words for generating team names.
        subjects: List of subject words for generating team names.
    """

    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the drafting extension.

        Args:
            bot: The Discord bot client instance.
        """
        self.bot = bot
        self.active_drafts: Dict[int, Dict[str, Any]] = {}

        self.adjectives: list[str] = [
            "Splendid", "Booyah", "Fresh", "Radical", "Inky", "Colorful",
            "Fierce", "Elite", "Legendary", "Supreme", "Vibrant", "Dynamic",
            "Turbo", "Mega", "Ultra", "Super", "Blazing", "Stormy", "Sneaky",
            "Oceanic", "Tidal", "Flowing", "Rushing", "Sparkling", "Glowing",
            "Tentacle", "Squishy", "Sneaky", "Stealthy", "Speedy", "Slippery",
            "Deadly", "Powerful", "Mighty", "Crushing", "Explosive", "Chaotic",
            "Organized", "Tactical", "Strategic", "Coordinated", "United", "Synchronized",
            "Funky", "Grizzco", "Altarian", "Neo", "Anarchy", "Deep",
            "Cutting-Edge", "Lo-fi", "Chill", "Crusty", "Scorchin'",
            "Greasy", "Golden", "Hazardous", "Wavey", "Reefy", "Buzzing",
            "Scrappy", "Rebellious", "Ultra-Squidified", "Stinger-Slaying",
            "Big-Run-Ready", "Woomy-fied", "Tenta-fresh", "Ranked-Up",
            "Fishy", "Cracked", "Meta", "Drip-Core", "Potato", "Woomying", "Sea",
            "Jorvink", "Deep", "Laggy", "Sneaky", "Dynamic", "Zipcasted", "Fuzzy", "Anarchy",
            "Your mothers's", "Salty", "Mammalized", "Cracked", "Inkless", "Ninja",
            "Overfitted", "Rankless", "Stealthy", "Booyahless", "Disconnected",
            "Sweaty", "Smurfed", "Sloshed", "Meta", "Reefy", "Memeable",
            "Stickered", "Exploitative", "Sharked", "Crusty", "Reefslidered",
            "Squidbagging", "Crab-Walking", "Booyahless", "Grizzco-Trained", "Ink-Starved",
            "Roll-Canceled", "Missile-Happy", "Respawn-Punished", "Low-Turfing", "Sharked-Up",
            "Over-Specialed", "Booyah-Boosted", "Crusty", "Locker-Cursed", "Spawncampy",
            "Meta-Warped", "Big-Run-Hardened", "Catalog-Maxed", "Sticker-Addicted", "Alt-Mained",
            "Skill-Issued", "Gear-Broken", "Badge-Flexing", "Hazardized", "Splash-Walled",
            "Zoned-Out", "Tower-Pilled", "Clam-Cracked", "Freshometer-Capped"
        ]

        self.subjects: list[str] = [
            "Inklings", "Octolings", "Squids", "Tentacles", "Splashers",
            "Warriors", "Slingers", "Bombers", "Defenders", "Champions",
            "Legends", "Heroes", "Raiders", "Brigade", "Squad", "Movement",
            "Collective", "Crew", "Marines", "Punks", "Militia", "Cult",
            "Battalion", "Division", "Shooters", "Chargers", "Rollers",
            "Brushes", "Splatlings", "Dualies", "Blasters", "Sloshers",
            "Brellas", "Zapfish", "Krakens", "Jellies", "Salmonids",
            "Agents", "Idols", "Artists", "Turf Lords", "Ink Masters",
            "Zone Keepers", "Tower Guards", "Rainmakers", "Clam Collectors",
            "Morons", "Casuals", "Sweats", "Kids", "Deep Cutters", "Big Man Stans", "Frye Fans", "Shiver Mains",
            "Trizookers", "Tenta Missilers", "Crab Tank Drivers", "Zipcasters",
            "Splatana Slashers", "Stringer Snipers", "Wave Breakers",
            "Reefsliders", "Splatfest Veterans", "Tableturfers", "Grizzco Recruits",
            "Big Run Survivors", "Egg Collectors", "King Salmonid Hunters",
            "Anarchy Rulers", "Altarians", "Turf Fiends", "Locker Designers",
            "Catalog Grinders", "Badge Hoarders", "Sticker Collectors",
            "Splash Wall Abusers", "Sub Spammers", "Rank Demoters",
            "Lobby Dwellers", "Shoal Gamers", "Naut Couture Fans", "Squid Sisters Loyalists",
            "Marina OF Subcribers", "Big Man OF Subscribers", "Sneaky-Squids", "Ninja-Squids",
            "Portsmouth Fan", "Build", "BUT AGAIN", "Burst-bombs", "Cardinals", "Woomyers", "Slugs"
            "Sea-stags", "wawa", "Royals", "Ducklings", "Grillers", "Paladins", "Sea-Lions", "Sisters",
            "Cut", "Big-Shots", "Glowflies", "No-lifers", "Lobby Dwellers", "Booyah Bomb Tax Evaders", "Dualies",
            "Chargers", "Splashers", "Fuzzy Ooze", "Mains", "Squids", "Octolings",
            "Ninja Squids", "Squidbaggers", "Sharkers", "Tryhards",
            "Smurfs", "Missile Spammers", "Tenta Missilers", "Zipcaster Users",
            "Crab Tank Enjoyers", "Disconnect Warriors", "Anarchy Battle Mains",
            "Tableturfers", "Locker Artists", "Freshies", "Catalog Grinders",
            "Gear Simps", "Meta Abusers", "Sticker Collectors", "Altarians"
        ]

    async def _save_draft_to_db(self, guild_id: int, draft: Dict[str, Any]) -> None:
        """Save draft state to database.

        Args:
            guild_id: The guild ID for this draft.
            draft: The draft data to save.
        """
        try:
            async with DBContextManager() as cur:
                await cur.execute("""
                    INSERT INTO drafts (guild_id, channel_id, message_id, organizer_id, team_size, mode, players, pairs, pending_invites, notification_channel_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) AS new
                    ON DUPLICATE KEY UPDATE
                        channel_id = new.channel_id,
                        message_id = new.message_id,
                        team_size = new.team_size,
                        mode = new.mode,
                        players = new.players,
                        pairs = new.pairs,
                        pending_invites = new.pending_invites,
                        notification_channel_id = new.notification_channel_id,
                        updated_at = CURRENT_TIMESTAMP
                """, (
                    guild_id,
                    draft["channel_id"],
                    draft.get("message_id"),
                    draft["organizer_id"],
                    draft["team_size"],
                    draft["mode"],
                    json.dumps(draft["players"]),
                    json.dumps(draft["pairs"]),
                    json.dumps(draft.get("pending_invites", {})),
                    draft.get("notification_channel_id")
                ))
        except Exception as e:
            logger.error(f"Failed to save draft to database: {e}")

    async def _load_draft_from_db(self, guild_id: int) -> Optional[Dict[str, Any]]:
        """Load draft state from database.

        Args:
            guild_id: The guild ID to load draft for.

        Returns:
            Draft data dictionary or None if not found.
        """
        try:
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute("""
                    SELECT * FROM drafts WHERE guild_id = %s
                """, (guild_id,))
                row = await cur.fetchone()

                if row:
                    # Load pending_invites and convert string keys back to integers (JSON serialization converts int keys to strings)
                    pending_invites_raw = json.loads(row["pending_invites"]) if isinstance(row["pending_invites"], str) else row["pending_invites"]
                    pending_invites = {}
                    if pending_invites_raw:
                        for key, value in pending_invites_raw.items():
                            # Convert string keys back to integers
                            int_key = int(key) if isinstance(key, str) else key
                            pending_invites[int_key] = value

                    return {
                        "channel_id": row["channel_id"],
                        "message_id": row["message_id"],
                        "organizer_id": row["organizer_id"],
                        "team_size": row["team_size"],
                        "mode": row["mode"],
                        "players": json.loads(row["players"]) if isinstance(row["players"], str) else row["players"],
                        "pairs": json.loads(row["pairs"]) if isinstance(row["pairs"], str) else row["pairs"],
                        "pending_invites": pending_invites,
                        "notification_channel_id": row.get("notification_channel_id")
                    }
        except Exception as e:
            logger.error(f"Failed to load draft from database: {e}")
        return None

    async def _delete_draft_from_db(self, guild_id: int) -> None:
        """Delete draft from database.

        Args:
            guild_id: The guild ID to delete draft for.
        """
        try:
            async with DBContextManager() as cur:
                await cur.execute("DELETE FROM drafts WHERE guild_id = %s", (guild_id,))
        except Exception as e:
            logger.error(f"Failed to delete draft from database: {e}")

    async def _load_all_drafts(self) -> None:
        """Load all active drafts from database on startup."""
        try:
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute("SELECT * FROM drafts")
                rows = await cur.fetchall()

                for row in rows:
                    guild_id = row["guild_id"]

                    # Load pending_invites and convert string keys back to integers
                    pending_invites_raw = json.loads(row["pending_invites"]) if isinstance(row["pending_invites"], str) else row["pending_invites"]
                    pending_invites = {}
                    if pending_invites_raw:
                        for key, value in pending_invites_raw.items():
                            int_key = int(key) if isinstance(key, str) else key
                            pending_invites[int_key] = value

                    self.active_drafts[guild_id] = {
                        "channel_id": row["channel_id"],
                        "message_id": row["message_id"],
                        "organizer_id": row["organizer_id"],
                        "team_size": row["team_size"],
                        "mode": row["mode"],
                        "players": json.loads(row["players"]) if isinstance(row["players"], str) else row["players"],
                        "pairs": json.loads(row["pairs"]) if isinstance(row["pairs"], str) else row["pairs"],
                        "pending_invites": pending_invites,
                        "notification_channel_id": row.get("notification_channel_id")
                    }
                logger.info(f"Loaded {len(rows)} active drafts from database")
        except Exception as e:
            logger.error(f"Failed to load drafts from database: {e}")

    def _generate_unique_team_name(self, used_names: set[str]) -> str:
        """Generate a unique team name using random adjective + subject combination.

        Args:
            used_names: Set of already used team names to avoid duplicates.

        Returns:
            A unique team name string, or a fallback numbered team name.
        """
        max_attempts = 100
        attempts = 0

        while attempts < max_attempts:
            adjective = random.choice(self.adjectives)
            subject = random.choice(self.subjects)
            team_name = f"{adjective} {subject}"

            if team_name not in used_names:
                return team_name

            attempts += 1

        return f"Team {len(used_names) + 1}"

    async def _format_solo_players(self, guild: interactions.Guild, player_ids: list[int], display_mode: str = "newlines") -> str:
        """Format solo players list based on display mode.

        Args:
            guild: The guild to fetch members from.
            player_ids: List of player IDs to format.
            display_mode: Either "newlines" or "comma" for display formatting.

        Returns:
            Formatted string of players, respecting embed limits.
        """
        player_list = []
        for player_id in player_ids:
            if player_id < 0:  # Bot player
                player_list.append(f"Bot {abs(player_id)}")
            else:
                try:
                    member = await guild.fetch_member(player_id)
                    # Both modes just use mention now
                    player_list.append(member.mention)
                except Exception:
                    player_list.append(f"<@{player_id}>")

        # Join based on mode
        if display_mode == "comma":
            display_text = ", ".join(player_list)
        else:
            display_text = "\n".join(player_list)

        # Handle embed limit (1024 chars for field value)
        if len(display_text) > 1024:
            truncated_list = []
            char_count = 0
            separator = ", " if display_mode == "comma" else "\n"
            for name in player_list:
                if char_count + len(name) + len(separator) > 900:  # Leave room for truncation message
                    truncated_list.append(f"... and {len(player_list) - len(truncated_list)} more")
                    break
                truncated_list.append(name)
                char_count += len(name) + len(separator)
            display_text = separator.join(truncated_list)

        return display_text

    @slash_command(
        name="start-draft",
        description="Start a team drafting session"
    )
    @slash_option(
        name="team_size",
        description="Number of players per team (default: 4)",
        required=False,
        opt_type=OptionType.INTEGER
    )
    @slash_option(
        name="mode",
        description="Draft mode: standard or pairs (default: standard)",
        required=False,
        opt_type=OptionType.STRING,
        choices=[
            interactions.SlashCommandChoice(name="Standard", value="standard"),
            interactions.SlashCommandChoice(name="Pairs (Tournament 4v4)", value="pairs")
        ]
    )
    @slash_option(
        name="test_mode",
        description="Enable test mode (allows simulating multiple players)",
        required=False,
        opt_type=OptionType.BOOLEAN
    )
    async def start_draft(self, ctx: interactions.SlashContext, team_size: int = 4, mode: str = "standard", test_mode: bool = False) -> None:
        """Start a new team drafting session.

        Creates an interactive draft session where players can join/leave
        using buttons. Only one draft can be active per guild at a time.

        Args:
            ctx: The slash command context.
            team_size: Number of players per team (2-10, default 4).
        """
        if team_size < 2 or team_size > 10:
            await ctx.send("❌ Team size must be between 2 and 10 players.")
            return

        guild_id = ctx.guild.id

        if guild_id in self.active_drafts:
            await ctx.send("❌ There's already an active draft in this server. Use `/cancel-draft` to cancel it first.")
            return

        self.active_drafts[guild_id] = {
            "players": [],
            "pairs": [],  # List of confirmed pairs [user_id1, user_id2] (only for pairs mode)
            "pending_invites": {},  # {inviter_id: invitee_id} (only for pairs mode)
            "team_size": team_size,
            "mode": mode,
            "channel_id": ctx.channel.id,
            "organizer_id": ctx.author.id,
            "message_id": None,
            "test_mode": test_mode,
            "bot_players": []  # List of fake player IDs for test mode
        }
        join_button = Button(
            custom_id=f"draft_join_{guild_id}",
            style=ButtonStyle.GREEN,
            label="Join Draft",
            emoji="⚔️"
        )
        leave_button = Button(
            custom_id=f"draft_leave_{guild_id}",
            style=ButtonStyle.RED,
            label="Leave Draft",
            emoji="🚪"
        )
        find_partner_button = Button(
            custom_id=f"draft_find_partner_{guild_id}",
            style=ButtonStyle.BLUE,
            label="Find Partner",
            emoji="👥"
        )
        refresh_button = Button(
            custom_id=f"draft_refresh_{guild_id}",
            style=ButtonStyle.GRAY,
            label="Refresh",
            emoji="🔄"
        )

        if mode == "pairs":
            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Format:** Pairs Mode\n**Pairs Formed:** 0"
                    "\n\nClick **Join Draft** to join, then use **Find Partner** to pair up!"
                    "\n\n*Two pairs will be randomly combined to form 4-player teams.*"
                ),
                color=global_config.theme_colour
            )
            embed.set_footer(text=f"Organized by {ctx.author.display_name}")
            message = await ctx.send(embed=embed, components=[join_button, leave_button, find_partner_button, refresh_button])
        else:
            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Team Size:** {team_size} players per team\n**Players Joined:** 0"
                    "\n\nClick the buttons below to join or leave the draft!"
                ),
                color=global_config.theme_colour
            )
            embed.set_footer(text=f"Organized by {ctx.author.display_name}")
            message = await ctx.send(embed=embed, components=[join_button, leave_button, refresh_button])

        # Store message ID and save to database
        self.active_drafts[guild_id]["message_id"] = message.id
        await self._save_draft_to_db(guild_id, self.active_drafts[guild_id])

    @slash_command(
        name="draft-add-bots",
        description="[TEST MODE] Add bot players to test the draft"
    )
    @slash_option(
        name="count",
        description="Number of bot players to add (default: 4)",
        required=False,
        opt_type=OptionType.INTEGER
    )
    async def draft_add_bots(self, ctx: interactions.SlashContext, count: int = 4) -> None:
        """Add bot players for testing purposes."""
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to add bots to.", ephemeral=True)
            return

        draft = self.active_drafts[guild_id]

        if not draft.get("test_mode"):
            await ctx.send("❌ Test mode is not enabled for this draft.", ephemeral=True)
            return

        # Only allow organizer or specific user to add bots
        if ctx.author.id != draft["organizer_id"] and ctx.author.id != 339866237922181121:
            await ctx.send("❌ Only the organizer can add bot players.", ephemeral=True)
            return

        # Generate fake player IDs (use negative IDs to avoid conflicts)
        new_bots = []
        for i in range(count):
            bot_id = -(len(draft["bot_players"]) + i + 1)
            draft["players"].append(bot_id)
            draft["bot_players"].append(bot_id)
            new_bots.append(bot_id)

        await self._save_draft_to_db(guild_id, draft)
        await ctx.send(f"✅ Added {count} bot players to the draft!", ephemeral=True)

        # Update the draft embed
        try:
            await self._update_draft_embed_by_guild_id(guild_id)
        except Exception as e:
            logger.error(f"Error updating draft embed: {e}")

    @slash_command(
        name="draft-pair-bots",
        description="[TEST MODE] Automatically pair up bot players"
    )
    async def draft_pair_bots(self, ctx: interactions.SlashContext) -> None:
        """Automatically pair bot players for testing."""
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to pair bots in.", ephemeral=True)
            return

        draft = self.active_drafts[guild_id]

        if not draft.get("test_mode"):
            await ctx.send("❌ Test mode is not enabled for this draft.", ephemeral=True)
            return

        # Only allow organizer or specific user to pair bots
        if ctx.author.id != draft["organizer_id"] and ctx.author.id != 339866237922181121:
            await ctx.send("❌ Only the organizer can pair bot players.", ephemeral=True)
            return

        # Get unpaired bot players
        paired_players = set()
        for pair in draft["pairs"]:
            if isinstance(pair, dict):
                paired_players.update(pair["players"])
            else:
                paired_players.update(pair)

        unpaired_bots = [p for p in draft["bot_players"] if p not in paired_players]

        if len(unpaired_bots) < 2:
            await ctx.send("❌ Not enough unpaired bots to create pairs.", ephemeral=True)
            return

        # Pair them up
        pairs_created = 0
        for i in range(0, len(unpaired_bots) - 1, 2):
            draft["pairs"].append([unpaired_bots[i], unpaired_bots[i + 1]])
            pairs_created += 1

        await self._save_draft_to_db(guild_id, draft)
        await ctx.send(f"✅ Created {pairs_created} bot pairs!", ephemeral=True)

        # Update the draft embed
        try:
            await self._update_draft_embed_by_guild_id(guild_id)
        except Exception as e:
            logger.error(f"Error updating draft embed: {e}")

    async def _update_draft_embed_by_guild_id(self, guild_id: int) -> None:
        """Update draft embed by guild ID."""
        # Always fetch fresh data from database
        fresh_draft = await self._load_draft_from_db(guild_id)

        if not fresh_draft:
            return

        # Update in-memory cache with fresh data
        self.active_drafts[guild_id] = fresh_draft

        guild = await self.bot.fetch_guild(guild_id)
        await self._update_draft_embed(guild, guild_id, fresh_draft)

    @slash_command(
        name="set-notification-channel",
        description="Set a channel for draft partner invite notifications (instead of DMs)"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="channel",
        description="Channel to send notifications to (leave empty to use DMs)",
        required=False,
        opt_type=OptionType.CHANNEL
    )
    async def set_notification_channel(self, ctx: interactions.SlashContext, channel: Optional[interactions.GuildChannel] = None) -> None:
        """Set notification channel for partner invites.

        Args:
            ctx: The slash command context.
            channel: Channel to send notifications to, or None to use DMs.
        """
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to set notification channel for.")
            return

        draft = self.active_drafts[guild_id]

        if draft.get("mode") != "pairs":
            await ctx.send("❌ Notification channel is only available in pairs mode.")
            return

        if channel:
            draft["notification_channel_id"] = channel.id
            await self._save_draft_to_db(guild_id, draft)
            await ctx.send(f"✅ Partner invite notifications will be sent to {channel.mention}.")
        else:
            draft["notification_channel_id"] = None
            await self._save_draft_to_db(guild_id, draft)
            await ctx.send("✅ Partner invite notifications will be sent via DMs.")

    @slash_command(
        name="reset-invites",
        description="Reset pending partner invites in the current draft"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="player",
        description="Reset outgoing invites from a specific player (optional)",
        required=False,
        opt_type=OptionType.USER
    )
    async def reset_invites(self, ctx: interactions.SlashContext, player: Optional[interactions.Member] = None) -> None:
        """Reset pending partner invites in the current draft.

        Can reset all pending invites or just outgoing invites from a specific player.

        Args:
            ctx: The slash command context.
            player: Optional specific player whose outgoing invites to reset.
        """
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to reset invites for.")
            return

        draft = self.active_drafts[guild_id]

        if draft.get("mode") != "pairs":
            await ctx.send("❌ Invite system is only available in pairs mode.")
            return

        pending_invites = draft.get("pending_invites", {})

        if not pending_invites:
            await ctx.send("❌ No pending invites to reset.")
            return

        if player:
            # Reset outgoing invite from specific player (player is the inviter)
            player_id = player.id
            if player_id in pending_invites:
                del pending_invites[player_id]
                await self._save_draft_to_db(guild_id, draft)
                await ctx.send(f"✅ Reset outgoing invite from {player.mention}.")
            else:
                await ctx.send(f"❌ {player.mention} has no outgoing invites.")
        else:
            # Reset all pending invites
            count = len(pending_invites)
            draft["pending_invites"] = {}
            await self._save_draft_to_db(guild_id, draft)
            await ctx.send(f"✅ Reset {count} pending invite(s).")

    @slash_command(
        name="show-teams",
        description="Display the most recently confirmed teams"
    )
    async def show_teams(self, ctx: interactions.SlashContext) -> None:
        """Display the most recently confirmed teams for this guild.

        Retrieves and displays the last confirmed team composition from the database
        in a formatted embed, perfect for announcements.

        Args:
            ctx: The slash command context.
        """
        guild_id = ctx.guild.id

        try:
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute("""
                    SELECT teams, voice_category_id, created_at
                    FROM confirmed_teams
                    WHERE guild_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (guild_id,))
                row = await cur.fetchone()

                if not row:
                    await ctx.send("❌ No confirmed teams found for this server.")
                    return

                teams = json.loads(row["teams"]) if isinstance(row["teams"], str) else row["teams"]
                created_at = row["created_at"]

                embed = Embed(
                    title="🏆 Current Teams",
                    description=f"Most recent team composition (created <t:{int(created_at.timestamp())}:R>):",
                    color=global_config.theme_colour
                )

                for team in teams:
                    player_mentions = []
                    for player_id in team["players"]:
                        if player_id < 0:  # Bot player
                            player_mentions.append(f"Bot {abs(player_id)}")
                        else:
                            try:
                                member = await ctx.guild.fetch_member(player_id)
                                player_mentions.append(member.mention)
                            except Exception:
                                player_mentions.append(f"<@{player_id}>")

                    embed.add_field(
                        name=f"⚔️ {team['name']}",
                        value="\n".join(player_mentions),
                        inline=True
                    )

                await ctx.send(embed=embed)

        except Exception as e:
            logger.error(f"Error retrieving confirmed teams: {e}")
            await ctx.send("❌ Error retrieving teams from database.")

    @slash_command(
        name="add-team-role",
        description="Add a role to all participants in the most recent teams"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="role",
        description="The role to add to team participants",
        required=True,
        opt_type=OptionType.ROLE
    )
    async def add_team_role(self, ctx: interactions.SlashContext, role: interactions.Role) -> None:
        """Add a role to all participants in the most recent confirmed teams.

        Args:
            ctx: The slash command context.
            role: The role to add to all team participants.
        """
        guild_id = ctx.guild.id
        await ctx.defer()

        try:
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute("""
                    SELECT teams
                    FROM confirmed_teams
                    WHERE guild_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (guild_id,))
                row = await cur.fetchone()

                if not row:
                    await ctx.send("❌ No confirmed teams found for this server.")
                    return

                teams = json.loads(row["teams"]) if isinstance(row["teams"], str) else row["teams"]

                # Collect all player IDs from all teams
                player_ids = []
                for team in teams:
                    for player_id in team["players"]:
                        if player_id > 0:  # Skip bot players
                            player_ids.append(player_id)

                if not player_ids:
                    await ctx.send("❌ No real players found in the teams (only bots).")
                    return

                # Add role to each player
                success_count = 0
                fail_count = 0
                for player_id in player_ids:
                    try:
                        member = await ctx.guild.fetch_member(player_id)
                        await member.add_role(role)
                        success_count += 1
                    except Exception as e:
                        logger.warning(f"Could not add role to player {player_id}: {e}")
                        fail_count += 1

                # Send summary
                if fail_count == 0:
                    await ctx.send(f"✅ Successfully added {role.mention} to all {success_count} team participants!")
                else:
                    await ctx.send(f"⚠️ Added {role.mention} to {success_count} participants. Failed for {fail_count} members.")

        except Exception as e:
            logger.error(f"Error adding team role: {e}")
            await ctx.send("❌ Error adding role to team participants.")

    @slash_command(
        name="remove-team-role",
        description="Remove a role from all participants in the most recent teams"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="role",
        description="The role to remove from team participants",
        required=True,
        opt_type=OptionType.ROLE
    )
    async def remove_team_role(self, ctx: interactions.SlashContext, role: interactions.Role) -> None:
        """Remove a role from all participants in the most recent confirmed teams.

        Args:
            ctx: The slash command context.
            role: The role to remove from all team participants.
        """
        guild_id = ctx.guild.id
        await ctx.defer()

        try:
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute("""
                    SELECT teams
                    FROM confirmed_teams
                    WHERE guild_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (guild_id,))
                row = await cur.fetchone()

                if not row:
                    await ctx.send("❌ No confirmed teams found for this server.")
                    return

                teams = json.loads(row["teams"]) if isinstance(row["teams"], str) else row["teams"]

                # Collect all player IDs from all teams
                player_ids = []
                for team in teams:
                    for player_id in team["players"]:
                        if player_id > 0:  # Skip bot players
                            player_ids.append(player_id)

                if not player_ids:
                    await ctx.send("❌ No real players found in the teams (only bots).")
                    return

                # Remove role from each player
                success_count = 0
                fail_count = 0
                for player_id in player_ids:
                    try:
                        member = await ctx.guild.fetch_member(player_id)
                        await member.remove_role(role)
                        success_count += 1
                    except Exception as e:
                        logger.warning(f"Could not remove role from player {player_id}: {e}")
                        fail_count += 1

                # Send summary
                if fail_count == 0:
                    await ctx.send(f"✅ Successfully removed {role.mention} from all {success_count} team participants!")
                else:
                    await ctx.send(f"⚠️ Removed {role.mention} from {success_count} participants. Failed for {fail_count} members.")

        except Exception as e:
            logger.error(f"Error removing team role: {e}")
            await ctx.send("❌ Error removing role from team participants.")

    @slash_command(
        name="cancel-draft",
        description="Cancel the current team drafting session"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    async def cancel_draft(self, ctx: interactions.SlashContext) -> None:
        """Cancel the current draft session.

        Removes the active draft for the current guild. Requires administrator
        permissions.

        Args:
            ctx: The slash command context.
        """
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to cancel.")
            return

        del self.active_drafts[guild_id]
        await self._delete_draft_from_db(guild_id)

        await ctx.send("✅ Draft session cancelled.")

    @slash_command(
        name="show-current-draft",
        description="Re-display the current draft with interactive buttons"
    )
    async def show_current_draft(self, ctx: interactions.SlashContext) -> None:
        """Re-display the current draft session with all buttons.

        Posts a new message with the current draft state and interactive buttons
        for joining, leaving, and finding partners.

        Args:
            ctx: The slash command context.
        """
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to display.", ephemeral=True)
            return

        draft = self.active_drafts[guild_id]

        if draft.get("mode") == "pairs":
            # Get solo players for pairs mode
            paired_players = set()
            for pair in draft["pairs"]:
                if isinstance(pair, dict):
                    paired_players.update(pair["players"])
                else:
                    paired_players.update(pair)
            solo_players = [p for p in draft["players"] if p not in paired_players]

            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Format:** Pairs Mode\n"
                    f"**Pairs Formed:** {len(draft['pairs'])}\n"
                    f"**Solo Players:** {len(solo_players)}"
                    "\n\nClick **Join Draft** then **Find Partner** to pair up!"
                ),
                color=global_config.theme_colour
            )
        else:
            # Standard mode
            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Team Size:** {draft['team_size']} players per team\n"
                    f"**Players Joined:** {len(draft['players'])}"
                    "\n\nClick the buttons below to join or leave the draft!"
                ),
                color=global_config.theme_colour
            )

        if draft.get("mode") == "pairs" and draft["pairs"]:
            pairs_text = []
            for i, pair in enumerate(draft["pairs"], 1):
                try:
                    # Handle both old list format and new dict format
                    if isinstance(pair, dict):
                        player_ids = pair["players"]
                    else:
                        player_ids = pair

                    # Handle bot players
                    if player_ids[0] < 0:
                        member1_text = f"Bot {abs(player_ids[0])}"
                    else:
                        member1 = await ctx.guild.fetch_member(player_ids[0])
                        member1_text = member1.mention

                    if player_ids[1] < 0:
                        member2_text = f"Bot {abs(player_ids[1])}"
                    else:
                        member2 = await ctx.guild.fetch_member(player_ids[1])
                        member2_text = member2.mention

                    pairs_text.append(f"**Pair {i}:** {member1_text} & {member2_text}")
                except Exception as e:
                    logger.warning(f"Error fetching members for pair: {e}")
                    if isinstance(pair, dict):
                        player_ids = pair["players"]
                    else:
                        player_ids = pair
                    pairs_text.append(f"**Pair {i}:** <@{player_ids[0]}> & <@{player_ids[1]}>")

            embed.add_field(
                name="👥 Confirmed Pairs",
                value="\n".join(pairs_text),
                inline=False
            )

        if draft.get("mode") == "pairs":
            if solo_players:
                solo_text = await self._format_solo_players(ctx.guild, solo_players, "comma")

                embed.add_field(
                    name="👤 Solo Players (looking for partners)",
                    value=solo_text,
                    inline=False
                )
        else:
            # Standard mode - show all players
            if draft["players"]:
                players_text = await self._format_solo_players(ctx.guild, draft["players"], "comma")

                embed.add_field(
                    name="📋 Current Players",
                    value=players_text,
                    inline=False
                )

        organizer = ctx.guild.get_member(draft['organizer_id'])
        organizer_name = organizer.display_name if organizer else 'Unknown'
        embed.set_footer(text=f"Organized by {organizer_name}")

        join_button = Button(
            custom_id=f"draft_join_{guild_id}",
            style=ButtonStyle.GREEN,
            label="Join Draft",
            emoji="⚔️"
        )
        leave_button = Button(
            custom_id=f"draft_leave_{guild_id}",
            style=ButtonStyle.RED,
            label="Leave Draft",
            emoji="🚪"
        )
        find_partner_button = Button(
            custom_id=f"draft_find_partner_{guild_id}",
            style=ButtonStyle.BLUE,
            label="Find Partner",
            emoji="👥"
        )
        refresh_button = Button(
            custom_id=f"draft_refresh_{guild_id}",
            style=ButtonStyle.GRAY,
            label="Refresh",
            emoji="🔄"
        )
        toggle_display_button = Button(
            custom_id=f"draft_toggle_display_{guild_id}_{ctx.author.id}_comma",
            style=ButtonStyle.GRAY,
            label="Toggle Display",
            emoji="📋"
        )

        if draft.get("mode") == "pairs":
            await ctx.send(embed=embed, components=[join_button, leave_button, find_partner_button, toggle_display_button, refresh_button])
        else:
            await ctx.send(embed=embed, components=[join_button, leave_button, toggle_display_button, refresh_button])

    @slash_command(
        name="make-teams",
        description="Create teams from current draft participants"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="voice_category",
        description="Category to create voice channels in (optional)",
        required=False,
        opt_type=OptionType.CHANNEL
    )
    async def make_teams(self, ctx: interactions.SlashContext,
                         voice_category: Optional[interactions.GuildChannel] = None) -> None:
        """Create balanced teams from draft participants.

        Shuffles participants and creates full teams of the specified size.
        Shows teams with reroll and confirm buttons.

        Args:
            ctx: The slash command context.
            voice_category: Optional category to create team voice channels in.
        """
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to make teams from.")
            return

        draft = self.active_drafts[guild_id]

        # PAIRS MODE - Combine 2 pairs to make 4-player teams
        if draft.get("mode") == "pairs":
            pairs = draft["pairs"]

            # Need at least 2 pairs to form a team
            if len(pairs) < 2:
                await ctx.send(
                    f"❌ Not enough pairs to form teams. Need at least 2 pairs (currently have {len(pairs)}).")
                return

            await ctx.defer(ephemeral=False)

            # Store original pairs data for rerolling
            teams_data = {
                "mode": "pairs",
                "pairs": pairs.copy(),
                "voice_category_id": voice_category.id if voice_category and voice_category.type == interactions.ChannelType.GUILD_CATEGORY else None,
                "guild_id": guild_id
            }

        # STANDARD MODE
        else:
            players = draft["players"]
            team_size = draft["team_size"]

            if len(players) < team_size * 2:
                await ctx.send(
                    f"❌ Not enough players for teams. Need at least {team_size * 2} players (currently have {len(players)}).")
                return

            await ctx.defer(ephemeral=False)

            # Store original data for rerolling
            teams_data = {
                "mode": "standard",
                "players": players.copy(),
                "team_size": team_size,
                "voice_category_id": voice_category.id if voice_category and voice_category.type == interactions.ChannelType.GUILD_CATEGORY else None,
                "guild_id": guild_id
            }

        # Generate teams and send with buttons
        await self._generate_and_send_teams(ctx, teams_data, is_initial=True)

    async def _generate_and_send_teams(self, ctx: interactions.ComponentContext, teams_data: Dict[str, Any], is_initial: bool = False) -> None:
        """Generate teams and send them with reroll/confirm buttons.

        Args:
            ctx: The interaction context.
            teams_data: Data needed to generate teams.
            is_initial: Whether this is the initial team generation.
        """
        guild_id = teams_data["guild_id"]
        teams: list[Dict[str, Any]] = []
        used_names: set[str] = set()

        # Generate teams based on mode
        if teams_data["mode"] == "pairs":
            pairs = teams_data["pairs"].copy()
            random.shuffle(pairs)

            # Combine 2 pairs to make 4-player teams
            for i in range(0, len(pairs), 2):
                if i + 1 < len(pairs):
                    pair1 = pairs[i]
                    pair2 = pairs[i + 1]

                    if isinstance(pair1, dict):
                        team_players = pair1["players"] + pair2["players"]
                    else:
                        team_players = pair1 + pair2

                    team_name = self._generate_unique_team_name(used_names)
                    used_names.add(team_name)
                    teams.append({
                        "name": team_name,
                        "players": team_players
                    })

            leftover_pairs = pairs[len(teams) * 2:]
        else:
            players = teams_data["players"].copy()
            team_size = teams_data["team_size"]
            random.shuffle(players)

            for i in range(0, len(players), team_size):
                team_players = players[i:i + team_size]
                if len(team_players) == team_size:
                    team_name = self._generate_unique_team_name(used_names)
                    used_names.add(team_name)
                    teams.append({
                        "name": team_name,
                        "players": team_players
                    })

            leftover_players = players[len(teams) * team_size:]

        if not teams:
            await ctx.send("❌ Unable to create any full teams.")
            return

        try:
            embed = Embed(
                title="🏆 Teams Preview",
                description=f"Here are the proposed teams ({len(teams)} teams). Click **Reroll** to shuffle again or **Confirm** to finalize!",
                color=global_config.theme_colour
            )

            for i, team in enumerate(teams):
                player_mentions = []
                for player_id in team["players"]:
                    if player_id < 0:
                        player_mentions.append(f"Bot {abs(player_id)}")
                    else:
                        try:
                            member = await ctx.guild.fetch_member(player_id)
                            player_mentions.append(member.mention)
                        except Exception:
                            player_mentions.append(f"<@{player_id}>")
                embed.add_field(
                    name=f"⚔️ {team['name']}",
                    value="\n".join(player_mentions),
                    inline=True
                )

            # Handle leftovers
            if teams_data["mode"] == "pairs" and leftover_pairs:
                leftover_mentions = []
                for pair in leftover_pairs:
                    if isinstance(pair, dict):
                        player_ids = pair["players"]
                    else:
                        player_ids = pair

                    if player_ids[0] < 0:
                        member1_text = f"Bot {abs(player_ids[0])}"
                    else:
                        try:
                            member1 = await ctx.guild.fetch_member(player_ids[0])
                            member1_text = member1.mention
                        except Exception:
                            member1_text = f"<@{player_ids[0]}>"

                    if player_ids[1] < 0:
                        member2_text = f"Bot {abs(player_ids[1])}"
                    else:
                        try:
                            member2 = await ctx.guild.fetch_member(player_ids[1])
                            member2_text = member2.mention
                        except Exception:
                            member2_text = f"<@{player_ids[1]}>"

                    leftover_mentions.append(f"{member1_text} & {member2_text}")

                embed.add_field(
                    name="🔄 Leftover pairs",
                    value="\n".join(leftover_mentions),
                    inline=True
                )
            elif teams_data["mode"] == "standard" and leftover_players:
                leftover_mentions = []
                for player_id in leftover_players:
                    if player_id < 0:
                        leftover_mentions.append(f"Bot {abs(player_id)}")
                    else:
                        try:
                            member = await ctx.guild.fetch_member(player_id)
                            leftover_mentions.append(member.mention)
                        except Exception:
                            leftover_mentions.append(f"<@{player_id}>")

                embed.add_field(
                    name="🔄 The rejects",
                    value="\n".join(leftover_mentions),
                    inline=True
                )

            # Create buttons with teams data encoded
            teams_data_json = json.dumps(teams_data)

            reroll_button = Button(
                custom_id=f"teams_reroll_{guild_id}_{hash(teams_data_json) % 1000000}",
                style=ButtonStyle.BLUE,
                label="Reroll Teams",
                emoji="🎲"
            )

            confirm_button = Button(
                custom_id=f"teams_confirm_{guild_id}_{hash(teams_data_json) % 1000000}",
                style=ButtonStyle.GREEN,
                label="Confirm & Create Voice Channels" if teams_data["voice_category_id"] else "Confirm Teams",
                emoji="✅"
            )

            # Store teams_data temporarily for button handlers
            if not hasattr(self, 'pending_teams'):
                self.pending_teams = {}
            self.pending_teams[guild_id] = teams_data

            if is_initial:
                await ctx.send(embed=embed, components=[reroll_button, confirm_button])
            else:
                await ctx.edit_origin(embed=embed, components=[reroll_button, confirm_button])
                await ctx.send("🎲 Teams rerolled!", ephemeral=True)

        except Exception as e:
            logger.error(f"Error creating teams preview: {e}")
            await ctx.send("❌ Error generating teams preview.")

    async def _confirm_teams(self, ctx: interactions.ComponentContext, guild_id: int) -> None:
        """Confirm teams and create voice channels if specified.

        Args:
            ctx: The component context.
            guild_id: The guild ID.
        """
        if not hasattr(self, 'pending_teams') or guild_id not in self.pending_teams:
            await ctx.send("❌ No pending teams to confirm.", ephemeral=True)
            return

        await ctx.defer(ephemeral=False)

        teams_data = self.pending_teams[guild_id]
        teams: list[Dict[str, Any]] = []
        used_names: set[str] = set()

        # Regenerate the same teams one more time (using the same seed would be better but this works)
        # Actually, let's extract the teams from the current embed to preserve the exact order
        embed = ctx.message.embeds[0]

        # Parse teams from embed fields
        for field in embed.fields:
            if field.name.startswith("⚔️"):
                team_name = field.name.replace("⚔️ ", "")
                player_mentions = field.value.split("\n")
                player_ids = []

                for mention in player_mentions:
                    if mention.startswith("Bot "):
                        bot_num = int(mention.replace("Bot ", ""))
                        player_ids.append(-bot_num)
                    elif "<@" in mention and ">" in mention:
                        # Extract user ID from mention
                        user_id = int(mention.replace("<@", "").replace(">", ""))
                        player_ids.append(user_id)

                teams.append({
                    "name": team_name,
                    "players": player_ids
                })

        # Create voice channels if category was specified
        voice_channels: list[interactions.GuildChannel] = []
        voice_category = None

        if teams_data["voice_category_id"]:
            try:
                voice_category = await self.bot.fetch_channel(teams_data["voice_category_id"])

                for team in teams:
                    voice_channel = await ctx.guild.create_voice_channel(
                        name=f"🎯 {team['name']}",
                        category=voice_category
                    )
                    voice_channels.append(voice_channel)

                    # Move players to their team voice channel
                    for player_id in team["players"]:
                        if player_id < 0:  # Skip bot players
                            continue
                        try:
                            member = await ctx.guild.fetch_member(player_id)
                            if member.voice and member.voice.channel:
                                await member.move_to(voice_channel)
                        except Exception as e:
                            logger.warning(f"Could not move player {player_id} to voice channel: {e}")
            except Exception as e:
                logger.error(f"Error creating voice channels: {e}")

        # Save teams to database
        try:
            async with DBContextManager() as cur:
                await cur.execute("""
                    INSERT INTO confirmed_teams (guild_id, channel_id, teams, voice_category_id)
                    VALUES (%s, %s, %s, %s)
                """, (
                    guild_id,
                    ctx.channel.id,
                    json.dumps(teams),
                    teams_data.get("voice_category_id")
                ))
        except Exception as e:
            logger.error(f"Failed to save confirmed teams to database: {e}")

        # Update embed to confirmed status
        try:
            confirmed_embed = Embed(
                title="🏆 Teams Confirmed!",
                description=f"Teams have been finalized! ({len(teams)} teams)",
                color=global_config.theme_colour
            )

            for field in embed.fields:
                confirmed_embed.add_field(
                    name=field.name,
                    value=field.value,
                    inline=field.inline
                )

            if voice_channels:
                confirmed_embed.set_footer(text=f"Voice channels created in {voice_category.name}")

            await ctx.edit_origin(embed=confirmed_embed, components=[])
            await ctx.send("✅ Teams confirmed!" + (f" Voice channels created!" if voice_channels else ""), ephemeral=False)

        except Exception as e:
            logger.error(f"Error confirming teams: {e}")
            await ctx.send("⚠️ Teams confirmed but couldn't update the message.", ephemeral=True)

        # Clear the draft and pending teams
        if guild_id in self.active_drafts:
            del self.active_drafts[guild_id]
            await self._delete_draft_from_db(guild_id)

        if guild_id in self.pending_teams:
            del self.pending_teams[guild_id]

    async def _handle_find_partner(self, ctx: interactions.ComponentContext) -> None:
        """Handle Find Partner button click."""
        parts = ctx.custom_id.split("_")
        guild_id = int(parts[3])
        user_id = ctx.author.id

        # Always fetch fresh data from database
        fresh_draft = await self._load_draft_from_db(guild_id)

        if not fresh_draft:
            await ctx.send("❌ This draft is no longer active.", ephemeral=True)
            return

        # Update in-memory cache with fresh data
        self.active_drafts[guild_id] = fresh_draft
        draft = fresh_draft

        # Check if user is in the draft
        if user_id not in draft["players"]:
            await ctx.send("❌ You need to join the draft first!", ephemeral=True)
            return

        # Check if user is already in a pair
        user_in_pair = any(
            user_id in (pair["players"] if isinstance(pair, dict) else pair)
            for pair in draft["pairs"]
        )
        if user_in_pair:
            await ctx.send("❌ You're already paired up!", ephemeral=True)
            return

        # Check if user has a pending invite
        if user_id in draft.get("pending_invites", {}):
            await ctx.send("❌ You already have a pending partner request!", ephemeral=True)
            return

        # Get available players (not in pairs, not pending invites)
        paired_players = set()
        for pair in draft["pairs"]:
            if isinstance(pair, dict):
                paired_players.update(pair["players"])
            else:
                paired_players.update(pair)

        # Handle both old and new pending_invites format
        pending_players = set()
        for inviter, invite_data in draft.get("pending_invites", {}).items():
            pending_players.add(inviter)
            if isinstance(invite_data, dict):
                pending_players.add(invite_data.get("partner_id"))
            else:
                pending_players.add(invite_data)

        available_players = [
            p for p in draft["players"]
            if p != user_id
            and p not in paired_players
            and p not in pending_players
        ]

        if not available_players:
            await ctx.send("❌ No available players to pair with right now. Wait for more players to join!", ephemeral=True)
            return

        # Create select menu with available players
        options = []
        for player_id in available_players[:25]:  # Discord limit
            try:
                member = await ctx.guild.fetch_member(player_id)
                options.append(StringSelectOption(
                    label=member.display_name[:100],
                    value=str(player_id),
                    description=f"Partner with {member.display_name[:50]}"
                ))
            except Exception:
                options.append(StringSelectOption(
                    label=f"Player {player_id}",
                    value=str(player_id)
                ))

        select_menu = StringSelectMenu(
            *options,
            custom_id=f"draft_select_partner_{guild_id}_{user_id}",
            placeholder="Select your partner..."
        )

        await ctx.send("Select a partner to draft with:", components=[select_menu], ephemeral=True)

    async def _handle_partner_selection(self, ctx: interactions.ComponentContext) -> None:
        """Handle partner selection from dropdown menu."""
        parts = ctx.custom_id.split("_")
        guild_id = int(parts[3])
        inviter_id = int(parts[4])

        # Defer the interaction immediately to prevent timeout
        await ctx.defer(ephemeral=True)

        # Always fetch fresh data from database
        fresh_draft = await self._load_draft_from_db(guild_id)

        if not fresh_draft:
            await ctx.send("❌ This draft is no longer active.", ephemeral=True)
            return

        # Update in-memory cache with fresh data
        self.active_drafts[guild_id] = fresh_draft
        draft = fresh_draft
        partner_id = int(ctx.values[0])

        # Store pending invite
        draft["pending_invites"][inviter_id] = partner_id
        await self._save_draft_to_db(guild_id, draft)

        # Send acceptance request to partner
        accept_button = Button(
            custom_id=f"draft_accept_{guild_id}_{inviter_id}_{partner_id}",
            style=ButtonStyle.GREEN,
            label="Accept",
            emoji="✅"
        )
        reject_button = Button(
            custom_id=f"draft_reject_{guild_id}_{inviter_id}_{partner_id}",
            style=ButtonStyle.RED,
            label="Reject",
            emoji="❌"
        )

        try:
            inviter = await ctx.guild.fetch_member(inviter_id)
            partner = await ctx.guild.fetch_member(partner_id)

            notification_channel_id = draft.get("notification_channel_id")

            # Try DM first, then fallback to notification channel or draft channel
            dm_sent = False
            try:
                await partner.send(
                    f"**{inviter.display_name}** wants to pair with you for the draft in **{ctx.guild.name}**!",
                    components=[accept_button, reject_button]
                )
                dm_sent = True
                await ctx.send(f"✅ Partner request sent to {partner.display_name} via DM!", ephemeral=True)
            except Exception as e:
                logger.warning(f"Could not DM partner: {e}")

            # If DM failed, fallback to notification channel or draft channel
            if not dm_sent:
                if notification_channel_id:
                    try:
                        notification_channel = await self.bot.fetch_channel(notification_channel_id)
                        await notification_channel.send(
                            f"{partner.mention} **{inviter.display_name}** wants to pair with you for the draft!",
                            components=[accept_button, reject_button]
                        )
                        await ctx.send(f"✅ Partner request sent to {partner.display_name} in {notification_channel.mention}!", ephemeral=True)
                    except Exception as e:
                        logger.error(f"Could not send to notification channel: {e}")
                        await ctx.send("❌ Failed to send partner request.", ephemeral=True)
                else:
                    # Fallback to draft channel if no notification channel is set
                    try:
                        channel = await self.bot.fetch_channel(draft["channel_id"])
                        await channel.send(
                            f"{partner.mention} **{inviter.display_name}** wants to pair with you! Please enable DMs to receive partner requests, or contact them directly.",
                            components=[accept_button, reject_button],
                            delete_after=30
                        )
                        await ctx.send(
                            f"⚠️ Could not DM {partner.display_name}. They have been notified in the channel.",
                            ephemeral=True
                        )
                    except Exception as fallback_error:
                        logger.error(f"Could not send fallback message: {fallback_error}")
                        await ctx.send(
                            f"❌ {partner.display_name} has DMs disabled. Please contact them directly.",
                            ephemeral=True
                        )
        except Exception as e:
            logger.error(f"Error sending partner request: {e}")
            await ctx.send("❌ Failed to send partner request.", ephemeral=True)

    async def _handle_partner_response(self, ctx: interactions.ComponentContext) -> None:
        """Handle partner acceptance or rejection."""
        parts = ctx.custom_id.split("_")
        action = parts[1]  # "accept" or "reject"
        guild_id = int(parts[2])
        inviter_id = int(parts[3])
        partner_id = int(parts[4])

        if ctx.author.id != partner_id:
            await ctx.send("❌ This request is not for you!", ephemeral=True)
            return

        # Always fetch fresh data from database
        fresh_draft = await self._load_draft_from_db(guild_id)

        if not fresh_draft:
            await ctx.send("❌ This draft is no longer active.", ephemeral=True)
            return

        # Update in-memory cache with fresh data
        self.active_drafts[guild_id] = fresh_draft
        draft = fresh_draft

        # Verify invite is still pending (handle both old and new format, and string/int keys from JSON)
        pending_invites = draft.get("pending_invites", {})
        pending_invite = pending_invites.get(inviter_id) or pending_invites.get(str(inviter_id))
        if pending_invite is None:
            await ctx.send("❌ This invite has already been processed or cancelled.", ephemeral=True)
            return

        if isinstance(pending_invite, dict):
            expected_partner = pending_invite.get("partner_id")
        else:
            expected_partner = pending_invite

        if expected_partner != partner_id:
            await ctx.send("❌ This invite no longer matches. The inviter may have sent a new request.", ephemeral=True)
            return

        if action == "accept":
            # Add both players and create pair
            if inviter_id not in draft["players"]:
                draft["players"].append(inviter_id)
            if partner_id not in draft["players"]:
                draft["players"].append(partner_id)

            draft["pairs"].append([inviter_id, partner_id])
            # Remove pending invite (handle both int and string keys from JSON)
            if inviter_id in draft["pending_invites"]:
                del draft["pending_invites"][inviter_id]
            elif str(inviter_id) in draft["pending_invites"]:
                del draft["pending_invites"][str(inviter_id)]
            await self._save_draft_to_db(guild_id, draft)

            try:
                guild = await self.bot.fetch_guild(guild_id)
                inviter = await guild.fetch_member(inviter_id)
                partner = await guild.fetch_member(partner_id)

                # Disable the buttons by editing the message
                try:
                    await ctx.message.edit(components=[])
                except Exception as e:
                    logger.warning(f"Could not edit message to remove buttons: {e}")

                await ctx.send(f"✅ You've paired up with **{inviter.display_name}**!", ephemeral=True)

                # Notify inviter
                notification_channel_id = draft.get("notification_channel_id")
                if notification_channel_id:
                    # Send to notification channel
                    try:
                        notification_channel = await self.bot.fetch_channel(notification_channel_id)
                        await notification_channel.send(
                            f"{inviter.mention} ✅ **{partner.display_name}** accepted your partner request!"
                        )
                    except Exception as e:
                        logger.error(f"Could not send to notification channel: {e}")
                else:
                    # Try DM first
                    try:
                        await inviter.send(f"✅ **{partner.display_name}** accepted your partner request!")
                    except Exception as e:
                        logger.warning(f"Could not DM inviter about acceptance: {e}")
                        # Fallback to channel notification that deletes after 30 seconds
                        try:
                            channel = await self.bot.fetch_channel(draft["channel_id"])
                            await channel.send(
                                f"{inviter.mention} ✅ **{partner.display_name}** accepted your partner request!",
                                delete_after=30
                            )
                        except Exception as fallback_error:
                            logger.error(f"Could not send fallback notification: {fallback_error}")

                # Update the draft embed
                await self._update_draft_embed(guild, guild_id, draft)
            except Exception as e:
                logger.error(f"Error confirming pair: {e}")

        elif action == "reject":
            # Remove pending invite (handle both int and string keys from JSON)
            if inviter_id in draft["pending_invites"]:
                del draft["pending_invites"][inviter_id]
            elif str(inviter_id) in draft["pending_invites"]:
                del draft["pending_invites"][str(inviter_id)]
            await self._save_draft_to_db(guild_id, draft)

            try:
                guild = await self.bot.fetch_guild(guild_id)
                inviter = await guild.fetch_member(inviter_id)
                partner = await guild.fetch_member(partner_id)

                # Disable the buttons by editing the message
                try:
                    await ctx.message.edit(components=[])
                except Exception as e:
                    logger.warning(f"Could not edit message to remove buttons: {e}")

                await ctx.send("❌ Partner request rejected.", ephemeral=True)

                # Notify inviter
                notification_channel_id = draft.get("notification_channel_id")
                if notification_channel_id:
                    # Send to notification channel
                    try:
                        notification_channel = await self.bot.fetch_channel(notification_channel_id)
                        await notification_channel.send(
                            f"{inviter.mention} ❌ **{partner.display_name}** rejected your partner request."
                        )
                    except Exception as e:
                        logger.error(f"Could not send to notification channel: {e}")
                else:
                    # Try DM first
                    try:
                        await inviter.send(f"❌ **{partner.display_name}** rejected your partner request.")
                    except Exception as e:
                        logger.warning(f"Could not DM inviter about rejection: {e}")
                        # Fallback to channel notification that deletes after 30 seconds
                        try:
                            channel = await self.bot.fetch_channel(draft["channel_id"])
                            await channel.send(
                                f"{inviter.mention} ❌ **{partner.display_name}** rejected your partner request.",
                                delete_after=30
                            )
                        except Exception as fallback_error:
                            logger.error(f"Could not send fallback notification: {fallback_error}")
            except Exception as e:
                logger.error(f"Error rejecting pair: {e}")

    async def _handle_refresh(self, ctx: interactions.ComponentContext) -> None:
        """Handle refresh button click."""
        parts = ctx.custom_id.split("_")
        guild_id = int(parts[2])

        # Always fetch fresh data from database
        fresh_draft = await self._load_draft_from_db(guild_id)

        if not fresh_draft:
            await ctx.send("❌ This draft is no longer active.", ephemeral=True)
            return

        # Update in-memory cache with fresh data
        self.active_drafts[guild_id] = fresh_draft

        # Try to extract the toggle button info from existing message
        toggle_user_id = ctx.author.id  # Default to current user
        toggle_mode = "comma"
        try:
            if ctx.message and ctx.message.components:
                for action_row in ctx.message.components:
                    for component in action_row.components:
                        if hasattr(component, 'custom_id') and component.custom_id and component.custom_id.startswith("draft_toggle_display_"):
                            toggle_parts = component.custom_id.split("_")
                            toggle_user_id = int(toggle_parts[4])
                            toggle_mode = toggle_parts[5]
                            break
        except Exception as e:
            logger.warning(f"Could not extract toggle button info: {e}")
            # Keep default to the user who clicked refresh
            toggle_user_id = ctx.author.id

        # Get solo players
        paired_players = set()
        for pair in fresh_draft["pairs"]:
            if isinstance(pair, dict):
                paired_players.update(pair["players"])
            else:
                paired_players.update(pair)
        solo_players = [p for p in fresh_draft["players"] if p not in paired_players]

        # Build the embed based on mode
        if fresh_draft.get("mode") == "pairs":
            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Format:** Pairs Mode\n"
                    f"**Pairs Formed:** {len(fresh_draft['pairs'])}\n"
                    f"**Solo Players:** {len(solo_players)}"
                    "\n\nClick **Join Draft** then **Find Partner** to pair up!"
                ),
                color=global_config.theme_colour
            )

            if fresh_draft["pairs"]:
                pairs_text = []
                for i, pair in enumerate(fresh_draft["pairs"], 1):
                    try:
                        if isinstance(pair, dict):
                            player_ids = pair["players"]
                        else:
                            player_ids = pair

                        if player_ids[0] < 0:
                            member1_text = f"Bot {abs(player_ids[0])}"
                        else:
                            member1 = await ctx.guild.fetch_member(player_ids[0])
                            member1_text = member1.mention

                        if player_ids[1] < 0:
                            member2_text = f"Bot {abs(player_ids[1])}"
                        else:
                            member2 = await ctx.guild.fetch_member(player_ids[1])
                            member2_text = member2.mention

                        pairs_text.append(f"**Pair {i}:** {member1_text} & {member2_text}")
                    except Exception as e:
                        logger.warning(f"Error fetching members for pair: {e}")
                        if isinstance(pair, dict):
                            player_ids = pair["players"]
                        else:
                            player_ids = pair
                        pairs_text.append(f"**Pair {i}:** <@{player_ids[0]}> & <@{player_ids[1]}>")

                embed.add_field(
                    name="👥 Confirmed Pairs",
                    value="\n".join(pairs_text),
                    inline=False
                )

            if solo_players:
                solo_text = await self._format_solo_players(ctx.guild, solo_players, toggle_mode)

                embed.add_field(
                    name="👤 Solo Players (looking for partners)",
                    value=solo_text,
                    inline=False
                )
        else:
            # Standard mode
            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Team Size:** {fresh_draft['team_size']} players per team\n"
                    f"**Players Joined:** {len(fresh_draft['players'])}"
                    "\n\nClick the buttons below to join or leave the draft!"
                ),
                color=global_config.theme_colour
            )

            if fresh_draft["players"]:
                players_text = await self._format_solo_players(ctx.guild, fresh_draft["players"], toggle_mode)

                embed.add_field(
                    name="📋 Current Players",
                    value=players_text,
                    inline=False
                )

        organizer = ctx.guild.get_member(fresh_draft['organizer_id'])
        organizer_name = organizer.display_name if organizer else 'Unknown'
        embed.set_footer(text=f"Organized by {organizer_name}")

        # Create buttons
        join_button = Button(
            custom_id=f"draft_join_{guild_id}",
            style=ButtonStyle.GREEN,
            label="Join Draft",
            emoji="⚔️"
        )
        leave_button = Button(
            custom_id=f"draft_leave_{guild_id}",
            style=ButtonStyle.RED,
            label="Leave Draft",
            emoji="🚪"
        )
        refresh_button = Button(
            custom_id=f"draft_refresh_{guild_id}",
            style=ButtonStyle.GRAY,
            label="Refresh",
            emoji="🔄"
        )
        toggle_display_button = Button(
            custom_id=f"draft_toggle_display_{guild_id}_{toggle_user_id}_{toggle_mode}",
            style=ButtonStyle.GRAY,
            label="Toggle Display",
            emoji="📋"
        )

        if fresh_draft.get("mode") == "pairs":
            find_partner_button = Button(
                custom_id=f"draft_find_partner_{guild_id}",
                style=ButtonStyle.BLUE,
                label="Find Partner",
                emoji="👥"
            )
            await ctx.edit_origin(embed=embed, components=[join_button, leave_button, find_partner_button, toggle_display_button, refresh_button])
        else:
            await ctx.edit_origin(embed=embed, components=[join_button, leave_button, toggle_display_button, refresh_button])

        await ctx.send("🔄 Draft refreshed with latest information!", ephemeral=True)

    async def _handle_toggle_display(self, ctx: interactions.ComponentContext) -> None:
        """Handle toggle display button click - updates public message with toggled view."""
        parts = ctx.custom_id.split("_")
        guild_id = int(parts[3])
        allowed_user_id = int(parts[4])
        current_mode = parts[5]

        # Check if the user clicking is the one who created the message
        if ctx.author.id != allowed_user_id:
            await ctx.send("❌ Only the user who ran the command can toggle the display.", ephemeral=True)
            return

        # Always fetch fresh data from database
        fresh_draft = await self._load_draft_from_db(guild_id)

        if not fresh_draft:
            await ctx.send("❌ This draft is no longer active.", ephemeral=True)
            return

        # Update in-memory cache with fresh data
        self.active_drafts[guild_id] = fresh_draft

        # Toggle the display mode
        new_mode = "newlines" if current_mode == "comma" else "comma"

        # Build embed based on mode
        if fresh_draft.get("mode") == "pairs":
            paired_players = set()
            for pair in fresh_draft["pairs"]:
                if isinstance(pair, dict):
                    paired_players.update(pair["players"])
                else:
                    paired_players.update(pair)
            solo_players = [p for p in fresh_draft["players"] if p not in paired_players]

            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Format:** Pairs Mode\n"
                    f"**Pairs Formed:** {len(fresh_draft['pairs'])}\n"
                    f"**Solo Players:** {len(solo_players)}"
                    "\n\nClick **Join Draft** then **Find Partner** to pair up!"
                ),
                color=global_config.theme_colour
            )

            if fresh_draft["pairs"]:
                pairs_text = []
                for i, pair in enumerate(fresh_draft["pairs"], 1):
                    try:
                        if isinstance(pair, dict):
                            player_ids = pair["players"]
                        else:
                            player_ids = pair

                        if player_ids[0] < 0:
                            member1_text = f"Bot {abs(player_ids[0])}"
                        else:
                            member1 = await ctx.guild.fetch_member(player_ids[0])
                            member1_text = member1.mention

                        if player_ids[1] < 0:
                            member2_text = f"Bot {abs(player_ids[1])}"
                        else:
                            member2 = await ctx.guild.fetch_member(player_ids[1])
                            member2_text = member2.mention

                        pairs_text.append(f"**Pair {i}:** {member1_text} & {member2_text}")
                    except Exception as e:
                        logger.warning(f"Error fetching members for pair: {e}")
                        if isinstance(pair, dict):
                            player_ids = pair["players"]
                        else:
                            player_ids = pair
                        pairs_text.append(f"**Pair {i}:** <@{player_ids[0]}> & <@{player_ids[1]}>")

                embed.add_field(
                    name="👥 Confirmed Pairs",
                    value="\n".join(pairs_text),
                    inline=False
                )

            if solo_players:
                solo_text = await self._format_solo_players(ctx.guild, solo_players, new_mode)
                embed.add_field(
                    name="👤 Solo Players (looking for partners)",
                    value=solo_text,
                    inline=False
                )
        else:
            # Standard mode
            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Team Size:** {fresh_draft['team_size']} players per team\n"
                    f"**Players Joined:** {len(fresh_draft['players'])}"
                    "\n\nClick the buttons below to join or leave the draft!"
                ),
                color=global_config.theme_colour
            )

            if fresh_draft["players"]:
                players_text = await self._format_solo_players(ctx.guild, fresh_draft["players"], new_mode)
                embed.add_field(
                    name="📋 Current Players",
                    value=players_text,
                    inline=False
                )

        organizer = ctx.guild.get_member(fresh_draft['organizer_id'])
        organizer_name = organizer.display_name if organizer else 'Unknown'
        embed.set_footer(text=f"Organized by {organizer_name}")

        # Create buttons with new display mode
        join_button = Button(
            custom_id=f"draft_join_{guild_id}",
            style=ButtonStyle.GREEN,
            label="Join Draft",
            emoji="⚔️"
        )
        leave_button = Button(
            custom_id=f"draft_leave_{guild_id}",
            style=ButtonStyle.RED,
            label="Leave Draft",
            emoji="🚪"
        )
        refresh_button = Button(
            custom_id=f"draft_refresh_{guild_id}",
            style=ButtonStyle.GRAY,
            label="Refresh",
            emoji="🔄"
        )
        toggle_display_button = Button(
            custom_id=f"draft_toggle_display_{guild_id}_{allowed_user_id}_{new_mode}",
            style=ButtonStyle.GRAY,
            label="Toggle Display",
            emoji="📋"
        )

        if fresh_draft.get("mode") == "pairs":
            find_partner_button = Button(
                custom_id=f"draft_find_partner_{guild_id}",
                style=ButtonStyle.BLUE,
                label="Find Partner",
                emoji="👥"
            )
            await ctx.edit_origin(embed=embed, components=[join_button, leave_button, find_partner_button, toggle_display_button, refresh_button])
        else:
            await ctx.edit_origin(embed=embed, components=[join_button, leave_button, toggle_display_button, refresh_button])

    async def _update_draft_embed(self, guild: interactions.Guild, guild_id: int, draft: Dict[str, Any]) -> None:
        """Update the draft embed to show current players and pairs."""
        try:
            # Always fetch fresh data from database
            fresh_draft = await self._load_draft_from_db(guild_id)

            if not fresh_draft:
                logger.warning(f"Draft {guild_id} no longer exists in database")
                return

            # Update in-memory cache and use fresh data
            self.active_drafts[guild_id] = fresh_draft
            draft = fresh_draft

            channel = await guild.fetch_channel(draft["channel_id"])

            # Build embed based on mode
            if draft.get("mode") == "pairs":
                # Get solo players
                paired_players = set()
                for pair in draft["pairs"]:
                    if isinstance(pair, dict):
                        paired_players.update(pair["players"])
                    else:
                        paired_players.update(pair)
                solo_players = [p for p in draft["players"] if p not in paired_players]

                embed = Embed(
                    title="🎯 Team Draft Started!",
                    description=(
                        f"**Format:** Pairs Mode\n"
                        f"**Pairs Formed:** {len(draft['pairs'])}\n"
                        f"**Solo Players:** {len(solo_players)}"
                        "\n\nClick **Join Draft** then **Find Partner** to pair up!"
                    ),
                    color=global_config.theme_colour
                )

                if draft["pairs"]:
                    pairs_text = []
                    for i, pair in enumerate(draft["pairs"], 1):
                        try:
                            # Handle both old list format and new dict format
                            if isinstance(pair, dict):
                                player_ids = pair["players"]
                            else:
                                player_ids = pair

                            # Handle bot players
                            if player_ids[0] < 0:
                                member1_text = f"Bot {abs(player_ids[0])}"
                            else:
                                member1 = await guild.fetch_member(player_ids[0])
                                member1_text = member1.mention

                            if player_ids[1] < 0:
                                member2_text = f"Bot {abs(player_ids[1])}"
                            else:
                                member2 = await guild.fetch_member(player_ids[1])
                                member2_text = member2.mention

                            pairs_text.append(f"**Pair {i}:** {member1_text} & {member2_text}")
                        except Exception as e:
                            logger.warning(f"Error fetching members for pair: {e}")
                            if isinstance(pair, dict):
                                player_ids = pair["players"]
                            else:
                                player_ids = pair
                            pairs_text.append(f"**Pair {i}:** <@{player_ids[0]}> & <@{player_ids[1]}>")

                    embed.add_field(
                        name="👥 Confirmed Pairs",
                        value="\n".join(pairs_text),
                        inline=False
                    )

                if solo_players:
                    solo_text = []
                    for player_id in solo_players:
                        if player_id < 0:  # Bot player
                            solo_text.append(f"Bot {abs(player_id)}")
                        else:
                            try:
                                member = await guild.fetch_member(player_id)
                                solo_text.append(member.mention)
                            except Exception:
                                solo_text.append(f"<@{player_id}>")

                    embed.add_field(
                        name="👤 Solo Players (looking for partners)",
                        value=", ".join(solo_text),
                        inline=False
                    )
            else:
                # Standard mode
                embed = Embed(
                    title="🎯 Team Draft Started!",
                    description=(
                        f"**Team Size:** {draft['team_size']} players per team\n"
                        f"**Players Joined:** {len(draft['players'])}"
                        "\n\nClick the buttons below to join or leave the draft!"
                    ),
                    color=global_config.theme_colour
                )

                if draft["players"]:
                    players_text = []
                    for player_id in draft["players"]:
                        if player_id < 0:  # Bot player
                            players_text.append(f"Bot {abs(player_id)}")
                        else:
                            try:
                                member = await guild.fetch_member(player_id)
                                players_text.append(member.mention)
                            except Exception:
                                players_text.append(f"<@{player_id}>")

                    embed.add_field(
                        name="Players",
                        value=", ".join(players_text),
                        inline=False
                    )

            organizer = guild.get_member(draft['organizer_id'])
            organizer_name = organizer.display_name if organizer else 'Unknown'
            embed.set_footer(text=f"Organized by {organizer_name}")

            join_button = Button(
                custom_id=f"draft_join_{guild_id}",
                style=ButtonStyle.GREEN,
                label="Join Draft",
                emoji="⚔️"
            )
            leave_button = Button(
                custom_id=f"draft_leave_{guild_id}",
                style=ButtonStyle.RED,
                label="Leave Draft",
                emoji="🚪"
            )
            refresh_button = Button(
                custom_id=f"draft_refresh_{guild_id}",
                style=ButtonStyle.GRAY,
                label="Refresh",
                emoji="🔄"
            )

            # Find and edit the original message (this is a simplified version)
            # In production, you'd want to store the message ID
            async for message in channel.history(limit=50):
                if message.author.id == self.bot.user.id and message.embeds:
                    if "Team Draft Started!" in message.embeds[0].title:
                        if draft.get("mode") == "pairs":
                            find_partner_button = Button(
                                custom_id=f"draft_find_partner_{guild_id}",
                                style=ButtonStyle.BLUE,
                                label="Find Partner",
                                emoji="👥"
                            )
                            await message.edit(embed=embed, components=[join_button, leave_button, find_partner_button, refresh_button])
                        else:
                            await message.edit(embed=embed, components=[join_button, leave_button, refresh_button])
                        break
        except Exception as e:
            logger.error(f"Error updating draft embed: {e}")

    @listen(Startup)
    async def on_startup(self) -> None:
        """Load all active drafts from database on bot startup."""
        await self._load_all_drafts()
        logger.info("Drafting extension loaded and ready")

    @listen(ComponentEvent)
    async def on_component(self, event: ComponentEvent) -> None:
        """Handle button interactions for draft join/leave.

        Processes join and leave button clicks, updates the draft participant
        list, and refreshes the embed display.

        Args:
            event: The component interaction event.
        """
        ctx = event.ctx

        # Handle team reroll button
        if ctx.custom_id.startswith("teams_reroll_"):
            parts = ctx.custom_id.split("_")
            guild_id = int(parts[2])

            if not hasattr(self, 'pending_teams') or guild_id not in self.pending_teams:
                await ctx.send("❌ No pending teams to reroll.", ephemeral=True)
                return

            teams_data = self.pending_teams[guild_id]
            await self._generate_and_send_teams(ctx, teams_data, is_initial=False)
            return

        # Handle team confirm button
        if ctx.custom_id.startswith("teams_confirm_"):
            parts = ctx.custom_id.split("_")
            guild_id = int(parts[2])
            await self._confirm_teams(ctx, guild_id)
            return

        if not ctx.custom_id.startswith("draft_"):
            return

        # Handle partner selection
        if ctx.custom_id.startswith("draft_select_partner_"):
            await self._handle_partner_selection(ctx)
            return

        # Handle partner acceptance/rejection
        if ctx.custom_id.startswith("draft_accept_") or ctx.custom_id.startswith("draft_reject_"):
            await self._handle_partner_response(ctx)
            return

        # Handle find partner button
        if ctx.custom_id.startswith("draft_find_partner_"):
            await self._handle_find_partner(ctx)
            return

        # Handle refresh button
        if ctx.custom_id.startswith("draft_refresh_"):
            await self._handle_refresh(ctx)
            return

        # Handle toggle display button
        if ctx.custom_id.startswith("draft_toggle_display_"):
            await self._handle_toggle_display(ctx)
            return

        parts = ctx.custom_id.split("_")
        if len(parts) != 3:
            return

        action = parts[1]  # "join" or "leave"
        guild_id = int(parts[2])

        # Always fetch fresh data from database before any operation
        fresh_draft = await self._load_draft_from_db(guild_id)

        if not fresh_draft:
            await ctx.send("❌ This draft is no longer active.", ephemeral=True)
            return

        # Update in-memory cache with fresh data
        self.active_drafts[guild_id] = fresh_draft
        draft = fresh_draft
        user_id = ctx.author.id

        # Extract toggle button info from existing message
        toggle_user_id = ctx.author.id  # Default to current user
        toggle_mode = "comma"
        try:
            if ctx.message and ctx.message.components:
                for action_row in ctx.message.components:
                    for component in action_row.components:
                        if hasattr(component, 'custom_id') and component.custom_id and component.custom_id.startswith("draft_toggle_display_"):
                            toggle_parts = component.custom_id.split("_")
                            toggle_user_id = int(toggle_parts[4])
                            toggle_mode = toggle_parts[5]
                            break
        except Exception as e:
            logger.warning(f"Could not extract toggle button info: {e}")
            # Keep default to the user who is interacting
            toggle_user_id = ctx.author.id

        if action == "join":
            # PAIRS MODE - Just add as solo player
            if draft.get("mode") == "pairs":
                # Check if user is already in a pair
                user_in_pair = any(
                    user_id in (pair["players"] if isinstance(pair, dict) else pair)
                    for pair in draft["pairs"]
                )
                if user_in_pair:
                    await ctx.send("❌ You're already paired up!", ephemeral=True)
                    return

                # Check if already in players list
                if user_id in draft["players"]:
                    await ctx.send("❌ You're already in the draft!", ephemeral=True)
                    return

                # Add user to players
                draft["players"].append(user_id)

            # STANDARD MODE
            else:
                if user_id in draft["players"]:
                    await ctx.send("❌ You're already in the draft!", ephemeral=True)
                    return

                draft["players"].append(user_id)

            # Save to database after join
            await self._save_draft_to_db(guild_id, draft)

        elif action == "leave":
            if user_id not in draft["players"]:
                await ctx.send("❌ You're not in the draft!", ephemeral=True)
                return

            # Remove from players
            draft["players"].remove(user_id)

            # PAIRS MODE - also remove from pairs and pending invites
            if draft.get("mode") == "pairs":
                # Remove from any pair (handle both old and new format)
                draft["pairs"] = [
                    pair for pair in draft["pairs"]
                    if user_id not in (pair["players"] if isinstance(pair, dict) else pair)
                ]

                # Remove any pending invites (handle both old and new format)
                if user_id in draft.get("pending_invites", {}):
                    del draft["pending_invites"][user_id]

                # Remove if they are the invitee in any pending invite
                to_remove = []
                for inviter, invite_data in draft.get("pending_invites", {}).items():
                    if isinstance(invite_data, dict):
                        if invite_data.get("partner_id") == user_id:
                            to_remove.append(inviter)
                    elif invite_data == user_id:
                        to_remove.append(inviter)

                for inviter in to_remove:
                    del draft["pending_invites"][inviter]

            # Save to database after leave
            await self._save_draft_to_db(guild_id, draft)

        try:
            # PAIRS MODE - Use different embed layout
            if draft.get("mode") == "pairs":
                # Get solo players
                paired_players = set()
                for pair in draft["pairs"]:
                    if isinstance(pair, dict):
                        paired_players.update(pair["players"])
                    else:
                        paired_players.update(pair)
                solo_players = [p for p in draft["players"] if p not in paired_players]

                embed = Embed(
                    title="🎯 Team Draft Started!",
                    description=(
                        f"**Format:** Pairs Mode\n"
                        f"**Pairs Formed:** {len(draft['pairs'])}\n"
                        f"**Solo Players:** {len(solo_players)}"
                        "\n\nClick **Join Draft** then **Find Partner** to pair up!"
                    ),
                    color=global_config.theme_colour
                )

                if draft["pairs"]:
                    pairs_text = []
                    for i, pair in enumerate(draft["pairs"], 1):
                        try:
                            # Handle both old list format and new dict format
                            if isinstance(pair, dict):
                                player_ids = pair["players"]
                            else:
                                player_ids = pair

                            # Handle bot players
                            if player_ids[0] < 0:
                                member1_text = f"Bot {abs(player_ids[0])}"
                            else:
                                member1 = await ctx.guild.fetch_member(player_ids[0])
                                member1_text = member1.mention

                            if player_ids[1] < 0:
                                member2_text = f"Bot {abs(player_ids[1])}"
                            else:
                                member2 = await ctx.guild.fetch_member(player_ids[1])
                                member2_text = member2.mention

                            pairs_text.append(f"**Pair {i}:** {member1_text} & {member2_text}")
                        except Exception as e:
                            logger.warning(f"Error fetching members for pair in embed: {e}")
                            if isinstance(pair, dict):
                                player_ids = pair["players"]
                            else:
                                player_ids = pair
                            pairs_text.append(f"**Pair {i}:** <@{player_ids[0]}> & <@{player_ids[1]}>")

                    embed.add_field(
                        name="👥 Confirmed Pairs",
                        value="\n".join(pairs_text),
                        inline=False
                    )

                if solo_players:
                    solo_text = await self._format_solo_players(ctx.guild, solo_players, toggle_mode)

                    embed.add_field(
                        name="👤 Solo Players (looking for partners)",
                        value=solo_text,
                        inline=False
                    )

            # STANDARD MODE - Use original embed layout
            else:
                embed = Embed(
                    title="🎯 Team Draft Started!",
                    description=(
                        f"**Team Size:** {draft['team_size']} players per team\n"
                        f"**Players Joined:** {len(draft['players'])}"
                        "\n\nClick the buttons below to join or leave the draft!"
                    ),
                    color=global_config.theme_colour
                )

                if draft["players"]:
                    players_text = await self._format_solo_players(ctx.guild, draft["players"], toggle_mode)

                    embed.add_field(
                        name="📋 Current Players",
                        value=players_text,
                        inline=False
                    )

            organizer = ctx.guild.get_member(draft['organizer_id'])
            organizer_name = organizer.display_name if organizer else 'Unknown'
            embed.set_footer(text=f"Organized by {organizer_name}")

            # Keep the same buttons
            join_button = Button(
                custom_id=f"draft_join_{guild_id}",
                style=ButtonStyle.GREEN,
                label="Join Draft",
                emoji="⚔️"
            )

            leave_button = Button(
                custom_id=f"draft_leave_{guild_id}",
                style=ButtonStyle.RED,
                label="Leave Draft",
                emoji="🚪"
            )

            # Add Find Partner button for pairs mode
            refresh_button = Button(
                custom_id=f"draft_refresh_{guild_id}",
                style=ButtonStyle.GRAY,
                label="Refresh",
                emoji="🔄"
            )
            toggle_display_button = Button(
                custom_id=f"draft_toggle_display_{guild_id}_{toggle_user_id}_{toggle_mode}",
                style=ButtonStyle.GRAY,
                label="Toggle Display",
                emoji="📋"
            )
            if draft.get("mode") == "pairs":
                find_partner_button = Button(
                    custom_id=f"draft_find_partner_{guild_id}",
                    style=ButtonStyle.BLUE,
                    label="Find Partner",
                    emoji="👥"
                )
                await ctx.edit_origin(embed=embed, components=[join_button, leave_button, find_partner_button, toggle_display_button, refresh_button])
            else:
                await ctx.edit_origin(embed=embed, components=[join_button, leave_button, toggle_display_button, refresh_button])

            if action == "join":
                await ctx.send("✅ You've joined the draft!", ephemeral=True)
            elif action == "leave":
                await ctx.send("✅ You've left the draft!", ephemeral=True)

        except Exception as e:
            logger.error(f"Error updating draft message: {e}")
            try:
                await ctx.send(
                    f"⚠️ Draft updated but couldn't refresh the message. Current players: {len(draft['players'])}",
                    ephemeral=True
                )
            except Exception:
                pass


def setup(bot: interactions.Client) -> None:
    """Set up the Drafting extension for the bot.

    Args:
        bot: The Discord bot client instance.
    """
    DraftingExt(bot)
