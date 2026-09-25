"""Step 2: roll the play-level data up to one row per QB per drive.

One row = one qualifying QB on one offensive drive (possession) of one game. If a QB was
replaced mid-drive, each QB gets his own row for that drive.

Kneels and spikes are dropped first: they are clock plays, not real attempts, and would drag
down yards and EPA per play. Drives made up only of kneels (victory formation) drop out with them.

The drive_* columns describe the whole drive (every play, whoever ran it). The other counts
are only the QB's own plays: his passes, sacks, scrambles, and designed runs.
"""
from pathlib import Path

import pandas as pd

DATA = Path(__file__).parent / "data"

plays = pd.read_parquet(DATA / "qb_plays.parquet")
plays = plays[(plays.qb_kneel != 1) & (plays.qb_spike != 1) & (plays.play_type != "no_play")]
plays = plays[plays.drive.notna()]

KEYS = [
    "game_id", "game_date", "season", "week", "season_type", "qb_id", "qb_name",
    "rookie_class", "career_year", "team", "opponent", "home_away",
    "drive", "drive_result", "drive_start_yardline", "drive_plays", "drive_yards",
]
d = plays.groupby(KEYS, as_index=False, dropna=False).agg(
    qtr=("qtr", "first"),                     # quarter the QB's part of the drive began in
    qb_plays=("epa", "size"),
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
    qb_epa=("epa", "sum"),
)

count_cols = ["drive", "drive_plays", "drive_yards", "qb_plays", "dropbacks", "pass_attempts",
              "completions", "passing_yards", "air_yards", "pass_tds", "interceptions", "sacks",
              "scrambles", "rush_attempts", "rushing_yards", "rush_tds", "fumbles_lost",
              "turnovers", "shotgun_plays"]
d[count_cols] = d[count_cols].astype("Int64")
d["qb_epa"] = d.qb_epa.round(3)
# air yards are not tracked before 2006: leave blank rather than 0
d["air_yards"] = d.air_yards.where(d.season >= 2006)
# yards the offense had to go to score when the drive started (75 = own 25-yard line)
d = d.rename(columns={"drive_start_yardline": "start_yards_to_goal"})
d["start_yards_to_goal"] = d.start_yards_to_goal.astype("Int64")
d["quarter"] = d.qtr.map({1: "Q1", 2: "Q2", 3: "Q3", 4: "Q4"}).fillna("OT")
d["career_stage"] = d.career_year.map(lambda n: "Rookie" if n == 1 else f"Year {n}")
d["scoring_drive"] = d.drive_result.isin(["Touchdown", "Field goal"]).astype(int)

# game outcome from the QB's team's side, and whether he was the listed starting QB.
# These repeat on every drive of the game, so count win records per game, not per row.
games = pd.read_csv(Path(__file__).parent / "raw" / "games.csv",
                    usecols=["game_id", "home_team", "home_score", "away_score",
                             "home_qb_id", "away_qb_id"])
d = d.merge(games, on="game_id", how="left", validate="m:1")
home = d.team == d.home_team
d["team_score"] = d.home_score.where(home, d.away_score).astype(int)
d["opp_score"] = d.away_score.where(home, d.home_score).astype(int)
d["game_result"] = "Tie"
d.loc[d.team_score > d.opp_score, "game_result"] = "Win"
d.loc[d.team_score < d.opp_score, "game_result"] = "Loss"
d["started_game"] = (d.qb_id == d.home_qb_id.where(home, d.away_qb_id)).astype(int)

ORDER = [
    "game_id", "game_date", "season", "week", "season_type", "qb_id", "qb_name",
    "rookie_class", "career_year", "career_stage", "team", "opponent", "home_away",
    "started_game", "game_result", "team_score", "opp_score", "quarter", "drive", "drive_result", "scoring_drive", "start_yards_to_goal",
    "drive_plays", "drive_yards",
    "qb_plays", "dropbacks", "pass_attempts", "completions", "passing_yards", "air_yards",
    "pass_tds", "interceptions", "sacks", "scrambles", "rush_attempts", "rushing_yards",
    "rush_tds", "fumbles_lost", "turnovers", "shotgun_plays", "qb_epa",
]
d = d[ORDER].sort_values(["game_date", "game_id", "drive", "qb_id"]).reset_index(drop=True)
d["game_date"] = d.game_date.dt.date
d.to_csv(DATA / "qb_drives.csv", index=False)
d.to_parquet(DATA / "qb_drives.parquet", index=False)

print("\n=== Requirement check ===")
print(f"Rows: {len(d):,}  (need >= 50,000)")
print(f"Columns: {d.shape[1]}  (need >= 8)")
print(f"Periods (seasons): {d.season.nunique()}  (need >= 5)")
print(f"Groups (QBs): {d.qb_id.nunique()}  (need >= 10)")
print(f"CSV size: {(DATA / 'qb_drives.csv').stat().st_size / 1e6:.1f} MB")
