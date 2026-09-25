"""Step 1: build the event-level (play-level) dataset for NFL starting QBs, 2000-2025.

One row = one play by a qualifying QB (a dropback, pass, sack, scramble, or designed QB run),
with the date it happened and the QB it belongs to.

Qualifying QB = started 9+ regular-season games (more than half a season) in at least one
season from 2000 on. All of that QB's plays from 2000-2025 are kept, including seasons where
he was a backup, so the learning curve covers his whole career in the window.

Source: nflverse (https://github.com/nflverse/nflverse-data), free, CC-BY 4.0.
"""
from pathlib import Path

import pandas as pd

RAW = Path(__file__).parent / "raw"
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)
FIRST, LAST = 2000, 2025  # 2026 season is still in progress
HALF_SEASON = 9           # more than half of 16 (and of 17 since 2021)

# --- 1. Qualifying QBs from each game's listed starting QB --------------------------------
games = pd.read_csv(RAW / "games.csv")
games = games[games.season.between(FIRST, LAST)]
reg = games[games.game_type == "REG"]
starts = pd.concat([
    reg[["season", "home_qb_id"]].rename(columns={"home_qb_id": "qb_id"}),
    reg[["season", "away_qb_id"]].rename(columns={"away_qb_id": "qb_id"}),
])
starts_per_season = starts.groupby(["season", "qb_id"]).size()
qb_ids = set(starts_per_season[starts_per_season >= HALF_SEASON].index.get_level_values("qb_id"))
print(f"Qualifying QBs: {len(qb_ids)}")

# --- 2. Plays from play-by-play ------------------------------------------------------------
COLS = [
    "game_id", "game_date", "season", "week", "season_type", "home_team", "away_team",
    "posteam", "defteam", "qtr", "down", "play_type", "shotgun",
    "qb_dropback", "pass_attempt", "complete_pass", "passing_yards", "air_yards",
    "pass_touchdown", "interception", "sack", "qb_scramble",
    "rush_attempt", "rushing_yards", "rush_touchdown",
    "fumble_lost", "fumbled_1_player_id",
    "passer_player_id", "passer_player_name", "rusher_player_id", "rusher_player_name",
    "yards_gained", "epa", "two_point_attempt", "qb_spike", "qb_kneel",
]

frames = []
for year in range(FIRST, LAST + 1):
    pbp = pd.read_parquet(RAW / "pbp" / f"play_by_play_{year}.parquet", columns=COLS)
    # the QB on the play: passer on dropbacks, rusher on QB runs
    pbp["qb_id"] = pbp.passer_player_id.fillna(pbp.rusher_player_id)
    pbp["qb_name"] = pbp.passer_player_name.fillna(pbp.rusher_player_name)
    pbp = pbp[pbp.qb_id.isin(qb_ids) & (pbp.two_point_attempt != 1)]
    frames.append(pbp)
    print(year, len(pbp))
plays = pd.concat(frames, ignore_index=True)

# --- 3. Tidy columns ------------------------------------------------------------------------
plays["game_date"] = pd.to_datetime(plays.game_date)
plays["home_away"] = (plays.posteam == plays.home_team).map({True: "Home", False: "Away"})
plays["season_type"] = plays.season_type.map({"REG": "Regular", "POST": "Playoffs"})
# turnover charged to the QB: an interception, or a fumble he lost
plays["qb_fumble_lost"] = ((plays.fumble_lost == 1) & (plays.fumbled_1_player_id == plays.qb_id)).astype(int)
plays["turnover"] = ((plays.interception == 1) | (plays.qb_fumble_lost == 1)).astype(int)
plays = plays.rename(columns={"posteam": "team", "defteam": "opponent"})

KEEP = [
    "game_id", "game_date", "season", "week", "season_type", "qb_id", "qb_name",
    "team", "opponent", "home_away", "qtr", "down", "play_type", "shotgun",
    "qb_dropback", "pass_attempt", "complete_pass", "passing_yards", "air_yards",
    "pass_touchdown", "interception", "sack", "qb_scramble",
    "rush_attempt", "rushing_yards", "rush_touchdown",
    "qb_fumble_lost", "turnover", "yards_gained", "epa", "qb_spike", "qb_kneel",
]
plays = plays[KEEP].sort_values(["game_date", "game_id", "qb_id"]).reset_index(drop=True)
plays.to_parquet(OUT / "qb_plays.parquet", index=False)
plays.to_csv(OUT / "qb_plays.csv", index=False)

# --- 4. Check against the assignment requirements -------------------------------------------
print("\n=== Requirement check ===")
print(f"Rows: {len(plays):,}  (need >= 50,000)")
print(f"Columns: {plays.shape[1]}  (need >= 8)")
print(f"Periods (seasons): {plays.season.nunique()}  (need >= 5)")
print(f"Groups (QBs): {plays.qb_id.nunique()}  (need >= 10)")
print("Categoricals: season_type, team, opponent, home_away, play_type")
print("Numerics: passing_yards, pass_touchdown, turnover, rushing_yards, epa")
