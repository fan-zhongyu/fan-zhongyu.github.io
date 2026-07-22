#!/usr/bin/env python3
"""Build the compact, browser-ready dataset for Argentina, Three Times.

The common three-tournament backbone is derived from the Fjelstul World Cup
Database. StatsBomb event data is an optional enhancement for 2018 and 2022;
the script never invents a 2014 event layer when one is unavailable.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


TOURNAMENTS = {
    "WC-2014": {"year": 2014, "finish": "Runners-up", "critical": "M-2014-64"},
    "WC-2018": {"year": 2018, "finish": "Round of 16", "critical": "M-2018-49"},
    "WC-2022": {"year": 2022, "finish": "Champions", "critical": "M-2022-64"},
}

SB_SEASONS = {2018: 3, 2022: 106}
ARGENTINA = "Argentina"


def as_int(value: str | int | None, default: int = 0) -> int:
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def player_name(row: dict[str, str]) -> str:
    return " ".join(part for part in (row.get("given_name", ""), row.get("family_name", "")) if part).strip()


def minute_value(row: dict[str, str]) -> int:
    return as_int(row.get("minute_regulation")) + as_int(row.get("minute_stoppage"))


def result_for(arg_score: int, opp_score: int, arg_pens: int, opp_pens: int, shootout: bool) -> str:
    left, right = (arg_pens, opp_pens) if shootout else (arg_score, opp_score)
    return "W" if left > right else "L" if left < right else "D"


def score_segments(goals: list[dict], maximum: int) -> list[dict]:
    segments = []
    cursor = 0
    difference = 0
    for goal in sorted(goals, key=lambda item: item["minute"]):
        minute = min(maximum, goal["minute"])
        if minute > cursor:
            segments.append({"from": cursor, "to": minute, "difference": difference})
        difference += 1 if goal["side"] == "ARG" else -1
        cursor = minute
    if cursor < maximum:
        segments.append({"from": cursor, "to": maximum, "difference": difference})
    elif goals and cursor == maximum:
        # Preserve a stoppage-time goal as a vertical step at the 90′/120′ edge.
        segments.append({"from": maximum, "to": maximum, "difference": difference})
    return segments


def build_common_backbone(source: Path) -> list[dict]:
    matches = read_csv(source / "matches.csv")
    goals = read_csv(source / "goals.csv")
    substitutions = read_csv(source / "substitutions.csv")
    appearances = read_csv(source / "player_appearances.csv")

    match_goals: dict[str, list[dict]] = defaultdict(list)
    for row in goals:
        if row["tournament_id"] not in TOURNAMENTS:
            continue
        match_goals[row["match_id"]].append(
            {
                "side": "ARG" if row["team_name"] == ARGENTINA else "OPP",
                "team": row["team_name"],
                "scorer": player_name(row),
                "minute": minute_value(row),
                "label": row["minute_label"],
                "penalty": row["penalty"] == "1",
                "ownGoal": row["own_goal"] == "1",
            }
        )

    match_subs: dict[str, list[dict]] = defaultdict(list)
    for row in substitutions:
        if row["tournament_id"] not in TOURNAMENTS:
            continue
        match_subs[row["match_id"]].append(
            {
                "side": "ARG" if row["team_name"] == ARGENTINA else "OPP",
                "team": row["team_name"],
                "player": player_name(row),
                "minute": minute_value(row),
                "label": row["minute_label"],
                "direction": "off" if row["going_off"] == "1" else "on",
            }
        )

    match_appearances: dict[str, list[dict]] = defaultdict(list)
    for row in appearances:
        if row["tournament_id"] not in TOURNAMENTS or row["team_name"] != ARGENTINA:
            continue
        match_appearances[row["match_id"]].append(
            {
                "id": row["player_id"],
                "name": player_name(row),
                "familyName": row["family_name"],
                "shirt": as_int(row["shirt_number"]),
                "position": row["position_code"],
                "positionName": row["position_name"],
                "starter": row["starter"] == "1",
                "substitute": row["substitute"] == "1",
            }
        )

    output = []
    for tournament_id, config in TOURNAMENTS.items():
        tournament_matches = [
            row
            for row in matches
            if row["tournament_id"] == tournament_id
            and (row["home_team_name"] == ARGENTINA or row["away_team_name"] == ARGENTINA)
        ]
        tournament_matches.sort(key=lambda row: row["match_date"])
        built_matches = []
        previous_starters: set[str] | None = None

        for index, row in enumerate(tournament_matches):
            home = row["home_team_name"] == ARGENTINA
            arg_score = as_int(row["home_team_score"] if home else row["away_team_score"])
            opp_score = as_int(row["away_team_score"] if home else row["home_team_score"])
            arg_pens = as_int(row["home_team_score_penalties"] if home else row["away_team_score_penalties"])
            opp_pens = as_int(row["away_team_score_penalties"] if home else row["home_team_score_penalties"])
            shootout = row["penalty_shootout"] == "1"
            lineup = match_appearances[row["match_id"]]
            starters = {item["id"] for item in lineup if item["starter"]}
            retained = 11 if previous_starters is None else len(starters & previous_starters)
            maximum = 120 if row["extra_time"] == "1" else 90
            opponent = row["away_team_name"] if home else row["home_team_name"]
            opponent_code = row["away_team_code"] if home else row["home_team_code"]
            goal_list = sorted(match_goals[row["match_id"]], key=lambda item: item["minute"])
            built_matches.append(
                {
                    "id": row["match_id"],
                    "index": index + 1,
                    "date": row["match_date"],
                    "stage": row["stage_name"],
                    "opponent": opponent,
                    "opponentCode": opponent_code,
                    "venue": "home" if home else "away",
                    "argScore": arg_score,
                    "oppScore": opp_score,
                    "penalties": {"arg": arg_pens, "opp": opp_pens} if shootout else None,
                    "result": result_for(arg_score, opp_score, arg_pens, opp_pens, shootout),
                    "extraTime": row["extra_time"] == "1",
                    "maximumMinute": maximum,
                    "goals": goal_list,
                    "scoreSegments": score_segments(goal_list, maximum),
                    "substitutions": sorted(match_subs[row["match_id"]], key=lambda item: item["minute"]),
                    "lineup": lineup,
                    "retainedStarters": retained,
                    "critical": row["match_id"] == config["critical"],
                }
            )
            previous_starters = starters

        player_records: dict[str, dict] = {}
        for match in built_matches:
            for player in match["lineup"]:
                record = player_records.setdefault(
                    player["id"],
                    {
                        "id": player["id"],
                        "name": player["name"],
                        "familyName": player["familyName"],
                        "shirt": player["shirt"],
                        "starts": 0,
                        "subAppearances": 0,
                        "goals": 0,
                        "matches": [None] * len(built_matches),
                    },
                )
                status = "start" if player["starter"] else "sub" if player["substitute"] else "appearance"
                record["matches"][match["index"] - 1] = {"status": status, "position": player["position"]}
                record["starts"] += int(player["starter"])
                record["subAppearances"] += int(player["substitute"])

        for goal in (goal for match in built_matches for goal in match["goals"]):
            if goal["side"] != "ARG" or goal["ownGoal"]:
                continue
            for record in player_records.values():
                if record["name"] == goal["scorer"]:
                    record["goals"] += 1
                    break

        players = sorted(
            player_records.values(),
            key=lambda item: (-item["starts"], -item["subAppearances"], item["familyName"]),
        )
        messi = next(item for item in players if item["familyName"] == "Messi")
        messi_start_ids = {
            match["id"]
            for match in built_matches
            if any(player["familyName"] == "Messi" and player["starter"] for player in match["lineup"])
        }
        teammates = []
        for player in players:
            if player["id"] == messi["id"]:
                continue
            co_starts = sum(
                any(p["id"] == player["id"] and p["starter"] for p in match["lineup"])
                for match in built_matches
                if match["id"] in messi_start_ids
            )
            if co_starts:
                teammates.append(
                    {
                        "id": player["id"],
                        "name": player["name"],
                        "familyName": player["familyName"],
                        "coStarts": co_starts,
                        "starts": player["starts"],
                        "goals": player["goals"],
                    }
                )
        teammates.sort(key=lambda item: (-item["coStarts"], -item["goals"], item["familyName"]))
        team_goals = sum(1 for match in built_matches for goal in match["goals"] if goal["side"] == "ARG")
        goals_against = sum(1 for match in built_matches for goal in match["goals"] if goal["side"] == "OPP")
        output.append(
            {
                "year": config["year"],
                "finish": config["finish"],
                "matches": built_matches,
                "players": players,
                "summary": {
                    "played": len(built_matches),
                    "goalsFor": team_goals,
                    "goalsAgainst": goals_against,
                    "averageRetainedStarters": round(
                        sum(match["retainedStarters"] for match in built_matches[1:]) / max(1, len(built_matches) - 1),
                        1,
                    ),
                },
                "messi": {
                    "id": messi["id"],
                    "starts": messi["starts"],
                    "goals": messi["goals"],
                    "shareOfTeamGoals": round(messi["goals"] / team_goals, 3) if team_goals else 0,
                    "positions": [
                        (entry or {}).get("position") for entry in messi["matches"]
                    ],
                    "teammates": teammates[:8],
                },
            }
        )
    return output


def statsbomb_match_index(statsbomb: Path) -> dict[tuple[int, str], dict]:
    index = {}
    for year, season in SB_SEASONS.items():
        path = statsbomb / "data" / "matches" / "43" / f"{season}.json"
        if not path.exists():
            continue
        for match in json.loads(path.read_text(encoding="utf-8")):
            home = match["home_team"]["home_team_name"]
            away = match["away_team"]["away_team_name"]
            if ARGENTINA in {home, away}:
                index[(year, match["match_date"])] = match
    return index


def event_enhancement(year: int, common_match: dict, sb_match: dict, events: list[dict]) -> dict:
    bins: dict[int, Counter] = defaultdict(Counter)
    summary = Counter()
    xg = 0.0
    completed = 0
    messi = Counter()
    messi_connections = Counter()

    for event in events:
        if event.get("period", 1) > 4 or event.get("team", {}).get("name") != ARGENTINA:
            continue
        event_type = event.get("type", {}).get("name", "")
        minute = as_int(event.get("minute"))
        bucket = min(115, (minute // 5) * 5)
        player = event.get("player", {}).get("name", "")
        is_messi = "Messi" in player
        if event_type == "Pass":
            summary["passes"] += 1
            bins[bucket]["passes"] += 1
            if "outcome" not in event.get("pass", {}):
                completed += 1
            recipient = event.get("pass", {}).get("recipient", {}).get("name", "")
            if is_messi:
                messi["passes"] += 1
                if recipient:
                    messi_connections[recipient] += 1
            elif "Messi" in recipient:
                messi_connections[player] += 1
                messi["received"] += 1
        elif event_type == "Carry":
            summary["carries"] += 1
            bins[bucket]["carries"] += 1
            if is_messi:
                messi["carries"] += 1
        elif event_type == "Pressure":
            summary["pressures"] += 1
            bins[bucket]["pressures"] += 1
            if is_messi:
                messi["pressures"] += 1
        elif event_type == "Shot":
            summary["shots"] += 1
            bins[bucket]["shots"] += 1
            shot_xg = float(event.get("shot", {}).get("statsbomb_xg", 0) or 0)
            xg += shot_xg
            if is_messi:
                messi["shots"] += 1
                messi["xg"] += shot_xg

    maximum = common_match["maximumMinute"]
    compact_bins = []
    for start in range(0, maximum, 5):
        counts = bins[start]
        compact_bins.append(
            {
                "from": start,
                "to": min(maximum, start + 5),
                "passes": counts["passes"],
                "carries": counts["carries"],
                "pressures": counts["pressures"],
                "shots": counts["shots"],
            }
        )
    return {
        "year": year,
        "matchId": common_match["id"],
        "providerMatchId": sb_match["match_id"],
        "available360": bool(sb_match.get("match_available_360")),
        "summary": {
            "passes": summary["passes"],
            "completedPasses": completed,
            "carries": summary["carries"],
            "pressures": summary["pressures"],
            "shots": summary["shots"],
            "xg": round(xg, 3),
        },
        "messi": {
            "passes": messi["passes"],
            "received": messi["received"],
            "carries": messi["carries"],
            "pressures": messi["pressures"],
            "shots": messi["shots"],
            "xg": round(float(messi["xg"]), 3),
            "connections": [
                {"player": name, "exchanges": count}
                for name, count in messi_connections.most_common(5)
            ],
        },
        "bins": compact_bins,
    }


def build_event_layer(statsbomb: Path | None, tournaments: list[dict]) -> list[dict]:
    if not statsbomb:
        return []
    match_index = statsbomb_match_index(statsbomb)
    enhancements = []
    for tournament in tournaments:
        year = tournament["year"]
        if year not in SB_SEASONS:
            continue
        for match in tournament["matches"]:
            sb_match = match_index.get((year, match["date"]))
            if not sb_match:
                continue
            event_path = statsbomb / "data" / "events" / f"{sb_match['match_id']}.json"
            if event_path.exists():
                events = json.loads(event_path.read_text(encoding="utf-8"))
                enhancements.append(event_enhancement(year, match, sb_match, events))
    return enhancements


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fjelstul", type=Path, required=True, help="Path to Fjelstul data-csv directory")
    parser.add_argument("--statsbomb", type=Path, help="Path to StatsBomb open-data checkout")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fjelstul-commit", default="unknown")
    parser.add_argument("--statsbomb-commit", default="unknown")
    args = parser.parse_args()

    tournaments = build_common_backbone(args.fjelstul)
    payload = {
        "meta": {
            "title": "Argentina, Three Times",
            "generated": "2026-07-21",
            "commonBackbone": "Fjelstul World Cup Database",
            "commonBackboneCommit": args.fjelstul_commit,
            "eventProvider": "StatsBomb Open Data",
            "eventProviderCommit": args.statsbomb_commit,
            "comparability": {
                "allYears": ["matches", "score states", "goals", "substitutions", "lineups", "co-starts"],
                "eventYears": [2018, 2022],
                "unavailable": "No StatsBomb event layer is presented for 2014.",
            },
        },
        "tournaments": tournaments,
        "eventEnhancements": build_event_layer(args.statsbomb, tournaments),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {args.output}: {sum(len(t['matches']) for t in tournaments)} matches, "
        f"{len(payload['eventEnhancements'])} StatsBomb event summaries."
    )


if __name__ == "__main__":
    main()
