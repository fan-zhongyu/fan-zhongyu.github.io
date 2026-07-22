# The Geometry of a Treble

An interactive study of FC Barcelona’s passing geometry in 2014–15, designed in
a warm Mediterranean-modernist palette inspired by Catalan print and
architectural drawings.
It covers all 38 La Liga matches in the StatsBomb Messi open dataset, then treats
the 2015 Champions League final as an epilogue. It does **not** claim to cover
Barcelona’s complete European campaign.

The site is deliberately static: no framework, package manager, API, build step,
or absolute asset paths. It can be copied unchanged into a GitHub Pages
subdirectory.

## View locally

Browsers block `fetch()` from `file://`, so serve the directory over HTTP:

```bash
cd football-barcelona-treble
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Interaction

- Select any match on the season rail, or use the arrow buttons/arrow keys.
- **Structure** places players at the mean origin of their completed open-play
  passes and connects players who completed at least two passes between them.
- **Attacks** traces possessions that entered the final third or ended in a shot.
- Hover, focus, or tap a player/path to reveal its values.
- On a phone, pan the enlarged pitch horizontally; it opens toward Barcelona's
  attacking half so the front-three geometry remains legible.
- **Index** contains the scope, method, extensions, citation, and data credit.

## Data and method

Source: [StatsBomb Open Data](https://github.com/hudl/open-data)

- La Liga: `competition_id=11`, `season_id=26` — 38 matches.
- Champions League: `competition_id=16`, `season_id=26`, `match_id=18242` —
  Juventus 1–3 Barcelona, the final only.
- Coordinates retain StatsBomb’s 120 × 80 convention and Barcelona attacks from
  left to right.
- “Average position” is a passing-event centroid, not player tracking.
- Set pieces are excluded from positions and passing links.
- The committed `data/season.json` contains transformed aggregates only.

StatsBomb’s open-data terms ask published work to state the source and use the
StatsBomb logo. The official icon is included at `assets/statsbomb-icon.svg` and
appears in the Index drawer; preserve that credit when publishing or adapting
the work.

## Rebuild the compact data

The builder downloads source JSON into an ignored cache, validates that the
expected 38 league matches and final are present, and produces a minified file:

```bash
python3 scripts/build_data.py
```

For a reproducible offline rebuild with a populated cache:

```bash
python3 scripts/build_data.py --offline
```

Useful options:

```text
--cache-dir PATH   raw-download cache (default: .cache/statsbomb)
--output PATH      compact output (default: data/season.json)
--refresh          replace cached source files
```

Raw StatsBomb event and lineup files are intentionally excluded from version
control; retaining them would add roughly 136 MB.

## Verify

```bash
python3 -m unittest discover -s tests -v
node --check app.js
```

The tests check match identity, chronology, season totals, coordinate bounds,
link integrity, attack-path limits, attribution, and the static asset graph.

## GitHub Pages

To merge it into `fan-zhongyu.github.io`, copy this whole directory to a stable
subdirectory such as:

```text
projects/geometry-of-a-treble/
```

After committing and pushing the personal-site repository, the page will be at:

```text
https://fan-zhongyu.github.io/projects/geometry-of-a-treble/
```

If the portfolio has a routing/build system, preserve these files as a static
public directory. Every site reference begins with `./`, so no base-path change
is required.

## Credits and citation

Concept, design, analysis, and implementation: **Zhongyu Fan**.

Machine-readable citation metadata is provided in `CITATION.cff`. Source data is
credited separately to StatsBomb and is not covered by the project code licence.
