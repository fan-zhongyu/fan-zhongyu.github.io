#!/usr/bin/env python3
"""Build the compact dataset used by The Geometry of a Treble.

The script downloads (or reuses cached) StatsBomb Open Data for Barcelona's
38 La Liga matches in 2014/15 and the 2015 Champions League final. It writes a
small, deterministic JSON file containing only the aggregates rendered by the
site; the original event files are deliberately excluded from the project.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


RAW_BASE = "https://raw.githubusercontent.com/hudl/open-data/master/data"
BARCELONA_ID = 217
BARCELONA_NAME = "Barcelona"
MSN_IDS = {4320, 5246, 5503}
SCHEMA_VERSION = "1.0.0"

MATCH_FEEDS = (
    ("la-liga-2014-15.json", f"{RAW_BASE}/matches/11/26.json", "league"),
    (
        "champions-league-2014-15.json",
        f"{RAW_BASE}/matches/16/26.json",
        "epilogue",
    ),
)

SET_PIECE_PATTERNS = {
    "From Corner",
    "From Free Kick",
    "From Goal Kick",
    "From Kick Off",
    "From Throw In",
}


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=project_root / ".cache" / "statsbomb",
        help="Directory for raw StatsBomb JSON downloads.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=project_root / "data" / "season.json",
        help="Compact JSON file to create.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Do not access the network; fail if a cache file is missing.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Replace existing cached source files.",
    )
    return parser.parse_args()


def fetch_json(url: str, path: Path, offline: bool, refresh: bool) -> Any:
    if path.exists() and not refresh:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)

    if offline:
        raise FileNotFoundError(f"Missing cached source file: {path}")

    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "geometry-of-a-treble-data-builder/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = response.read()
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not download {url}: {exc}") from exc

    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)

    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def rounded_location(value: Any) -> list[float] | None:
    if not isinstance(value, list) or len(value) < 2:
        return None
    try:
        # Shot end locations can sit fractionally inside the goal volume. The
        # site renders a flat 120 × 80 field, so keep visible paths on its plane.
        x = min(120.0, max(0.0, float(value[0])))
        y = min(80.0, max(0.0, float(value[1])))
        return [round(x, 1), round(y, 1)]
    except (TypeError, ValueError):
        return None


def endpoint(event: dict[str, Any]) -> list[float] | None:
    for key in ("pass", "carry", "shot", "goal_keeper"):
        detail = event.get(key)
        if isinstance(detail, dict):
            location = rounded_location(detail.get("end_location"))
            if location:
                return location
    return rounded_location(event.get("location"))


def event_time(event: dict[str, Any]) -> float:
    return round(float(event.get("minute", 0)) + float(event.get("second", 0)) / 60, 2)


def is_open_play_pass(event: dict[str, Any]) -> bool:
    if event.get("type", {}).get("name") != "Pass":
        return False
    if event.get("play_pattern", {}).get("name") in SET_PIECE_PATTERNS:
        return False
    pass_type = event.get("pass", {}).get("type", {}).get("name")
    return pass_type not in {"Corner", "Free Kick", "Goal Kick", "Kick Off", "Throw-in"}


def is_completed_pass(event: dict[str, Any]) -> bool:
    return is_open_play_pass(event) and not event.get("pass", {}).get("outcome")


def build_player_catalog(lineups: Iterable[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    catalog: dict[int, dict[str, Any]] = {}
    for lineup_file in lineups:
        for team in lineup_file:
            if team.get("team_id") != BARCELONA_ID and team.get("team_name") != BARCELONA_NAME:
                continue
            for player in team.get("lineup", []):
                player_id = int(player["player_id"])
                existing = catalog.setdefault(
                    player_id,
                    {
                        "id": player_id,
                        "name": player.get("player_name") or str(player_id),
                        "label": player.get("player_nickname")
                        or player.get("player_name")
                        or str(player_id),
                        "jersey": player.get("jersey_number"),
                        "msn": player_id in MSN_IDS,
                    },
                )
                if player.get("player_nickname"):
                    existing["label"] = player["player_nickname"]
                if existing.get("jersey") is None and player.get("jersey_number") is not None:
                    existing["jersey"] = player["jersey_number"]
    return catalog


def starting_lineup(events: list[dict[str, Any]]) -> tuple[str | None, set[int]]:
    for event in events:
        if (
            event.get("type", {}).get("name") == "Starting XI"
            and event.get("team", {}).get("id") == BARCELONA_ID
        ):
            tactics = event.get("tactics", {})
            player_ids = {
                int(item["player"]["id"])
                for item in tactics.get("lineup", [])
                if item.get("player", {}).get("id") is not None
            }
            formation = tactics.get("formation")
            return str(formation) if formation is not None else None, player_ids
    return None, set()


def add_path_point(points: list[list[float]], value: Any) -> None:
    point = rounded_location(value)
    if point and (not points or points[-1] != point):
        points.append(point)


def simplify_path(points: list[list[float]], max_points: int = 18) -> list[list[float]]:
    if len(points) <= max_points:
        return points
    last = len(points) - 1
    indices = sorted({round(i * last / (max_points - 1)) for i in range(max_points)})
    return [points[index] for index in indices]


def possession_flows(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        if event.get("possession_team", {}).get("id") == BARCELONA_ID:
            possession = event.get("possession")
            if isinstance(possession, int):
                grouped[possession].append(event)

    flows: list[dict[str, Any]] = []
    for possession, sequence in grouped.items():
        points: list[list[float]] = []
        actions = 0
        shot = False
        goal = False
        shot_xg = 0.0
        minute = None
        for event in sequence:
            if event.get("team", {}).get("id") != BARCELONA_ID:
                continue
            kind = event.get("type", {}).get("name")
            if kind not in {"Pass", "Carry", "Dribble", "Shot", "Ball Receipt*"}:
                continue
            location = rounded_location(event.get("location"))
            if not location:
                continue
            if minute is None:
                minute = event_time(event)
            add_path_point(points, location)
            if kind in {"Pass", "Carry", "Shot"}:
                add_path_point(points, endpoint(event))
                actions += 1
            if kind == "Shot":
                shot = True
                shot_detail = event.get("shot", {})
                shot_xg += float(shot_detail.get("statsbomb_xg") or 0)
                goal = goal or shot_detail.get("outcome", {}).get("name") == "Goal"

        if len(points) < 2 or actions < 2:
            continue
        max_x = max(point[0] for point in points)
        min_x = min(point[0] for point in points)
        if max_x < 80 and not shot:
            continue
        flows.append(
            {
                "id": possession,
                "minute": minute or 0,
                "path": simplify_path(points),
                "actions": actions,
                "maxX": round(max_x, 1),
                "span": round(max_x - min_x, 1),
                "shot": shot,
                "goal": goal,
                "xg": round(shot_xg, 3),
            }
        )

    flows.sort(
        key=lambda flow: (
            bool(flow["goal"]),
            bool(flow["shot"]),
            float(flow["maxX"]),
            int(flow["actions"]),
        ),
        reverse=True,
    )
    return flows[:42]


def aggregate_match(
    match: dict[str, Any],
    events: list[dict[str, Any]],
    catalog: dict[int, dict[str, Any]],
    phase: str,
) -> dict[str, Any]:
    home = match["home_team"]
    away = match["away_team"]
    is_home = home.get("home_team_id") == BARCELONA_ID
    opponent = away["away_team_name"] if is_home else home["home_team_name"]
    goals_for = int(match["home_score"] if is_home else match["away_score"])
    goals_against = int(match["away_score"] if is_home else match["home_score"])
    result = "W" if goals_for > goals_against else "D" if goals_for == goals_against else "L"
    formation, starters = starting_lineup(events)

    origin_sum: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    pass_count: dict[int, int] = defaultdict(int)
    receive_count: dict[int, int] = defaultdict(int)
    links: dict[tuple[int, int], int] = defaultdict(int)
    shots = 0
    xg = 0.0
    goals: list[dict[str, Any]] = []

    for event in events:
        if event.get("team", {}).get("id") != BARCELONA_ID:
            continue
        kind = event.get("type", {}).get("name")
        player = event.get("player") or {}
        player_id = player.get("id")

        if is_completed_pass(event) and player_id is not None:
            recipient = event.get("pass", {}).get("recipient") or {}
            recipient_id = recipient.get("id")
            location = rounded_location(event.get("location"))
            if location:
                stats = origin_sum[int(player_id)]
                stats[0] += location[0]
                stats[1] += location[1]
                stats[2] += 1
                pass_count[int(player_id)] += 1
            if recipient_id is not None:
                links[(int(player_id), int(recipient_id))] += 1
                receive_count[int(recipient_id)] += 1

        if kind == "Shot":
            shots += 1
            shot = event.get("shot", {})
            shot_xg = float(shot.get("statsbomb_xg") or 0)
            xg += shot_xg
            if shot.get("outcome", {}).get("name") == "Goal":
                goals.append(
                    {
                        "minute": int(event.get("minute", 0)),
                        "player": int(player_id) if player_id is not None else None,
                        "xg": round(shot_xg, 3),
                        "location": rounded_location(event.get("location")),
                    }
                )

    player_rows: list[dict[str, Any]] = []
    for player_id, totals in origin_sum.items():
        if totals[2] < 2:
            continue
        player = catalog.get(
            player_id,
            {
                "id": player_id,
                "name": str(player_id),
                "label": str(player_id),
                "jersey": None,
                "msn": player_id in MSN_IDS,
            },
        )
        player_rows.append(
            {
                "id": player_id,
                "x": round(totals[0] / totals[2], 1),
                "y": round(totals[1] / totals[2], 1),
                "passes": pass_count[player_id],
                "received": receive_count[player_id],
                "starter": player_id in starters,
                "label": player["label"],
                "jersey": player.get("jersey"),
                "msn": bool(player.get("msn")),
            }
        )
    player_rows.sort(key=lambda row: (-row["passes"], row["id"]))
    visible_ids = {row["id"] for row in player_rows}

    link_rows = [
        {"source": source, "target": target, "count": count}
        for (source, target), count in links.items()
        if source in visible_ids and target in visible_ids and count >= 2
    ]
    link_rows.sort(key=lambda row: (-row["count"], row["source"], row["target"]))

    competition = match.get("competition", {}).get("competition_name", "")
    stage = match.get("competition_stage", {}).get("name")
    return {
        "id": int(match["match_id"]),
        "date": match["match_date"],
        "week": int(match.get("match_week") or 0),
        "competition": competition,
        "stage": stage,
        "phase": phase,
        "opponent": opponent,
        "venue": "H" if is_home else "A",
        "goalsFor": goals_for,
        "goalsAgainst": goals_against,
        "result": result,
        "formation": formation,
        "completedPasses": sum(pass_count.values()),
        "shots": shots,
        "xg": round(xg, 2),
        "players": player_rows,
        "links": link_rows,
        "flows": possession_flows(events),
        "goals": goals,
    }


def season_summary(matches: list[dict[str, Any]]) -> dict[str, Any]:
    league = [match for match in matches if match["phase"] == "league"]
    return {
        "matches": len(matches),
        "leagueMatches": len(league),
        "wins": sum(match["result"] == "W" for match in league),
        "draws": sum(match["result"] == "D" for match in league),
        "losses": sum(match["result"] == "L" for match in league),
        "goalsFor": sum(match["goalsFor"] for match in league),
        "goalsAgainst": sum(match["goalsAgainst"] for match in league),
        "leagueCompletedPasses": sum(match["completedPasses"] for match in league),
    }


def main() -> int:
    args = parse_args()
    cache_dir: Path = args.cache_dir.resolve()
    output: Path = args.output.resolve()

    indexed_matches: list[tuple[dict[str, Any], str]] = []
    for filename, url, phase in MATCH_FEEDS:
        feed = fetch_json(url, cache_dir / "matches" / filename, args.offline, args.refresh)
        if phase == "league":
            selected = feed
        else:
            selected = [
                match
                for match in feed
                if int(match.get("match_id", -1)) == 18242
            ]
        indexed_matches.extend((match, phase) for match in selected)

    if len([item for item in indexed_matches if item[1] == "league"]) != 38:
        raise ValueError("Expected exactly 38 La Liga matches in StatsBomb season 11/26")
    if len([item for item in indexed_matches if item[1] == "epilogue"]) != 1:
        raise ValueError("Expected Champions League final match 18242")

    event_data: dict[int, list[dict[str, Any]]] = {}
    lineup_data: dict[int, list[dict[str, Any]]] = {}
    for match, _ in indexed_matches:
        match_id = int(match["match_id"])
        event_data[match_id] = fetch_json(
            f"{RAW_BASE}/events/{match_id}.json",
            cache_dir / "events" / f"{match_id}.json",
            args.offline,
            args.refresh,
        )
        lineup_data[match_id] = fetch_json(
            f"{RAW_BASE}/lineups/{match_id}.json",
            cache_dir / "lineups" / f"{match_id}.json",
            args.offline,
            args.refresh,
        )

    catalog = build_player_catalog(lineup_data.values())
    matches = [
        aggregate_match(match, event_data[int(match["match_id"])], catalog, phase)
        for match, phase in indexed_matches
    ]
    matches.sort(key=lambda match: (match["date"], match["phase"] == "epilogue"))

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source": {
            "name": "StatsBomb Open Data",
            "url": "https://github.com/hudl/open-data",
            "licenseNote": "Attribution and StatsBomb logo required for published analysis.",
            "competitionSeasonIds": [
                {"competition": 11, "season": 26, "label": "La Liga 2014/15"},
                {
                    "competition": 16,
                    "season": 26,
                    "match": 18242,
                    "label": "Champions League Final 2015",
                },
            ],
        },
        "method": {
            "coordinates": "StatsBomb 120 × 80 event coordinate system; Barcelona attacks left to right.",
            "averagePosition": "Mean origin of each player's completed open-play passes.",
            "network": "Directed completed open-play passes; links with fewer than two passes are omitted.",
            "flows": "Up to 42 Barcelona possessions per match that reached x ≥ 80 or ended in a shot; paths are downsampled to 18 points.",
        },
        "summary": season_summary(matches),
        "players": sorted(catalog.values(), key=lambda player: player["id"]),
        "matches": matches,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")

    print(
        f"Wrote {output} ({output.stat().st_size / 1024:.1f} KiB, "
        f"{len(matches)} matches, {len(catalog)} players)"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
