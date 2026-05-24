"""Shared in-memory overlay/ribbon settings, mutated by the web API and read by the Twitch bot."""

_settings: dict = {
    "ribbon_mode": "active",
    "open_lobby_stage": None,
    "open_lobby_mode_id": None,
    "open_lobby_mode_name": None,
    "open_lobby_room_code": None,
    "weapon_pool_channel": "sneakyn",
}


def get() -> dict:
    return _settings


def update(data: dict) -> None:
    _settings.update(data)
