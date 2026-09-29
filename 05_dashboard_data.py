"""Step 5: build the compact drive file that dashboard.html loads and computes on in the browser.

Same rows as data/qb_drives.csv (one QB on one drive), trimmed to the columns the dashboard
filters and measures on, with short codes so the file stays small enough for a phone:
  data/dashboard_drives.csv  one row per QB per drive
  data/dashboard_qbs.csv     one row per QB: the code used in the drive file, name, rookie class

Codes in dashboard_drives.csv:
  qb        QB code (see dashboard_qbs.csv)
  season    NFL season (2000-2025)
  po        1 = playoff game, 0 = regular season
  cy        career year (1 = rookie season)
  team/opp  team abbreviations
  home      1 = home game
  start     1 = the QB was his team's listed starter that game
  res       game result for the QB's team: W, L or T
  qtr       quarter the drive started in: 1-4, 5 = overtime
  dr        drive result: TD, FG, PUNT, TO (turnover), DOWNS, MISS (missed FG), HALF (end of half),
            OPPTD (opponent scored on the drive), SAF (safety)
  ytg       yards to the end zone when the drive started (75 = own 25)
  yds       drive yards (whole drive), pyds / ryds = the QB's passing / rushing yards
  tds       the QB's passing + rushing TDs on the drive, to = the QB's turnovers (INT + fumbles lost)
  epa       the QB's total EPA on the drive (raw, not era-adjusted)
"""
from pathlib import Path

import pandas as pd

DATA = Path(__file__).parent / "data"

DRIVE_CODES = {
    "Touchdown": "TD", "Field goal": "FG", "Punt": "PUNT", "Turnover": "TO", "Turnover on downs": "DOWNS",
    "Missed field goal": "MISS", "End of half": "HALF", "Opp touchdown": "OPPTD", "Safety": "SAF",
}

d = pd.read_parquet(DATA / "qb_drives.parquet")

qbs = (d.groupby(["qb_id", "qb_name", "rookie_class"], as_index=False).size()
         .sort_values(["qb_name", "rookie_class"]).reset_index(drop=True))
assert qbs.qb_id.is_unique, "a QB id appears under two names"
qbs["qb"] = qbs.index
code = qbs.set_index("qb_id").qb

out = pd.DataFrame({
    "qb": d.qb_id.map(code),
    "season": d.season,
    "po": (d.season_type == "Playoffs").astype(int),
    "cy": d.career_year,
    "team": d.team,
    "opp": d.opponent,
    "home": (d.home_away == "Home").astype(int),
    "start": d.started_game,
    "res": d.game_result.str[0],
    "qtr": d.quarter.map({"Q1": 1, "Q2": 2, "Q3": 3, "Q4": 4, "OT": 5}),
    "dr": d.drive_result.map(DRIVE_CODES),
    "ytg": d.start_yards_to_goal,
    "yds": d.drive_yards,
    "pyds": d.passing_yards,
    "ryds": d.rushing_yards,
    "tds": d.pass_tds + d.rush_tds,
    "to": d.turnovers,
    "epa": d.qb_epa.round(2),
})
assert out.notna().all().all(), out.isna().sum()[lambda s: s > 0]
assert len(out) == len(d)

out.to_csv(DATA / "dashboard_drives.csv", index=False)
qbs[["qb", "qb_name", "rookie_class"]].rename(columns={"qb_name": "name"}).to_csv(DATA / "dashboard_qbs.csv", index=False)
print(f"{len(out):,} drives, {len(qbs)} QBs -> {(DATA / 'dashboard_drives.csv').stat().st_size / 1e6:.1f} MB")
