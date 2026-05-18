"""
Local web server for frontend review — no Discord bot, no database required.
Serves the built React app from src/frontend/dist on port 8080.
Also mounts /api/splatdle so the game works locally without the full backend.
Use main.py for the full production stack.
"""
import asyncio
import json
import os
import random
import logging
from datetime import datetime, timezone
from aiohttp import web
import aiohttp_cors

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger("serve")

BUILD_DIR = os.path.join(os.path.dirname(__file__), "src", "frontend", "dist")
RESOURCES_DIR = os.path.join(os.path.dirname(__file__), "src", "backend", "resources")
PORT = int(os.environ.get("PORT", 8080))


def _load_weapons() -> list:
    with open(os.path.join(RESOURCES_DIR, "weapons.json"), encoding="utf-8") as f:
        return json.load(f)["weapons"]


def _get_daily_weapon(weapons: list) -> dict:
    today = datetime.now(timezone.utc).date().isoformat()
    weapon_file = os.path.join(RESOURCES_DIR, "weapon.txt")
    try:
        with open(weapon_file, encoding="utf-8") as f:
            data = json.load(f)
        weapon_data = data.get("weapon")
        if data.get("date") == today and isinstance(weapon_data, dict):
            for w in weapons:
                if w["name"] == weapon_data["name"] and w["game"] == weapon_data["game"]:
                    return w
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass
    weapon = random.choice(weapons)
    try:
        with open(weapon_file, "w", encoding="utf-8") as f:
            json.dump({"weapon": {"name": weapon["name"], "game": weapon["game"]}, "date": today}, f)
    except OSError:
        pass
    return weapon


async def serve_splatdle_api(_request: web.Request) -> web.Response:
    try:
        weapons = _load_weapons()
        weapon = _get_daily_weapon(weapons)
        answer = f"{weapon['name']} ({weapon['game']})"
        return web.json_response({"weapons": weapons, "answer": answer})
    except Exception as exc:
        logger.error("Splatdle API error: %s", exc)
        return web.json_response({"weapons": [], "answer": ""}, status=500)


async def serve_index(request: web.Request) -> web.FileResponse:
    return web.FileResponse(os.path.join(BUILD_DIR, "index.html"))


async def serve_static(request: web.Request) -> web.FileResponse:
    filename = request.match_info["filename"]
    filepath = os.path.join(BUILD_DIR, filename)
    if os.path.isfile(filepath):
        return web.FileResponse(filepath)
    raise web.HTTPNotFound()


def build_app() -> web.Application:
    app = web.Application()
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
            allow_methods="*",
        )
    })

    assets_dir = os.path.join(BUILD_DIR, "assets")
    images_dir = os.path.join(BUILD_DIR, "images")

    if os.path.isdir(assets_dir):
        app.router.add_static("/assets", assets_dir)
    if os.path.isdir(images_dir):
        app.router.add_static("/images", images_dir)

    app.router.add_get("/api/splatdle", serve_splatdle_api)
    app.router.add_get(
        "/{filename:favicon\\.ico|.*\\.jpg|.*\\.png|.*\\.css|.*\\.js|.*\\.txt|.*\\.xml|.*\\.webp|.*\\.webmanifest}",
        serve_static,
    )
    app.router.add_get("/{tail:.*}", serve_index)

    for route in list(app.router.routes()):
        cors.add(route)

    return app


async def main() -> None:
    if not os.path.isdir(BUILD_DIR):
        logger.error("Build dir not found: %s — run `npm run build` in src/frontend first.", BUILD_DIR)
        return

    app = build_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info("Serving on http://0.0.0.0:%d  →  http://192.168.0.100:%d (phone)", PORT, PORT)
    logger.info("Ctrl+C to stop")
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
