# NFL Quarterback Rookie Classes, 2000–2025

A two-page website (a report and a dashboard) that follows every NFL starting quarterback who entered the league from 2000 on, drive by drive, from his rookie season through the rest of his career.

## The data

**Source:** [nflverse](https://github.com/nflverse/nflverse-data) play-by-play, game, and player data, free to use under CC-BY 4.0.

**One row** is one quarterback on one offensive drive (possession) of one game. There are 105,864 rows and 37 columns, covering 135 quarterbacks over 26 seasons (2000–2025).

**Which quarterbacks:** rookie season (first NFL season) in 2000 or later, and at least one season with 9 or more regular-season starts (more than half a season). Every drive of their career through 2025 is kept, including seasons spent as a backup. The 2026 season is left out because it is still in progress.

**Career year:** `career_year` (1, 2, 3 …) and `career_stage` (Rookie, Year 2, Year 3 …) count from the QB's rookie season in the nflverse players file. `rookie_class` is that rookie season.

**What the columns describe:**
- `drive_result`, `scoring_drive`, `start_yards_to_goal`, `drive_plays` and `drive_yards` describe the whole drive: every play on it, whoever ran it. `scoring_drive` is 1 when the drive ended in a touchdown or field goal. `start_yards_to_goal` is how far the offense had to go when the drive began (75 = its own 25-yard line).
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
| `data/qb_drives.csv` | **The project data set:** one row per QB per drive. |
| `data/qb_drives.parquet` | The same data in a compressed format for Python. |
| `data/qb_plays.parquet` | The play-level data that the drive file is built from. |
| `pyproject.toml`, `uv.lock` | The Python environment (pandas, pyarrow), managed with uv. |

The raw nflverse downloads (`raw/`, about 550 MB) are not in the repository because of their size. They come from the nflverse-data releases (`pbp`, `schedules`, and `players`).

## Rebuilding the data

```
uv run python 01_build_qb_plays.py
uv run python 02_build_qb_drives.py
```
