"""Developer tools and utility commands for the Discord bot.

Provides debugging, monitoring, and administrative functionality
for bot maintenance and error handling.
"""
import logging
import traceback
import uuid
from typing import Optional

import interactions
from interactions import slash_command, slash_option, slash_default_member_permission, OptionType, Permissions
from interactions.api.events import CommandError, CommandCompletion, Startup, MemberAdd
from backend.util import global_config
from version import __version__

logger = logging.getLogger("OCE-4Mans")


class DevTools(interactions.Extension):
    """Developer tools extension.

    Provides administrative and debugging commands for bot maintenance,
    error logging, and system monitoring.

    Attributes:
        bot: The Discord bot client instance.
        error_log_channel: Channel for logging errors and exceptions.
    """

    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the developer tools extension.

        Args:
            bot: The Discord bot client instance.
        """
        self.bot = bot
        self.error_log_channel: Optional[interactions.GuildChannel] = None

    @slash_command(
        name="ping",
        description="Checks the ping.",
    )
    async def ping_command(self, ctx: interactions.SlashContext) -> None:
        """
        check the ping

        Parameters:
        - ctx: The context object representing the invocation of the command.

        Returns:
        - None
        """
        await ctx.send(f"Pong! :ping_pong: ({self.bot.latency}ms)")

    @slash_command(
        name="dev",
        description="Shows developer info",
    )
    async def dev_command(self, ctx: interactions.SlashContext) -> None:
        """
        Developer info
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        This command retrieves information about the bot developer and
        sends it as an embedded message.

        Example usage:
        /dev
        """
        sneaky = await self.bot.fetch_user(339866237922181121)
        embed = interactions.Embed(
            title="Bot Developer",
            description=f"**Sneakynarnar** ({sneaky.mention})",
            thumbnail=sneaky.avatar_url, color=0x5f0dd9
        )
        embed.add_field(
            name="Contact info",
            value=(
                "**Email**: sneakynarnar@gmail.com"
                "\nCheck out my [GitHub](https://github.com/Sneakynarnar)"
            )
        )
        await ctx.send(embeds=embed)

    @slash_command(
        name="website",
        description="Send a link to the website",
    )
    async def website_command(self, ctx: interactions.SlashContext) -> None:
        """
        Developer info
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        This command retrieves information about the bot developer and
        sends it as an embedded message.

        Example usage:
        /dev
        """
        await ctx.send("https://sneakyofficial.com/splatdle")

    @slash_command(
        name="splatdle-link",
        description="Send a link to splatdle",
    )
    async def splatdle_website_command(self, ctx: interactions.SlashContext) -> None:
        """
        Website command
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        This command retrieves information about the bot developer and
        sends it as an embedded message.

        Example usage:
        /splatdle-link
        """
        await ctx.send("https://sneakyofficial.com/splatdle")

    @slash_command(
        name="version",
        description="The version of the bot"
    )
    async def version_command(self, ctx: interactions.SlashContext) -> None:
        """
        Developer info
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        Version of the bot

        Example usage:
        /version
        """
        embed = interactions.Embed(
            title="Sneaky bot",
            description=f"Version: **{__version__}**",
            thumbnail=self.bot.user.avatar_url,
            color=0x5f0dd9
        )
        await ctx.send(embeds=embed)

    @interactions.listen(CommandError, disable_default_listeners=True)
    async def on_command_error(self, event: CommandError) -> None:
        """
        Handle errors that occur during command execution.

        Parameters:
        - event (CommandError): The error event object.

        Returns:
        - None

        Raises:
        - None
        """
        command = event.ctx.command

        error_traceback = ''.join(traceback.format_exception(
            type(event.error), event.error, event.error.__traceback__))
        logger.error("Error during command %s: %s", command.name, event.error)
        guid = str(uuid.uuid4())
        logger.error("Assigned error guid: %s", guid)
        logger.debug("Traceback: %s", error_traceback)
        try:
            error_embed = interactions.Embed(
                title="Command Error",
                description=(
                    "Unknown error occurred while executing this command. "
                    "Are you sure you typed it correctly? Contact an admin if the issue persists!"
                    f"\n\nError Code: **{guid}**"
                ),
                color=0xFF0000,
            )
            await event.ctx.reply(embeds=error_embed)
        except AttributeError:
            await event.ctx.send(
                "Unknown error doing this command. "
                "Are you sure you typed it right? Contact an admin if issue persists!"
            )
        error_embed = interactions.Embed(
            title="New error: (" + guid + ")",
            description=f"{event.error}\n```{error_traceback}```",
            color=0xFF0000,
        )
        await self.error_log_channel.send(embeds=error_embed)

    @interactions.listen(CommandCompletion)
    async def on_command_completion(self, event: CommandCompletion) -> None:
        """
        Log commands executed by members.

        Parameters:
        - event (CommandCompletion): The command completion event object.

        Returns:
        - None

        Raises:
        - None
        """
        logger.info("Command '%s' executed by %s (ID: %s)",
                    event.ctx.command.name, event.ctx.author.username, event.ctx.author_id)

    @slash_command(
        name="clear-category",
        description="Clear all channels from a category"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="category",
        description="The category to clear channels from",
        required=True,
        opt_type=OptionType.CHANNEL
    )
    async def clear_category(self, ctx: interactions.SlashContext, category: interactions.GuildChannel) -> None:
        """
        Clear all channels from a category

        Parameters:
        - ctx: The context of the command.
        - category: The category to clear channels from.

        Returns:
        - None

        Description:
        This command deletes all channels within a specified category.
        Requires administrator permissions.

        Example usage:
        /clear-category category:<category_name>
        """
        if category.type != interactions.ChannelType.GUILD_CATEGORY:
            await ctx.send("❌ Please select a valid category channel.", ephemeral=True)
            return

        await ctx.defer(ephemeral=False)

        # Get all channels in the category
        channels_to_delete = [
            channel for channel in ctx.guild.channels
            if hasattr(channel, 'parent_id') and channel.parent_id == category.id
        ]

        if not channels_to_delete:
            await ctx.send(f"❌ No channels found in category **{category.name}**.")
            return

        # Delete all channels
        deleted_count = 0
        failed_count = 0

        for channel in channels_to_delete:
            try:
                await channel.delete()
                deleted_count += 1
                logger.info(f"Deleted channel {channel.name} (ID: {channel.id}) from category {category.name}")
            except Exception as e:
                failed_count += 1
                logger.error(f"Failed to delete channel {channel.name}: {e}")

        # Send summary
        result_message = f"✅ Deleted **{deleted_count}** channel(s) from category **{category.name}**"
        if failed_count > 0:
            result_message += f"\n⚠️ Failed to delete **{failed_count}** channel(s)"

        await ctx.send(result_message)

    _WELCOME_GUILD   = 1019293451579293747
    _WELCOME_CHANNEL = 1019293452451725384

    _WELCOME_ROLE    = 1019293451600273538

    @interactions.listen(MemberAdd)
    async def on_member_join(self, event: MemberAdd) -> None:
        if int(event.guild_id) != self._WELCOME_GUILD:
            return
        member = event.member
        try:
            await member.add_role(self._WELCOME_ROLE, guild_id=self._WELCOME_GUILD)
        except Exception:
            logger.warning("Failed to assign narnarers role to %s", member.id)
        channel = self.bot.get_channel(self._WELCOME_CHANNEL)
        if channel is None:
            return
        await channel.send(
            f"Welcome to the server, {member.mention}! 🦑\n"
            f"Head over to the channels and introduce yourself. Hope you enjoy your stay!"
        )

    @interactions.listen(Startup)
    async def assign_channel(self) -> None:
        self.error_log_channel = self.bot.get_channel(
            global_config.error_log_channel)


def setup(bot: interactions.Client) -> None:
    """
    Set up the DevTools for the bot.

    Parameters:
    - bot: The bot instance.

    Returns:
    - None
    """
    DevTools(bot)
