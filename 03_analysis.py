"""Step 3: compute every number and chart in the report.

Thesis: the QB learning curve is longer than NFL teams are willing to wait.

Reads data/qb_drives.parquet (plus the raw nflverse play-by-play for league averages) and writes:
  data/qb_seasons.csv  one row per QB per regular season, the table most findings are built on
  data/findings.json   the headline numbers and the data behind each of the 10 report charts

Definitions used throughout (all regular season only):
  starting season   8+ starts in a season
  win %             (wins + half of ties) / starts, counting only games the QB started
  EPA vs league     the QB's EPA per play minus that season's average EPA per play of every NFL QB
                    (so seasons from different eras compare fairly)
  original team     the first team the QB played for (handles draft-day trades like Rivers/Manning)
"""
import json
from math import erf, sqrt
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
RAW, DATA = ROOT / "raw", ROOT / "data"
STARTER = 8        # starts needed for a "starting season"
FULL_CLASS = 2018  # classes through 2018 have had at least 8 seasons by 2025
FINDINGS = {}


def p_two_sided(x1, n1, x2, n2):
    """Two-proportion z-test: is rate x1/n1 different from x2/n2?"""
    p = (x1 + x2) / (n1 + n2)
    z = (x1 / n1 - x2 / n2) / sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    return 1 - erf(abs(z) / sqrt(2))


def counts(s):
    """Value counts as {career year: number of QBs}, in order."""
    return {int(k): int(v) for k, v in s.value_counts().sort_index().items()}


# --- League-average QB EPA per play, each season (every QB in the NFL) ----------------------
qb_ids = set(pd.read_parquet(RAW / "players.parquet", columns=["gsis_id", "position"])
             .query("position == 'QB'").gsis_id)
lg = {}
for year in range(2000, 2026):
    p = pd.read_parquet(RAW / "pbp" / f"play_by_play_{year}.parquet",
                        columns=["season_type", "play_type", "passer_player_id", "rusher_player_id",
                                 "qb_kneel", "qb_spike", "two_point_attempt", "epa"])
    qb = p.passer_player_id.fillna(p.rusher_player_id)
    p = p[(p.season_type == "REG") & qb.isin(qb_ids) & p.play_type.isin(["pass", "run"])
          & (p.qb_kneel != 1) & (p.qb_spike != 1) & (p.two_point_attempt != 1)]
    lg[year] = p.epa.mean()
lg = pd.Series(lg)

# --- One row per QB per regular season --------------------------------------------------------
d = pd.read_parquet(DATA / "qb_drives.parquet")
d = d[d.season_type == "Regular"]

games = d.drop_duplicates(["game_id", "qb_id"])
rec = games[games.started_game == 1].groupby(["qb_id", "season"]).agg(
    starts=("game_id", "size"),
    wins=("game_result", lambda s: (s == "Win").sum()),
    losses=("game_result", lambda s: (s == "Loss").sum()),
    ties=("game_result", lambda s: (s == "Tie").sum()),
)
stats = d.groupby(["qb_id", "qb_name", "rookie_class", "career_year", "season"]).agg(
    drives=("drive", "size"), plays=("qb_plays", "sum"), epa=("qb_epa", "sum"),
    pass_attempts=("pass_attempts", "sum"), interceptions=("interceptions", "sum"),
    turnovers=("turnovers", "sum"), td_drives=("drive_result", lambda s: (s == "Touchdown").sum()),
    scoring_drives=("scoring_drive", "sum"),
).reset_index()
# his team that season = the team he ran the most drives for
team = (d.groupby(["qb_id", "season", "team"]).size().rename("n").reset_index()
        .sort_values("n").drop_duplicates(["qb_id", "season"], keep="last").drop(columns="n"))

qs = stats.merge(team, on=["qb_id", "season"]).merge(rec.reset_index(), on=["qb_id", "season"], how="left")
qs[["starts", "wins", "losses", "ties"]] = qs[["starts", "wins", "losses", "ties"]].fillna(0).astype(int)
qs["win_pct"] = (qs.wins + 0.5 * qs.ties) / qs.starts.where(qs.starts > 0)
qs["epa_per_play"] = qs.epa / qs.plays
qs["league_epa_per_play"] = qs.season.map(lg)
qs["epa_vs_league"] = qs.epa_per_play - qs.league_epa_per_play
first_team = qs.sort_values("season").drop_duplicates("qb_id").set_index("qb_id").team
qs["original_team"] = qs.qb_id.map(first_team)
qs["with_original_team"] = qs.team == qs.original_team
qs["starting_season"] = qs.starts >= STARTER
qs = qs.sort_values(["rookie_class", "qb_name", "season"]).reset_index(drop=True)
qs.round(4).to_csv(DATA / "qb_seasons.csv", index=False)

S = qs[qs.starting_season]


def epa_vs_league(x):
    """Pooled EPA per play vs league for a group of QB-seasons (weighted by plays)."""
    return x.epa.sum() / x.plays.sum() - (x.plays * x.league_epa_per_play).sum() / x.plays.sum()


def group_summary(x):
    return {"qbs": int(x.qb_id.nunique()),
            "epa_vs_league": round(float(epa_vs_league(x)), 3),
            "win_pct": round(float((x.wins.sum() + 0.5 * x.ties.sum()) / x.starts.sum()), 3),
            "int_pct": round(float(x.interceptions.sum() / x.pass_attempts.sum()), 4),
            "turnovers_per_100_drives": round(float(100 * x.turnovers.sum() / x.drives.sum()), 1)}


# --- 1. Turnovers don't fall until Year 6 ---------------------------------------------------------
t = qs[qs.career_year <= 10].groupby("career_year")[["drives", "turnovers", "interceptions", "pass_attempts"]].sum()
rookie = t.loc[1]
FINDINGS["1_turnovers"] = [{
    "career_year": int(y),
    "int_pct": round(r.interceptions / r.pass_attempts, 4),
    "int_pct_ci95": round(1.96 * sqrt((r.interceptions / r.pass_attempts) * (1 - r.interceptions / r.pass_attempts) / r.pass_attempts), 4),
    "turnovers_per_100_drives": round(100 * r.turnovers / r.drives, 1),
    "p_vs_rookie": None if y == 1 else round(p_two_sided(r.interceptions, r.pass_attempts,
                                                         rookie.interceptions, rookie.pass_attempts), 4),
} for y, r in t.iterrows()]

# --- 2. QBs typically have their best season in Year 5 ------------------------------------------
long_careers = set(qs[qs.career_year >= 8].qb_id)
pool = S[S.qb_id.isin(long_careers) & (S.rookie_class <= FULL_CLASS)]
best = pool.loc[pool.groupby("qb_id").epa_vs_league.idxmax()]
FINDINGS["2_best_season"] = {
    "qbs": len(best), "median_year": float(best.career_year.median()),
    "share_year5_plus": round((best.career_year >= 5).mean(), 3),
    "share_year6_plus": round((best.career_year >= 6).mean(), 3),
    "by_year": counts(best.career_year),
}

# --- 3. A third of QBs who become above average don't get there until Year 4+ --------------------
pool = S[S.rookie_class <= FULL_CLASS]
first_good = pool[pool.epa_vs_league > 0].groupby("qb_id").career_year.min()
FINDINGS["3_first_above_average"] = {
    "qbs_with_starting_season": int(pool.qb_id.nunique()), "ever_above_average": len(first_good),
    "never": int(pool.qb_id.nunique() - len(first_good)),
    "share_year4_plus": round((first_good >= 4).mean(), 3),
    "share_year5_plus": round((first_good >= 5).mean(), 3),
    "by_year": counts(first_good),
}

# --- 4. Rookie to Year 2 is the biggest jump, but not the peak ---------------------------------
# same QBs throughout: everyone who started 8+ games in Year 5 (classes that have reached Year 5)
cohort = set(S[(S.career_year == 5) & (S.rookie_class <= 2021)].qb_id)
c = qs[qs.qb_id.isin(cohort) & (qs.career_year <= 10)]
level = [{"career_year": int(y), **group_summary(x)} for y, x in c.groupby("career_year")]
s8 = S.set_index(["qb_id", "career_year"]).epa_vs_league
prev = s8.rename(index=lambda y: y + 1, level=1)
change = (s8 - prev).dropna().reset_index(name="change")
change = change[change.career_year <= 10]
jumps = [{"from_year": int(y - 1), "to_year": int(y), "pairs": len(x),
          "avg_change": round(x.change.mean(), 3), "share_improved": round((x.change > 0).mean(), 3)}
         for y, x in change.groupby("career_year")]
FINDINGS["4_jump_vs_peak"] = {"cohort_qbs": len(cohort), "level_by_year": level, "year_over_year": jumps}

# --- 5, 6, 7. How long the original team waits -----------------------------------------------------
orig = S[S.with_original_team & (S.rookie_class <= FULL_CLASS)]
still_there_2025 = set(qs[(qs.season == 2025) & qs.with_original_team & qs.starting_season].qb_id)
last_year = orig.groupby("qb_id").career_year.max()
ended = last_year[~last_year.index.isin(still_there_2025)]
seasons_given = orig.groupby("qb_id").size()[ended.index]
FINDINGS["5_teams_move_on"] = {
    "qbs": len(ended), "median_last_year": float(ended.median()),
    "share_done_by_year4": round((ended <= 4).mean(), 3),
    "share_done_by_year5": round((ended <= 5).mean(), 3),
    "by_year": counts(ended),
}
early = set(S[(S.career_year <= 2) & (S.rookie_class <= FULL_CLASS)].qb_id)
FINDINGS["6_still_starting"] = {"qbs": len(early), "by_year": [{
    "career_year": y,
    "share_starting": round(S[(S.career_year == y) & S.qb_id.isin(early)].qb_id.nunique() / len(early), 3),
    "share_starting_for_original_team": round(
        S[(S.career_year == y) & S.qb_id.isin(early) & S.with_original_team].qb_id.nunique() / len(early), 3),
} for y in range(1, 11)]}
FINDINGS["7_seasons_given"] = {"qbs": len(seasons_given), "most_common": int(seasons_given.mode()[0]),
                               "share_one_season": round((seasons_given == 1).mean(), 3),
                               "by_seasons": counts(seasons_given)}

# --- 8. Late bloomers: best season after leaving the original team -----------------------------
multi = S.groupby("qb_id").filter(lambda x: x.with_original_team.any() and (~x.with_original_team).any())
bloomers = []
for qb, x in multi.groupby("qb_id"):
    b = x.loc[x.epa_vs_league.idxmax()]
    if not b.with_original_team:
        bloomers.append({
            "qb": b.qb_name, "rookie_class": int(b.rookie_class), "original_team": b.original_team,
            "last_year_with_original": int(x[x.with_original_team].career_year.max()),
            "best_with_original": round(x[x.with_original_team].epa_vs_league.max(), 3),
            "best_team": b.team, "best_season": int(b.season), "best_career_year": int(b.career_year),
            "best_epa_vs_league": round(b.epa_vs_league, 3),
            "record": f"{b.wins}-{b.losses}" + (f"-{b.ties}" if b.ties else ""),
        })
bloomers.sort(key=lambda r: -r["best_epa_vs_league"])
FINDINGS["8_late_bloomers"] = {"multi_team_qbs": int(multi.qb_id.nunique()), "count": len(bloomers),
                               "qbs": bloomers}

# --- 9 and 10. Kept vs let go -------------------------------------------------------------------
early_orig = S[S.with_original_team & (S.career_year <= 3) & (S.rookie_class <= FULL_CLASS)]
ids = set(early_orig.qb_id)
kept = set(S[S.with_original_team & (S.career_year >= 5) & S.qb_id.isin(ids)].qb_id)
let_go = ids - kept
early_epa = early_orig.groupby("qb_id").apply(epa_vs_league, include_groups=False)
below = set(early_epa[early_epa < 0].index)

kept_below = []
for qb in sorted(kept & below):
    x = S[S.qb_id == qb]
    kept_below.append({"qb": x.qb_name.iloc[0], "rookie_class": int(x.rookie_class.iloc[0]),
                       "years_1_3": round(epa_vs_league(x[x.career_year <= 3]), 3),
                       "year_4_plus": round(epa_vs_league(x[x.career_year >= 4]), 3)})
FINDINGS["9_patience"] = {
    "kept_below_average_early": {"years_1_3": group_summary(early_orig[early_orig.qb_id.isin(kept & below)]),
                                 "year_4_plus": group_summary(S[S.qb_id.isin(kept & below) & (S.career_year >= 4)])},
    "let_go_below_average_early": {"years_1_3": group_summary(early_orig[early_orig.qb_id.isin(let_go & below)])},
    "qbs": kept_below,
}
elsewhere = S[S.qb_id.isin(let_go) & ~S.with_original_team]
FINDINGS["10_teams_mostly_right"] = {
    "kept_years_1_3": group_summary(early_orig[early_orig.qb_id.isin(kept)]),
    "let_go_years_1_3": group_summary(early_orig[early_orig.qb_id.isin(let_go)]),
    "let_go_later_elsewhere": group_summary(elsewhere),
}

# --- Headline numbers --------------------------------------------------------------------------
FINDINGS["headline"] = {
    "qbs": int(d.qb_id.nunique()), "drives": int(len(pd.read_parquet(DATA / "qb_drives.parquet"))),
    "median_best_season_year": FINDINGS["2_best_season"]["median_year"],
    "share_teams_done_by_year4": FINDINGS["5_teams_move_on"]["share_done_by_year4"],
    "late_bloomers": f"{len(bloomers)} of {FINDINGS['8_late_bloomers']['multi_team_qbs']}",
}
FINDINGS["definitions"] = {"starting_season_min_starts": STARTER, "full_class_through": FULL_CLASS,
                           "league_epa_per_play": {int(k): round(v, 4) for k, v in lg.items()}}

(DATA / "findings.json").write_text(json.dumps(FINDINGS, indent=2))

# --- Print a summary --------------------------------------------------------------------------
f = FINDINGS
print(f"QB-seasons: {len(qs):,} ({len(S):,} starting seasons)")
print("1  INT% by year:", {r['career_year']: f"{r['int_pct']:.2%}" for r in f['1_turnovers']},
      f"| Year 6 vs rookie p={f['1_turnovers'][5]['p_vs_rookie']}")
print(f"2  best season: median Year {f['2_best_season']['median_year']:.0f}, "
      f"{f['2_best_season']['share_year5_plus']:.0%} in Year 5+ ({f['2_best_season']['qbs']} QBs)")
print(f"3  first above-average season in Year 4+: {f['3_first_above_average']['share_year4_plus']:.0%}")
print("4  EPA vs league, same", f['4_jump_vs_peak']['cohort_qbs'], "QBs:",
      {r['career_year']: r['epa_vs_league'] for r in f['4_jump_vs_peak']['level_by_year']})
print(f"5  original team done by Year 4: {f['5_teams_move_on']['share_done_by_year4']:.0%} "
      f"(median Year {f['5_teams_move_on']['median_last_year']:.0f})")
print(f"6  still starting for original team in Year 5: "
      f"{f['6_still_starting']['by_year'][4]['share_starting_for_original_team']:.0%}")
print(f"7  most common seasons given: {f['7_seasons_given']['most_common']} "
      f"({f['7_seasons_given']['share_one_season']:.0%})")
print(f"8  late bloomers: {f['headline']['late_bloomers']}")
print("9  kept + below avg early:", f['9_patience']['kept_below_average_early'])
print("10", f['10_teams_mostly_right'])
