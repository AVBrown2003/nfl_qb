# NFL Starting Quarterbacks, 2000–2025

A two-page website (a report and a dashboard) about how NFL starting quarterbacks performed from 2000 to 2025, quarter by quarter.

## The data

**Source:** [nflverse](https://github.com/nflverse/nflverse-data) play-by-play and game data, free to use under CC-BY 4.0.

**One row** is one quarterback in one quarter of one game. There are 53,824 rows and 29 columns, covering 177 quarterbacks over 26 seasons.

**Which quarterbacks:** anyone who started 9 or more regular-season games (more than half a season) in at least one season from 2000 on. Every play they made from 2000 to 2025 is kept, including seasons where they were a backup.

**Rows dropped:**
- Kneels and spikes. These run the clock and are not real attempts.
- Two-point conversion attempts.
- Overtime periods are combined into one quarter, labeled `OT`.

**Career year:** `career_year` (1, 2, 3 …) and `career_stage` (Rookie, Year 2, Year 3 …) count from each QB's first NFL season, which comes from the nflverse players file. QBs who entered the league before 2000 start the data past year 1: Brett Favre's 2000 season is Year 10.

`air_yards` is blank before 2006, because the NFL did not track it before then.

## Files

| File | What it does |
|---|---|
| `01_build_qb_plays.py` | Reads the raw nflverse files and builds the play-level data (one row per QB play). |
| `02_build_qb_quarters.py` | Rolls the plays up to one row per QB per quarter and checks the result against the assignment requirements. |
| `data/qb_quarters.csv` | **The project data set:** one row per QB per quarter. |
| `data/qb_quarters.parquet` | The same data in a compressed format for Python. |
| `data/qb_plays.parquet` | The play-level data that the quarter file is built from. |
| `pyproject.toml`, `uv.lock` | The Python environment (pandas, pyarrow), managed with uv. |

The raw nflverse downloads (`raw/`, about 550 MB) and the play-level CSV (88 MB) are not in the repository because of their size. The scripts rebuild them.

## Rebuilding the data

```
uv run python 01_build_qb_plays.py
uv run python 02_build_qb_quarters.py
```
