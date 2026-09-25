# NFL Quarterback Rookie Classes, 2000–2025

A two-page website (a report and a dashboard) that follows every NFL starting quarterback who entered the league from 2000 on, drive by drive, from his rookie season through the rest of his career.

## The data

**Source:** [nflverse](https://github.com/nflverse/nflverse-data) play-by-play, game, and player data, free to use under CC-BY 4.0.

**One row** is one quarterback on one offensive drive (possession) of one game. There are 105,862 rows and 41 columns, covering 135 quarterbacks over 26 seasons (2000–2025).

**Which quarterbacks:** rookie season (first NFL season) in 2000 or later, and at least one season with 9 or more regular-season starts (more than half a season). Every drive of their career through 2025 is kept, including seasons spent as a backup. The 2026 season is left out because it is still in progress.

**Career year:** `career_year` (1, 2, 3 …) and `career_stage` (Rookie, Year 2, Year 3 …) count from the QB's rookie season in the nflverse players file. `rookie_class` is that rookie season.

**What the columns describe:**
- `drive_result`, `scoring_drive`, `start_yards_to_goal`, `drive_plays` and `drive_yards` describe the whole drive: every play on it, whoever ran it. `scoring_drive` is 1 when the drive ended in a touchdown or field goal. `start_yards_to_goal` is how far the offense had to go when the drive began (75 = its own 25-yard line).
- `game_result` (Win/Loss/Tie), `team_score` and `opp_score` are the final result of the game from the QB's team's side, from the nflverse schedule file. They repeat on every drive of that game, so win records are counted once per game, not once per row. `started_game` is 1 when the QB was his team's listed starter. Win-loss records count only games the QB started.
- All other counts (passes, yards, TDs, interceptions, sacks, scrambles, turnovers, `qb_epa`) cover only the QB's own plays on that drive.

**Rows and plays dropped:**
- Kneels and spikes. These run the clock and are not real attempts, so a drive made up only of kneels has no row.
- Two-point conversion attempts.
- If a QB was replaced mid-drive (353 drives), each QB gets his own row for that drive.

`air_yards` is blank before 2006, because the NFL did not track it before then.

## Files

| File | What it does |
|---|---|
| `01_build_qb_plays.py` | Reads the raw nflverse files, picks the qualifying QBs, and builds the play-level data (one row per QB play) with drive and career-year information attached. |
| `02_build_qb_drives.py` | Rolls the plays up to one row per QB per drive and checks the result against the assignment requirements. |
| `03_analysis.py` | Computes every number and chart in the report (the 10 findings and the headline numbers). Definitions are in the docstring at the top. |
| `04_site_data.py` | Builds the career explorer data: every QB's seasons with team, jersey number, stats, how each stat ranks against all starting seasons, and approximate era jersey colors. |
| `data/qb_drives.csv` | **The project data set:** one row per QB per drive. |
| `data/qb_drives.parquet` | The same data in a compressed format for Python. |
| `data/qb_plays.parquet` | The play-level data that the drive file is built from. |
| `data/qb_seasons.csv` | One row per QB per regular season (record, EPA vs league average, team, original team), built by `03_analysis.py`. |
| `data/findings.json` | The headline numbers and the data behind each report chart, built by `03_analysis.py`. |
| `data/careers.json` | Career explorer data for the report page, built by `04_site_data.py`. |
| `pyproject.toml`, `uv.lock` | The Python environment (pandas, pyarrow), managed with uv. |

The raw nflverse downloads (`raw/`, about 550 MB) are not in the repository because of their size. They come from the nflverse-data releases (`pbp`, `schedules`, `players`, `rosters`, and `teams`). QB names come from the players file, because play-by-play spells some names several ways.

## Rebuilding the data

```
uv run python 01_build_qb_plays.py
uv run python 02_build_qb_drives.py
uv run python 03_analysis.py
uv run python 04_site_data.py
```
