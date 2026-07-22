# Data licence and attribution

## Common three-tournament backbone

The match, goal, substitution and player-appearance records in `data/argentina-world-cups.json` are a modified extract of the **Fjelstul World Cup Database**.

Required attribution:

- Creator: Joshua C. Fjelstul, Ph.D.
- Copyright: © 2023 Joshua C. Fjelstul, Ph.D.
- Source: <https://github.com/jfjelstul/worldcup>
- Licence: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/legalcode)

Modifications made for this project:

- filtered the source to Argentina’s matches at the 2014, 2018 and 2022 men’s World Cups;
- normalized home/away scores and results to Argentina’s perspective;
- joined goals, substitutions and player appearances to matches;
- derived score-state segments, counts of starters retained from the previous match, player tournament paths and co-start relationships with Lionel Messi;
- serialized only the fields required by the interactive visualisation.

The modified extract is made available under **CC BY-SA 4.0**. Adaptations of this data must preserve attribution and use the same or a compatible licence.

## Event enhancement

The `eventEnhancements` collection contains aggregates derived from [StatsBomb Open Data](https://github.com/statsbomb/open-data) for Argentina’s 2018 and 2022 World Cup matches. Please identify StatsBomb as the data source and follow the attribution instructions in its repository when publishing, sharing or distributing analysis based on those fields.

No StatsBomb event data is presented for the 2014 World Cup. No Soccer2014DS records are included.
