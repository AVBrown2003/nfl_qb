"""Step 4: build data/careers.json for the career explorer on the report page.

One entry per QB with his full name, draft info, and one record per regular season: team, jersey
number, record, stats, and how each stat ranks against every starting season (8+ starts) in the
data. Also carries each team's jersey colors for that era, so the explorer can draw the jersey the
QB actually wore that year.

Jersey colors are approximate home-jersey colors, hand-entered below from each team's uniform
history (nflverse only has today's colors). Jersey numbers come from the nflverse season rosters.
Needs 03_analysis.py to have been run first (reads data/qb_seasons.csv).
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
RAW, DATA = ROOT / "raw", ROOT / "data"

# (first season, last season, jersey body, number fill, number outline) for each team's home jersey
JERSEYS = {
    "ARI": [(2000, 2099, "#97233F", "#FFFFFF", "#000000")],
    "ATL": [(2000, 2002, "#000000", "#FFFFFF", "#A71930"), (2003, 2019, "#A71930", "#FFFFFF", "#000000"),
            (2020, 2099, "#000000", "#FFFFFF", "#A71930")],
    "BAL": [(2000, 2099, "#241773", "#FFFFFF", "#9E7C0C")],
    "BUF": [(2000, 2010, "#0C2E82", "#FFFFFF", "#C60C30"), (2011, 2099, "#00338D", "#FFFFFF", "#C60C30")],
    "CAR": [(2000, 2099, "#101820", "#0085CA", "#BFC0BF")],
    "CHI": [(2000, 2099, "#0B162A", "#FFFFFF", "#E64100")],
    "CIN": [(2000, 2099, "#101820", "#FFFFFF", "#FB4F14")],
    "CLE": [(2000, 2099, "#311D00", "#FFFFFF", "#FF3C00")],
    "DAL": [(2000, 2099, "#FFFFFF", "#002244", "#B0B7BC")],
    "DEN": [(2000, 2011, "#002244", "#FFFFFF", "#FB4F14"), (2012, 2099, "#FB4F14", "#FFFFFF", "#002244")],
    "DET": [(2000, 2099, "#0076B6", "#FFFFFF", "#B0B7BC")],
    "GB":  [(2000, 2099, "#203731", "#FFFFFF", "#FFB612")],
    "HOU": [(2000, 2099, "#03202F", "#FFFFFF", "#A71930")],
    "IND": [(2000, 2099, "#002C5F", "#FFFFFF", "#A5ACAF")],
    "JAX": [(2000, 2012, "#006778", "#FFFFFF", "#101820"), (2013, 2020, "#101820", "#FFFFFF", "#D7A22A"),
            (2021, 2099, "#006778", "#FFFFFF", "#101820")],
    "KC":  [(2000, 2099, "#E31837", "#FFFFFF", "#101820")],
    "LA":  [(2000, 2019, "#002244", "#FFFFFF", "#B3995D"), (2020, 2099, "#003594", "#FFFFFF", "#FFD100")],
    "LAC": [(2000, 2018, "#002A5E", "#FFFFFF", "#FFC20E"), (2019, 2099, "#0080C6", "#FFFFFF", "#FFC20E")],
    "LV":  [(2000, 2099, "#000000", "#FFFFFF", "#A5ACAF")],
    "MIA": [(2000, 2099, "#008E97", "#FFFFFF", "#F58220")],
    "MIN": [(2000, 2099, "#4F2683", "#FFFFFF", "#FFC62F")],
    "NE":  [(2000, 2099, "#002244", "#FFFFFF", "#C60C30")],
    "NO":  [(2000, 2099, "#101820", "#D3BC8D", "#FFFFFF")],
    "NYG": [(2000, 2099, "#0B2265", "#FFFFFF", "#A71930")],
    "NYJ": [(2000, 2018, "#0C371D", "#FFFFFF", "#FFFFFF"), (2019, 2099, "#125740", "#FFFFFF", "#000000")],
    "PHI": [(2000, 2099, "#004C54", "#FFFFFF", "#000000")],
    "PIT": [(2000, 2099, "#101820", "#FFB612", "#FFFFFF")],
    "SEA": [(2000, 2011, "#34588F", "#FFFFFF", "#002244"), (2012, 2099, "#002244", "#FFFFFF", "#69BE28")],
    "SF":  [(2000, 2099, "#AA0000", "#FFFFFF", "#B3995D")],
    "TB":  [(2000, 2099, "#D50A0A", "#FFFFFF", "#34302B")],
    "TEN": [(2000, 2099, "#0C2340", "#FFFFFF", "#4B92DB")],
    "WAS": [(2000, 2099, "#5A1414", "#FFFFFF", "#FFB612")],
}
TEAM_NAMES = pd.read_csv(RAW / "teams_colors_logos.csv").set_index("team_abbr").team_name.to_dict()


def jersey(team, season):
    for first, last, body, num, trim in JERSEYS[team]:
        if first <= season <= last:
            return {"body": body, "number": num, "trim": trim}


# --- season table from step 3, plus yardage and TDs from the drive data ------------------------
qs = pd.read_csv(DATA / "qb_seasons.csv")
d = pd.read_parquet(DATA / "qb_drives.parquet")
d = d[d.season_type == "Regular"]
extra = d.groupby(["qb_id", "season"]).agg(
    games=("game_id", "nunique"), completions=("completions", "sum"),
    passing_yards=("passing_yards", "sum"), pass_tds=("pass_tds", "sum"),
    rushing_yards=("rushing_yards", "sum"), rush_tds=("rush_tds", "sum"), sacks=("sacks", "sum"),
).reset_index()
qs = qs.merge(extra, on=["qb_id", "season"])
qs["td_drive_pct"] = qs.td_drives / qs.drives
qs["int_pct"] = qs.interceptions / qs.pass_attempts
qs["yards_per_attempt"] = qs.passing_yards / qs.pass_attempts
qs["completion_pct"] = qs.completions / qs.pass_attempts

# jersey number that season (the number he wore most weeks)
rosters = pd.concat(pd.read_csv(RAW / "rosters" / f"roster_{y}.csv", usecols=["season", "gsis_id", "jersey_number"])
                    for y in range(2000, 2026))
number = (rosters.dropna().groupby(["gsis_id", "season"]).jersey_number
          .agg(lambda s: int(s.mode()[0])).rename("number"))
qs = qs.merge(number, left_on=["qb_id", "season"], right_index=True, how="left")

# rank each stat against every starting season (share of starting seasons this one beats)
pool = qs[qs.starting_season]
DIAL = {"win_pct": True, "epa_vs_league": True, "td_drive_pct": True,
        "yards_per_attempt": True, "int_pct": False}  # False = lower is better
for col, higher in DIAL.items():
    ref = pool[col].dropna().sort_values().to_numpy()
    def pct(v):
        if pd.isna(v):
            return None
        below = (ref < v).sum() if higher else (ref > v).sum()
        return round(below / len(ref), 3)
    qs[f"{col}_pctile"] = qs[col].map(pct)

players = pd.read_parquet(RAW / "players.parquet",
                          columns=["gsis_id", "display_name", "draft_round", "draft_pick", "college_name"])
players = players.set_index("gsis_id")

careers = []
for qb, x in qs.groupby("qb_id"):
    p = players.loc[qb]
    seasons = []
    for _, r in x.sort_values("season").iterrows():
        seasons.append({
            "season": int(r.season), "career_year": int(r.career_year), "team": r.team,
            "team_name": TEAM_NAMES[r.team], "number": None if pd.isna(r.number) else int(r.number),
            "jersey": jersey(r.team, r.season), "with_original_team": bool(r.with_original_team),
            "games": int(r.games), "starts": int(r.starts),
            "record": f"{r.wins}-{r.losses}" + (f"-{r.ties}" if r.ties else ""),
            "win_pct": None if pd.isna(r.win_pct) else round(r.win_pct, 3),
            "epa_vs_league": round(r.epa_vs_league, 3), "td_drive_pct": round(r.td_drive_pct, 3),
            "int_pct": None if pd.isna(r.int_pct) else round(r.int_pct, 4),
            "yards_per_attempt": None if pd.isna(r.yards_per_attempt) else round(r.yards_per_attempt, 2),
            "completion_pct": None if pd.isna(r.completion_pct) else round(r.completion_pct, 3),
            "passing_yards": int(r.passing_yards), "pass_tds": int(r.pass_tds),
            "interceptions": int(r.interceptions), "rushing_yards": int(r.rushing_yards),
            "rush_tds": int(r.rush_tds), "sacks": int(r.sacks), "drives": int(r.drives),
            "pctile": {k: None if pd.isna(r[f"{k}_pctile"]) else r[f"{k}_pctile"] for k in DIAL},
        })
    careers.append({
        "id": qb, "name": p.display_name, "rookie_class": int(x.rookie_class.iloc[0]),
        "original_team": x.original_team.iloc[0], "college": p.college_name,
        "draft": "Undrafted" if pd.isna(p.draft_round) else f"Round {int(p.draft_round)}, pick {int(p.draft_pick)}",
        "seasons": seasons,
    })
careers.sort(key=lambda c: c["name"].split()[-1])
(DATA / "careers.json").write_text(json.dumps(careers, separators=(",", ":")))
print(f"{len(careers)} QBs, {sum(len(c['seasons']) for c in careers)} seasons, "
      f"missing numbers: {qs.number.isna().sum()}, "
      f"{(DATA / 'careers.json').stat().st_size / 1e3:.0f} KB")
