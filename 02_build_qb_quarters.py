"""Step 2: roll the play-level data up to one row per QB per quarter of a game.

One row = one qualifying QB in one quarter of one game (overtime periods are combined into "OT").
Kneels and spikes are dropped first: they are clock plays, not real attempts, and would drag
down yards and EPA per play.

Per game would only give ~14,500 rows; per quarter gives 50,000+ (the assignment minimum).
"""
from pathlib import Path

import pandas as pd

DATA = Path(__file__).parent / "data"

plays = pd.read_parquet(DATA / "qb_plays.parquet")
plays = plays[(plays.qb_kneel != 1) & (plays.qb_spike != 1) & (plays.play_type != "no_play")]
plays["quarter"] = plays.qtr.map({1: "Q1", 2: "Q2", 3: "Q3", 4: "Q4"}).fillna("OT")

KEYS = [
    "game_id", "game_date", "season", "week", "season_type", "qb_id", "qb_name",
    "team", "opponent", "home_away", "quarter",
]
q = plays.groupby(KEYS, as_index=False).agg(
    plays=("epa", "size"),
    dropbacks=("qb_dropback", "sum"),
    pass_attempts=("pass_attempt", "sum"),
    completions=("complete_pass", "sum"),
    passing_yards=("passing_yards", "sum"),   # blank on incompletions/sacks -> summed as 0
    air_yards=("air_yards", "sum"),
    pass_tds=("pass_touchdown", "sum"),
    interceptions=("interception", "sum"),
    sacks=("sack", "sum"),
    scrambles=("qb_scramble", "sum"),
    rush_attempts=("rush_attempt", "sum"),    # includes scrambles
    rushing_yards=("rushing_yards", "sum"),
    rush_tds=("rush_touchdown", "sum"),
    fumbles_lost=("qb_fumble_lost", "sum"),
    turnovers=("turnover", "sum"),
    shotgun_plays=("shotgun", "sum"),
    total_yards=("yards_gained", "sum"),
    total_epa=("epa", "sum"),
)
count_cols = q.columns[len(KEYS):].drop(["total_epa"])
q[count_cols] = q[count_cols].astype(int)
q["total_epa"] = q.total_epa.round(3)
# air yards are not tracked before 2006: leave blank rather than 0
q["air_yards"] = q.air_yards.astype("Int64").where(q.season >= 2006)

q["quarter"] = pd.Categorical(q.quarter, ["Q1", "Q2", "Q3", "Q4", "OT"], ordered=True)
q = q.sort_values(["game_date", "game_id", "qb_id", "quarter"]).reset_index(drop=True)
q["game_date"] = q.game_date.dt.date
q.to_csv(DATA / "qb_quarters.csv", index=False)
q.to_parquet(DATA / "qb_quarters.parquet", index=False)

print("\n=== Requirement check ===")
print(f"Rows: {len(q):,}  (need >= 50,000)")
print(f"Columns: {q.shape[1]}  (need >= 8)")
print(f"Periods (seasons): {q.season.nunique()}  (need >= 5)")
print(f"Groups (QBs): {q.qb_id.nunique()}  (need >= 10)")
print(f"CSV size: {(DATA / 'qb_quarters.csv').stat().st_size / 1e6:.1f} MB")
