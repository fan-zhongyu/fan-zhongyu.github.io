import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "season.json"


class CompactDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        cls.matches = cls.payload["matches"]

    def test_expected_scope_and_identity(self):
        self.assertEqual(self.payload["schemaVersion"], "1.0.0")
        self.assertEqual(len(self.matches), 39)
        self.assertEqual(sum(match["phase"] == "league" for match in self.matches), 38)
        self.assertEqual(sum(match["phase"] == "epilogue" for match in self.matches), 1)
        self.assertEqual(len({match["id"] for match in self.matches}), 39)
        self.assertEqual(self.matches[-1]["id"], 18242)
        self.assertEqual(self.matches[-1]["opponent"], "Juventus")
        self.assertEqual(self.matches[-1]["stage"], "Final")

    def test_league_summary_matches_historical_totals(self):
        summary = self.payload["summary"]
        self.assertEqual(
            {key: summary[key] for key in ("wins", "draws", "losses")},
            {"wins": 30, "draws": 4, "losses": 4},
        )
        self.assertEqual(summary["goalsFor"], 110)
        self.assertEqual(summary["goalsAgainst"], 21)

    def test_chronology_and_match_values(self):
        dates = [match["date"] for match in self.matches]
        self.assertEqual(dates, sorted(dates))
        for match in self.matches:
            self.assertIn(match["result"], {"W", "D", "L"})
            self.assertGreaterEqual(match["goalsFor"], 0)
            self.assertGreaterEqual(match["goalsAgainst"], 0)
            self.assertGreater(match["completedPasses"], 0)
            self.assertGreater(match["shots"], 0)
            self.assertGreaterEqual(match["xg"], 0)

    def test_player_positions_and_network_links_are_valid(self):
        for match in self.matches:
            player_ids = {player["id"] for player in match["players"]}
            self.assertGreaterEqual(len(player_ids), 9)
            for player in match["players"]:
                self.assertGreaterEqual(player["x"], 0)
                self.assertLessEqual(player["x"], 120)
                self.assertGreaterEqual(player["y"], 0)
                self.assertLessEqual(player["y"], 80)
                self.assertGreaterEqual(player["passes"], 2)
            for link in match["links"]:
                self.assertIn(link["source"], player_ids)
                self.assertIn(link["target"], player_ids)
                self.assertGreaterEqual(link["count"], 2)

    def test_attack_paths_are_bounded_and_truthfully_selected(self):
        for match in self.matches:
            self.assertLessEqual(len(match["flows"]), 42)
            for flow in match["flows"]:
                self.assertGreaterEqual(len(flow["path"]), 2)
                self.assertLessEqual(len(flow["path"]), 18)
                self.assertTrue(flow["maxX"] >= 80 or flow["shot"])
                for x, y in flow["path"]:
                    self.assertGreaterEqual(x, 0)
                    self.assertLessEqual(x, 120)
                    self.assertGreaterEqual(y, 0)
                    self.assertLessEqual(y, 80)

    def test_msn_catalog_and_attribution(self):
        players = {player["id"]: player for player in self.payload["players"]}
        self.assertEqual(players[5503]["label"], "Lionel Messi")
        self.assertEqual(players[5246]["label"], "Luis Suárez")
        self.assertEqual(players[4320]["label"], "Neymar")
        self.assertEqual(self.payload["source"]["name"], "StatsBomb Open Data")

    def test_static_files_reference_relative_assets_and_credit_source(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn('src="./app.js"', html)
        self.assertIn('href="./styles.css"', html)
        self.assertIn('src="./assets/statsbomb-icon.svg"', html)
        self.assertIn("StatsBomb Open Data", html)
        self.assertIn('fetch("./data/season.json")', script)
        self.assertNotIn('id="flowLayer" class="flow-layer" aria-hidden', html)
        self.assertNotIn('id="playerLayer" class="player-layer" aria-hidden', html)
        self.assertTrue((ROOT / "assets" / "statsbomb-icon.svg").exists())
        self.assertLess(DATA_PATH.stat().st_size, 1024 * 1024)


if __name__ == "__main__":
    unittest.main()
