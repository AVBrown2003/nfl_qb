"""Step 1: build the play-level dataset for the NFL QB rookie classes of 2000-2025.

One row = one play by a qualifying QB (a dropback, pass, sack, scramble, or designed QB run),
with the date it happened, the QB it belongs to, and the drive it was part of.

Qualifying QB = rookie season (first NFL season) in 2000 or later, and started 9+ regular-season
games (more than half a season) in at least one season through 2025. Every play of his career
through 2025 is kept, including seasons where he was a backup.

Source: nflverse (https://github.com/nflverse/nflverse-data), free, CC-BY 4.0.
"""
from pathlib import Path

import pandas as pd

RAW = Path(__file__).parent / "raw"
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)
FIRST, LAST = 2000, 2025  # first rookie class; last full season (2026 is still in progress)
HALF_SEASON = 9           # more than half of 16 (and of 17 since 2021)

# --- 1. Qualifying QBs ---------------------------------------------------------------------
# rookie season = first NFL season, from the nflverse players file
players = (pd.read_parquet(RAW / "players.parquet", columns=["gsis_id", "rookie_season", "display_name"])
           .rename(columns={"gsis_id": "qb_id"}).set_index("qb_id"))
rookie = players.rookie_season

# starters, from each game's listed starting QB
games = pd.read_csv(RAW / "games.csv")
reg = games[games.season.between(FIRST, LAST) & (games.game_type == "REG")]
starts = pd.concat([
    reg[["season", "home_qb_id"]].rename(columns={"home_qb_id": "qb_id"}),
    reg[["season", "away_qb_id"]].rename(columns={"away_qb_id": "qb_id"}),
])
starts_per_season = starts.groupby(["season", "qb_id"]).size()
starters = set(starts_per_season[starts_per_season >= HALF_SEASON].index.get_level_values("qb_id"))
qb_ids = {q for q in starters if rookie.get(q, 0) >= FIRST}
print(f"Qualifying QBs: {len(qb_ids)}")

# --- 2. Plays from play-by-play ------------------------------------------------------------
COLS = [
    "game_id", "game_date", "season", "week", "season_type", "home_team", "away_team",
    "posteam", "defteam", "qtr", "fixed_drive", "fixed_drive_result", "yardline_100",
    "down", "play_type", "shotgun",
    "qb_dropback", "pass_attempt", "complete_pass", "passing_yards", "air_yards",
    "pass_touchdown", "interception", "sack", "qb_scramble",
    "rush_attempt", "rushing_yards", "rush_touchdown",
    "fumble_lost", "fumbled_1_player_id",
    "passer_player_id", "rusher_player_id",
    "yards_gained", "epa", "two_point_attempt", "qb_spike", "qb_kneel",
]

frames, drive_frames = [], []
for year in range(FIRST, LAST + 1):
    pbp = pd.read_parquet(RAW / "pbp" / f"play_by_play_{year}.parquet", columns=COLS)

    # drive-level facts from every play on the drive (not only the QB's plays):
    # where it started, how many real plays it had, and how many yards it gained
    real = pbp[pbp.play_type.isin(["pass", "run"]) & pbp.fixed_drive.notna()]
    drive_frames.append(real.groupby(["game_id", "fixed_drive"], as_index=False).agg(
        drive_start_yardline=("yardline_100", "first"),
        drive_plays=("play_type", "size"),
        drive_yards=("yards_gained", "sum"),
    ))

    # the QB on the play: passer on dropbacks, rusher on QB runs
    pbp["qb_id"] = pbp.passer_player_id.fillna(pbp.rusher_player_id)
    # full name from the players file (play-by-play spells some names several ways, e.g. "D. Brees")
    pbp["qb_name"] = pbp.qb_id.map(players.display_name)
    pbp = pbp[pbp.qb_id.isin(qb_ids) & (pbp.two_point_attempt != 1)]
    frames.append(pbp)
    print(year, len(pbp))
plays = pd.concat(frames, ignore_index=True)
drives = pd.concat(drive_frames, ignore_index=True)

# --- 3. Tidy columns ------------------------------------------------------------------------
plays["game_date"] = pd.to_datetime(plays.game_date)
plays["home_away"] = (plays.posteam == plays.home_team).map({True: "Home", False: "Away"})
plays["season_type"] = plays.season_type.map({"REG": "Regular", "POST": "Playoffs"})
# turnover charged to the QB: an interception, or a fumble he lost
plays["qb_fumble_lost"] = ((plays.fumble_lost == 1) & (plays.fumbled_1_player_id == plays.qb_id)).astype(int)
plays["turnover"] = ((plays.interception == 1) | (plays.qb_fumble_lost == 1)).astype(int)
# how far into his career: 1 = rookie season
plays["rookie_class"] = plays.qb_id.map(rookie).astype(int)
plays["career_year"] = plays.season - plays.rookie_class + 1
plays = plays.merge(drives, on=["game_id", "fixed_drive"], how="left", validate="m:1")
plays = plays.rename(columns={"posteam": "team", "defteam": "opponent",
                              "fixed_drive": "drive", "fixed_drive_result": "drive_result"})

KEEP = [
    "game_id", "game_date", "season", "week", "season_type", "qb_id", "qb_name",
    "rookie_class", "career_year", "team", "opponent", "home_away",
    "qtr", "drive", "drive_result", "drive_start_yardline", "drive_plays", "drive_yards",
    "down", "play_type", "shotgun",
    "qb_dropback", "pass_attempt", "complete_pass", "passing_yards", "air_yards",
    "pass_touchdown", "interception", "sack", "qb_scramble",
    "rush_attempt", "rushing_yards", "rush_touchdown",
    "qb_fumble_lost", "turnover", "yards_gained", "epa", "qb_spike", "qb_kneel",
]
plays = plays[KEEP].sort_values(["game_date", "game_id", "drive", "qb_id"]).reset_index(drop=True)
plays.to_parquet(OUT / "qb_plays.parquet", index=False)
print(f"\nPlays: {len(plays):,}  QBs: {plays.qb_id.nunique()}")
