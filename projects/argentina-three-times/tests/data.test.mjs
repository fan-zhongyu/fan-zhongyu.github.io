import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = JSON.parse(
  await readFile(new URL("../data/argentina-world-cups.json", import.meta.url), "utf8"),
);

test("the common backbone contains the three requested tournaments", () => {
  assert.deepEqual(data.tournaments.map((item) => item.year), [2014, 2018, 2022]);
  assert.deepEqual(data.tournaments.map((item) => item.matches.length), [7, 4, 7]);
  assert.deepEqual(data.tournaments.map((item) => item.summary.goalsFor), [8, 6, 15]);
});

test("every match has a valid starting XI and a continuous score clock", () => {
  for (const tournament of data.tournaments) {
    for (const match of tournament.matches) {
      assert.equal(match.lineup.filter((player) => player.starter).length, 11, `${match.id} starters`);
      assert.equal(match.scoreSegments[0].from, 0, `${match.id} begins at zero`);
      assert.equal(match.scoreSegments.at(-1).to, match.maximumMinute, `${match.id} reaches full time`);
      for (let index = 1; index < match.scoreSegments.length; index += 1) {
        assert.equal(match.scoreSegments[index - 1].to, match.scoreSegments[index].from, `${match.id} is continuous`);
      }
    }
  }
});

test("the three decisive scorelines match the historical record", () => {
  const critical = data.tournaments.map((tournament) => tournament.matches.find((match) => match.critical));
  assert.deepEqual([critical[0].argScore, critical[0].oppScore], [0, 1]);
  assert.deepEqual([critical[1].argScore, critical[1].oppScore], [3, 4]);
  assert.deepEqual([critical[2].argScore, critical[2].oppScore], [3, 3]);
  assert.deepEqual(critical[2].penalties, { arg: 4, opp: 2 });
});

test("StatsBomb is an enhancement for 2018 and 2022 only", () => {
  assert.equal(data.eventEnhancements.length, 11);
  assert.deepEqual([...new Set(data.eventEnhancements.map((item) => item.year))], [2018, 2022]);
  assert.ok(data.eventEnhancements.every((item) => (
    item.year === 2018 ? item.bins.length === 18 : [18, 24].includes(item.bins.length)
  )));
  assert.ok(data.eventEnhancements.every((item) => item.summary.passes > 0 && item.summary.shots > 0));
  assert.match(data.meta.comparability.unavailable, /2014/);
});

test("Messi's common-source totals are retained without event-data imputation", () => {
  assert.deepEqual(data.tournaments.map((item) => item.messi.goals), [4, 1, 7]);
  assert.deepEqual(data.tournaments.map((item) => item.messi.starts), [7, 4, 7]);
  assert.ok(data.tournaments.every((item) => item.messi.teammates.length === 8));
});
