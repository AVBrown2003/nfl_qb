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
  big 2nd contract  a contract after the rookie deal worth 10%+ of the salary cap per year
                    (contracts from nflverse / OverTheCap, raw/historical_contracts.parquet)
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
    scoring_drives=("scoring_drive", "sum"), games=("game_id", "nunique"), completions=("completions", "sum"),
    passing_yards=("passing_yards", "sum"), pass_tds=("pass_tds", "sum"),
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


# --- 1. Turnovers don't fall until Year 6 (the report charts turnovers per 100 drives) ---------------------------------------------------------
t = qs[qs.career_year <= 10].groupby("career_year")[["drives", "turnovers", "interceptions", "pass_attempts"]].sum()
rookie = t.loc[1]
FINDINGS["1_turnovers"] = [{
    "career_year": int(y),
    "int_pct": round(r.interceptions / r.pass_attempts, 4),
    "int_pct_ci95": round(1.96 * sqrt((r.interceptions / r.pass_attempts) * (1 - r.interceptions / r.pass_attempts) / r.pass_attempts), 4),
    "turnovers_per_100_drives": round(100 * r.turnovers / r.drives, 1),
    "turnovers_ci95": round(100 * 1.96 * sqrt(r.turnovers) / r.drives, 2),
    "p_vs_rookie_turnovers": None if y == 1 else round(p_two_sided(r.turnovers, r.drives,
                                                                   rookie.turnovers, rookie.drives), 4),
    "p_vs_rookie": None if y == 1 else round(p_two_sided(r.interceptions, r.pass_attempts,
                                                         rookie.interceptions, rookie.pass_attempts), 4),
} for y, r in t.iterrows()]

# --- 2. Best seasons in Year 5+ came from early write-offs and understudies ---------------------
long_careers = set(qs[qs.career_year >= 8].qb_id)
pool = S[S.qb_id.isin(long_careers) & (S.rookie_class <= FULL_CLASS)]
best = pool.loc[pool.groupby("qb_id").epa_vs_league.idxmax()]
# how each QB looked early: pooled EPA vs league over his starting seasons in Years 1-3 (any team).
#   write-off  = started in Years 1-3 and was below league average
#   understudy = no starting season in Years 1-3 (waiting behind a veteran, like Rodgers behind Favre)
#   strong     = started in Years 1-3 and was at or above league average
early_all = (S[(S.career_year <= 3) & (S.rookie_class <= FULL_CLASS)]
             .groupby("qb_id").apply(epa_vs_league, include_groups=False))
best["early"] = best.qb_id.map(early_all)
best["profile"] = "strong"
best.loc[best.early < 0, "profile"] = "writeoff"
best.loc[best.early.isna(), "profile"] = "understudy"
best["writeoff"] = best.profile != "strong"
late = best[best.career_year >= 5]
FINDINGS["2_best_season"] = {
    "qbs": len(best), "median_year": float(best.career_year.median()),
    "share_year5_plus": round((best.career_year >= 5).mean(), 3),
    "share_year6_plus": round((best.career_year >= 6).mean(), 3),
    "late_breakouts": len(late), "late_writeoffs": int(late.writeoff.sum()),
    "late_below_average_early": int((late.early < 0).sum()), "late_not_starting_early": int(late.early.isna().sum()),
    "by_year": counts(best.career_year),
    "by_year_detail": {int(y): {k: sorted(x[x.profile == k].qb_name) for k in ["writeoff", "understudy", "strong"]}
                       for y, x in best.groupby("career_year")},
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
    "names_by_year": {int(y): sorted(qs.drop_duplicates("qb_id").set_index("qb_id").qb_name[g.index])
                      for y, g in first_good.groupby(first_good)},
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
qb_name = qs.drop_duplicates("qb_id").set_index("qb_id").qb_name
FINDINGS["6_seasons_given"] = {"qbs": len(seasons_given), "most_common": int(seasons_given.mode()[0]),
                               "share_one_season": round((seasons_given == 1).mean(), 3),
                               "by_seasons": counts(seasons_given),
                               "names_by_seasons": {int(n): sorted(qb_name[g.index])
                                                    for n, g in seasons_given.groupby(seasons_given)}}

# --- 7. Money: the rookie-deal clock, the price of a 2nd contract, and who gets paid -------------
# Rookie classes 2011 on only: the 2011 labor deal set today's rookie wage scale (4-year deals plus a
# 5th-year option for 1st-rounders), and contract records before about 2010 are incomplete.
CONTRACT_FROM = 2011
teams_file = pd.read_csv(RAW / "teams_colors_logos.csv")
nick = {**dict(zip(teams_file.team_nick, teams_file.team_abbr)), **{a: a for a in teams_file.team_abbr},
        "Redskins": "WAS", "Commanders": "WAS", "Football Team": "WAS", "OAK": "LV", "SD": "LAC", "STL": "LA", "LAR": "LA"}
info = qs.drop_duplicates("qb_id").set_index("qb_id")[["rookie_class", "original_team"]]
con = pd.read_parquet(RAW / "historical_contracts.parquet").drop(columns=["draft_round"])
con = con[(con.position == "QB") & con.gsis_id.isin(info.index) & (con.year_signed <= 2025)].copy()
# a traded contract lists every team, e.g. "CAR/NYJ"
relocated = {"OAK": "LV", "SD": "LAC", "STL": "LA", "LAR": "LA"}   # nicknames map to old codes in the team file
con["teams"] = con.team.map(lambda t: [relocated.get(nick.get(x.strip(), x.strip()), nick.get(x.strip(), x.strip()))
                                       for x in str(t).split("/")])
con = con.join(info, on="gsis_id")
con["career_year"] = con.year_signed - con.rookie_class + 1
con["with_original_team"] = con.apply(lambda r: r.original_team in r.teams, axis=1)
con = con.sort_values(["gsis_id", "year_signed"])
players_draft = (pd.read_parquet(RAW / "players.parquet", columns=["gsis_id", "draft_round", "draft_pick"])
                 .set_index("gsis_id"))
mc = con[con.rookie_class >= CONTRACT_FROM]
rookie_deals = mc.groupby("gsis_id").head(1).set_index("gsis_id").join(players_draft)  # first contract = rookie deal
big = mc[(mc.career_year > 1) & (mc.apy_cap_pct >= 0.10)]
own_big = big[big.with_original_team].groupby("gsis_id").head(1)                         # first big deal from his own team
windows = [(2014, 2016), (2017, 2019), (2020, 2022), (2023, 2025)]
# who gets paid: original-team starters in Years 1-3, classes 2011-2021 (they have had time to reach a 2nd deal)
paid_pool = S[S.with_original_team & (S.career_year <= 3) & S.rookie_class.between(CONTRACT_FROM, 2021)]
pp = pd.DataFrame({"early": paid_pool.groupby("qb_id").apply(epa_vs_league, include_groups=False)}).join(players_draft)
pp["paid"] = pp.index.isin(set(own_big.gsis_id))


def paid_row(mask):
    x = pp[mask]
    return {"qbs": len(x), "paid": int(x.paid.sum()), "names_paid": sorted(qb_name[x[x.paid].index]),
            "names_not_paid": sorted(qb_name[x[~x.paid].index])}


all_teams = sorted(teams_file[~teams_file.team_abbr.isin(["OAK", "SD", "STL", "LAR"])].team_abbr)
FINDINGS["7_contracts"] = {
    "from_class": CONTRACT_FROM,
    "rookie_deal_cap_pct": {
        "round_1": round(float(rookie_deals[rookie_deals.draft_round == 1].apy_cap_pct.median()), 3),
        "round_2": round(float(rookie_deals[rookie_deals.draft_round == 2].apy_cap_pct.median()), 3),
        "round_3_plus": round(float(rookie_deals[rookie_deals.draft_round.fillna(8) >= 3].apy_cap_pct.median()), 3)},
    "second_deals": len(own_big),
    "signed_career_year": counts(own_big.career_year),
    "signed_by_year4": int((own_big.career_year <= 4).sum()),
    "price_by_window": [{"from": a, "to": b, "deals": int(own_big.year_signed.between(a, b).sum()),
                         "median_cap_pct": round(float(own_big[own_big.year_signed.between(a, b)].apy_cap_pct.median()), 3)}
                        for a, b in windows],
    "deals": [{"qb": qb_name[r.gsis_id], "team": r.original_team, "year_signed": int(r.year_signed),
               "career_year": int(r.career_year), "years": float(r.years), "value": round(float(r.value), 1),
               "cap_pct": round(float(r.apy_cap_pct), 3), "guaranteed": round(float(r.guaranteed), 1)}
              for r in own_big.itertuples()],
    "who_paid": {"above_average_early": paid_row(pp.early >= 0), "below_average_early": paid_row(pp.early < 0),
                 "round_1": paid_row(pp.draft_round == 1), "later_rounds": paid_row(pp.draft_round.fillna(8) > 1)},
    "teams": {t: sorted(qb_name[own_big[own_big.original_team == t].gsis_id]) for t in all_teams},
}

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

# --- 9. Box scores: early strugglers who kept starting caught up ----------------------------------
later_starters = set(S[(S.career_year >= 4) & (S.rookie_class <= FULL_CLASS)].qb_id)
box_groups = {"strugglers": set(early_all[early_all < 0].index) & later_starters,
              "good_early": set(early_all[early_all >= 0].index) & later_starters}


def box(x):
    return {"qbs": int(x.qb_id.nunique()),
            "completion_pct": round(float(x.completions.sum() / x.pass_attempts.sum()), 4),
            "yards_per_game": round(float(x.passing_yards.sum() / x.games.sum()), 1),
            "tds_per_game": round(float(x.pass_tds.sum() / x.games.sum()), 3)}


FINDINGS["9_box_scores"] = {g: {
    "years_1_3": box(S[S.qb_id.isin(ids) & (S.career_year <= 3)]),
    "year_4_plus": box(S[S.qb_id.isin(ids) & (S.career_year >= 4)]),
    "by_year": [{"career_year": int(y), **box(x)}
                for y, x in S[S.qb_id.isin(ids) & (S.career_year <= 8)].groupby("career_year")],
    "names": sorted(qb_name[list(ids)]),
} for g, ids in box_groups.items()}

# --- 10. Counterpoint: most early strugglers never become above average ------------------------
later = S[(S.career_year >= 4) & (S.rookie_class <= FULL_CLASS)]
later_good = set(later[later.epa_vs_league > 0].qb_id)
later_any = set(later.qb_id)
def outcomes(ids):
    ids = set(ids)
    return {"qbs": len(ids), "above_average_later": len(ids & later_good),
            "more_starts_never_above": len((ids & later_any) - later_good),
            "no_more_starting_seasons": len(ids - later_any)}
rounds = players_draft.draft_round.reindex(early_all.index).fillna(8)  # undrafted counted as round 8
strugglers = early_all[early_all < 0]


def draft_group(lo, hi):
    ids = strugglers.index[rounds[strugglers.index].between(lo, hi)]
    o = outcomes(ids)
    o["names_above_later"] = sorted(qb_name[list(set(ids) & later_good)])
    o["names_no_more_starts"] = sorted(qb_name[list(set(ids) - later_any)])
    return o


FINDINGS["10_early_strugglers"] = {
    "below_average_early": outcomes(early_all[early_all < 0].index),
    "above_average_early": outcomes(early_all[early_all >= 0].index),
    "strugglers_by_draft": {"round_1": draft_group(1, 1), "rounds_2_3": draft_group(2, 3),
                            "round_4_plus": draft_group(4, 8)},
}

# --- Headline numbers --------------------------------------------------------------------------
FINDINGS["headline"] = {
    "qbs": int(d.qb_id.nunique()), "drives": int(len(pd.read_parquet(DATA / "qb_drives.parquet"))),
    "median_best_season_year": FINDINGS["2_best_season"]["median_year"],
    "share_teams_done_by_year4": FINDINGS["5_teams_move_on"]["share_done_by_year4"],
    "late_bloomers": f"{len(bloomers)} of {FINDINGS['8_late_bloomers']['multi_team_qbs']}",
    "late_breakout_writeoffs": f"{int(late.writeoff.sum())} of {len(late)}",
}
FINDINGS["definitions"] = {"starting_season_min_starts": STARTER, "full_class_through": FULL_CLASS,
                           "league_epa_per_play": {int(k): round(v, 4) for k, v in lg.items()}}

# --- Per-QB values for the "look up a quarterback" menus on each finding ------------------------
names = qs.drop_duplicates("qb_id").set_index("qb_id")
per_qb = {}
for qb, x in qs.groupby("qb_id"):
    xs = x[x.starting_season]
    xo = xs[xs.with_original_team]
    cls = int(x.rookie_class.iloc[0])
    b = xs.loc[xs.epa_vs_league.idxmax()] if len(xs) else None
    after = xs[~xs.with_original_team]
    ba = after.loc[after.epa_vs_league.idxmax()] if len(after) else None
    e, l = xs[xs.career_year <= 3], xs[xs.career_year >= 4]
    per_qb[qb] = {
        "name": names.qb_name[qb], "rookie_class": cls, "original_team": names.original_team[qb],
        "full_class": cls <= FULL_CLASS, "long_career": qb in long_careers,
        "seasons": [[int(r.career_year), int(r.season), r.team, int(r.starts), int(r.turnovers), int(r.drives),
                     round(float(r.epa_vs_league), 3), bool(r.with_original_team)] for r in x.itertuples()],
        "best": None if b is None else {"career_year": int(b.career_year), "season": int(b.season), "team": b.team,
                                        "epa_vs_league": round(float(b.epa_vs_league), 3)},
        "first_above": None if not (xs.epa_vs_league > 0).any() else int(xs[xs.epa_vs_league > 0].career_year.min()),
        "last_original_start": None if xo.empty else int(xo.career_year.max()),
        "original_starting_seasons": int(len(xo)),
        "still_starting_for_original_2025": qb in still_there_2025,
        "best_with_original": None if xo.empty else round(float(xo.epa_vs_league.max()), 3),
        "best_after": None if ba is None else {"career_year": int(ba.career_year), "season": int(ba.season),
                                               "team": ba.team, "epa_vs_league": round(float(ba.epa_vs_league), 3)},
        "early": None if e.empty else round(float(epa_vs_league(e)), 3),
        "later": None if l.empty else round(float(epa_vs_league(l)), 3),
        "later_above_average": bool((l.epa_vs_league > 0).any()),
        # [career_year, games, completions, attempts, passing yards, passing TDs] for starting seasons
        "box": [[int(r.career_year), int(r.games), int(r.completions), int(r.pass_attempts), int(r.passing_yards),
                 int(r.pass_tds)] for r in xs.itertuples()],
        "draft_round": None if pd.isna(players_draft.draft_round.get(qb)) else int(players_draft.draft_round[qb]),
        "draft_pick": None if pd.isna(players_draft.draft_pick.get(qb)) else int(players_draft.draft_pick[qb]),
        # [year signed, career year, team, years, total value ($M), share of cap per year, with original team]
        "contracts": [[int(r.year_signed), int(r.career_year), r.team, float(r.years), round(float(r.value), 1),
                       round(float(r.apy_cap_pct), 3), bool(r.with_original_team)]
                      for r in con[con.gsis_id == qb].itertuples()],
    }
FINDINGS["per_qb"] = per_qb

(DATA / "findings.json").write_text(json.dumps(FINDINGS, indent=1))

# --- Print a summary --------------------------------------------------------------------------
f = FINDINGS
print(f"QB-seasons: {len(qs):,} ({len(S):,} starting seasons)")
print("1  turnovers / 100 drives:", {r["career_year"]: r["turnovers_per_100_drives"] for r in f["1_turnovers"]},
      f"| Year 6 vs rookie p={f['1_turnovers'][5]['p_vs_rookie_turnovers']}")
print("2  best seasons in Year 5+:", {k: f["2_best_season"][k] for k in
      ["late_breakouts", "late_below_average_early", "late_not_starting_early"]})
print(f"3  first above-average season in Year 4+: {f['3_first_above_average']['share_year4_plus']:.0%}")
print("4  EPA vs league, same", f["4_jump_vs_peak"]["cohort_qbs"], "QBs:",
      {r["career_year"]: r["epa_vs_league"] for r in f["4_jump_vs_peak"]["level_by_year"]})
print(f"5  original team done by Year 4: {f['5_teams_move_on']['share_done_by_year4']:.0%}")
print(f"6  most common seasons given: {f['6_seasons_given']['most_common']} ({f['6_seasons_given']['share_one_season']:.0%})")
k = f["7_contracts"]
print("7  rookie deal cap %:", k["rookie_deal_cap_pct"], "| 2nd deals:", k["second_deals"], k["signed_career_year"],
      "| price:", [(w["from"], w["median_cap_pct"]) for w in k["price_by_window"]],
      "| paid:", {g: (v["paid"], v["qbs"]) for g, v in k["who_paid"].items()})
print(f"8  late bloomers: {f['headline']['late_bloomers']}")
print("9  box scores:", {g: (v["years_1_3"], v["year_4_plus"]) for g, v in f["9_box_scores"].items()})
print("10", {g: v for g, v in f["10_early_strugglers"].items() if g != "strugglers_by_draft"},
      {g: (v["qbs"], v["above_average_later"], v["more_starts_never_above"], v["no_more_starting_seasons"])
       for g, v in f["10_early_strugglers"]["strugglers_by_draft"].items()})
