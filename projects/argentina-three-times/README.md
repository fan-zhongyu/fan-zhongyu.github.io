# Argentina, Three Times

An interactive, monochrome comparison of Argentina at the 2014, 2018 and 2022 FIFA World Cups. It is a static portfolio project: no framework, build step, server-side code or runtime dependency is required.

The visual essay opens with one shared journey and keeps four deeper comparisons
behind a compact text switcher, so the page stays focused rather than becoming a
five-chapter dashboard:

1. Three aligned tournament journeys, with every match selectable.
2. The decisive match of each campaign on one 120-minute score-state clock.
3. Starting-XI continuity and substitution appearances.
4. Messi’s co-start relationships and recorded positional labels.
5. A compact StatsBomb event layer for 2018 and 2022, with 2014 deliberately left unfilled.

The presentation is intentionally fixed to a paper-and-ink light palette; it does
not inherit an automatic dark “tech dashboard” theme from the visitor's system.

## Run locally

Opening `index.html` directly will block the JSON request in most browsers. Serve the directory instead:

```bash
npm run serve
```

Then open <http://localhost:8000>. There are no packages to install.

## Test

```bash
npm test
```

The tests verify the historical scorelines, match counts, starting XIs, score-clock continuity, StatsBomb coverage boundary, relative asset paths, accessibility hooks and payload size.

## Publish inside a GitHub Pages portfolio

Copy this entire directory into the portfolio repository, for example:

```text
fan-zhongyu.github.io/
├── index.html
└── projects/
    └── argentina-three-times/
        ├── index.html
        ├── app.js
        ├── styles.css
        ├── assets/
        └── data/
```

The project uses only relative URLs, so it will work from a subdirectory such as:

```text
https://fan-zhongyu.github.io/projects/argentina-three-times/
```

Add a normal link to that path from the portfolio. If the portfolio already has a GitHub Pages deployment workflow, no second deployment or Python process is needed.

## Rebuild the data

The shipped JSON was generated from real source files with:

```bash
python3 scripts/build_data.py \
  --fjelstul /path/to/worldcup/data-csv \
  --statsbomb /path/to/open-data \
  --output data/argentina-world-cups.json \
  --fjelstul-commit 35a8667f518b07469182ae16d35574dd0e7a00fb \
  --statsbomb-commit b0bc9f22dd77c206ddedc1d742893b3bbe64baec
```

The script expects the standard directory layouts from:

- [jfjelstul/worldcup](https://github.com/jfjelstul/worldcup)
- [statsbomb/open-data](https://github.com/statsbomb/open-data)

It extracts only Argentina’s 18 matches and compact five-minute event summaries. The 36 MB of source event files are not copied into the site; the browser payload is approximately 123 KB.

## Comparability boundary

The Fjelstul database is the common source for match progression, score states, goals, substitutions, player appearances, recorded positions, retained starters and co-start counts across all three editions.

StatsBomb supplies an optional event layer for all four Argentina matches in 2018 and all seven in 2022. The current StatsBomb open-data competition list does not include the 2014 World Cup. The interface therefore does not show passes, carries, pressure counts, shots or xG for 2014.

Soccer2014DS is documented as a downloadable research dataset, but its public reuse licence was not clear enough to mix into this published first edition. A future extension should add it only after the licence is confirmed and the event taxonomy is harmonised.

Penalty-shootout kicks are excluded from score-state clocks. Match results still show shootout scores where applicable.

## Project structure

```text
.
├── index.html
├── styles.css
├── app.js
├── assets/
│   └── statsbomb-logo.png
├── data/
│   └── argentina-world-cups.json
├── scripts/
│   └── build_data.py
├── tests/
├── CITATION.cff
├── DATA-LICENSE.md
└── LICENSE
```

## Licences and attribution

The site code is released under the MIT License.

The modified Fjelstul extract in `data/argentina-world-cups.json` is distributed under CC BY-SA 4.0. See [DATA-LICENSE.md](./DATA-LICENSE.md) for the required attribution and modification notice. StatsBomb-derived fields are identified in the data and interface and remain subject to the [StatsBomb Open Data terms](https://github.com/statsbomb/open-data).

## Citation

See [CITATION.cff](./CITATION.cff), or cite:

> Fan, Zhongyu. “Argentina, Three Times.” Interactive data visualisation, 2026.
