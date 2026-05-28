#!/usr/bin/env python3
"""
Generate reference statistics for the reliability-eval test suite.
Computes Wilcoxon signed-rank and Spearman correlation via scipy.stats
and writes the results to tests/fixtures/reference-stats.json.

Run:  python scripts/generate-reference-stats.py
Requires: scipy, numpy (pip install scipy numpy)
"""

import json
import math
import os
import random

import numpy as np
from scipy import stats


def make_wilcoxon_case(name: str, a: list[float], b: list[float]) -> dict:
    diffs = np.array(a) - np.array(b)
    nonzero = diffs[diffs != 0]
    n = len(nonzero)

    result = stats.wilcoxon(a, b, alternative="two-sided", method="auto")
    stat, pvalue = float(result.statistic), float(result.pvalue)

    # Effect size: rank-biserial correlation
    abs_diffs = np.abs(nonzero)
    ranks = stats.rankdata(abs_diffs)
    w_plus = float(np.sum(ranks[nonzero > 0]))
    w_minus = float(np.sum(ranks[nonzero < 0]))
    effect_size = (w_plus - w_minus) / (w_plus + w_minus) if (w_plus + w_minus) > 0 else 0.0

    return {
        "name": name,
        "a": list(a),
        "b": list(b),
        "expected": {
            "statistic": stat,
            "pValue": pvalue,
            "n": n,
            "effectSize": effect_size,
        },
    }


def make_spearman_case(name: str, x: list[float], y: list[float]) -> dict:
    result = stats.spearmanr(x, y, alternative="two-sided")
    rho = float(result.statistic)
    pvalue = float(result.pvalue)
    return {
        "name": name,
        "x": list(x),
        "y": list(y),
        "expected": {
            "rho": rho,
            "pValue": pvalue,
            "n": len(x),
        },
    }


rng = random.Random(42)
np_rng = np.random.default_rng(42)

wilcoxon_cases = []
spearman_cases = []

# --- Wilcoxon cases ---

# Small n (8 pairs), no ties
a8 = [0.9, 0.7, 0.8, 0.6, 0.95, 0.55, 0.75, 0.85]
b8 = [0.6, 0.5, 0.7, 0.4, 0.8, 0.3, 0.6, 0.65]
wilcoxon_cases.append(make_wilcoxon_case("small_n8_no_ties", a8, b8))

# Small n with some ties (n=10)
a10 = [1, 1, 0, 1, 0, 1, 0, 0, 1, 1]
b10 = [0, 1, 0, 0, 0, 1, 1, 0, 0, 1]
wilcoxon_cases.append(make_wilcoxon_case("small_n10_ties", a10, b10))

# Medium n (50 pairs), with ties
np_rng_50 = np.random.default_rng(7)
a50 = list(np_rng_50.integers(0, 10, size=50) / 10.0)
b50 = list(np_rng_50.integers(0, 10, size=50) / 10.0)
wilcoxon_cases.append(make_wilcoxon_case("medium_n50_ties", a50, b50))

# Large n (200 pairs), with ties (200 is enough to hit normal approximation path)
np_rng_200 = np.random.default_rng(13)
a200 = list(np_rng_200.integers(0, 20, size=200) / 20.0)
b200 = list(np_rng_200.integers(0, 20, size=200) / 20.0)
wilcoxon_cases.append(make_wilcoxon_case("large_n200_ties", a200, b200))

# No-zeros, no-ties, small n=8: exercises the exact enumeration path.
# All absolute differences are distinct (no ties) and none are zero.
# Diffs = [0.5, -1.0, 1.5, -2.0, 2.5, -3.0, 3.5, -4.0] (exact binary fractions).
# scipy uses method="exact" for n <= 50 when no zeros are dropped.
diffs_a = [0.5, -1.0, 1.5, -2.0, 2.5, -3.0, 3.5, -4.0]
a8_nt = [5.0 + d for d in diffs_a]
b8_nt = [5.0] * 8
assert len(set(abs(d) for d in diffs_a)) == len(diffs_a), "ties in |diffs|"
assert all(d != 0 for d in diffs_a), "zero diffs present"
wilcoxon_cases.append(make_wilcoxon_case("small_n8_no_zeros_no_ties", a8_nt, b8_nt))

# No-zeros, no-ties, n=30: exercises the exact DP path (integer ranks 1..30).
# scipy uses method="exact" for n <= 50 no-zeros data; our DP matches it exactly.
# Note: scipy's "auto" method is exact for n <= 50 without zeros; our implementation
# mirrors this by using exact DP (O(n^3)) for no-zeros, no-ties data of any size.
# Normal approximation (without continuity correction) is used only when zeros
# exist or ties are present with n >= 20.
diffs_b = [(i + 1) * 0.5 if i % 2 == 0 else -(i + 1) * 0.5 for i in range(30)]
a30_nt = [10.0 + d for d in diffs_b]
b30_nt = [10.0] * 30
assert len(set(abs(d) for d in diffs_b)) == len(diffs_b), "ties in |diffs|"
assert all(d != 0 for d in diffs_b), "zero diffs present"
wilcoxon_cases.append(make_wilcoxon_case("n30_no_zeros_no_ties", a30_nt, b30_nt))

# All zero differences (edge case)
a_eq = [0.5, 0.7, 0.3]
b_eq = [0.5, 0.7, 0.3]
# scipy raises ValueError for all-zero diffs; we handle this as p=1, n=0 in TS
# So don't include this in expected results from scipy; handle it as a special case.

# --- Spearman cases ---

# Perfectly monotonic (rho = 1)
x_mono = list(range(1, 21))
y_mono = list(range(1, 21))
spearman_cases.append(make_spearman_case("perfect_positive", x_mono, y_mono))

# Anti-correlated (rho = -1)
x_anti = list(range(1, 21))
y_anti = list(range(20, 0, -1))
spearman_cases.append(make_spearman_case("perfect_negative", x_anti, y_anti))

# Random data with ties (n=30)
np_rng_sp = np.random.default_rng(99)
x_rand = list(np_rng_sp.integers(0, 10, size=30).astype(float))
y_rand = list(np_rng_sp.integers(0, 10, size=30).astype(float))
spearman_cases.append(make_spearman_case("random_ties_n30", x_rand, y_rand))

# Moderate correlation (n=100)
np_rng_mod = np.random.default_rng(55)
base = np_rng_mod.normal(0, 1, 100)
x_mod = list((base + np_rng_mod.normal(0, 0.5, 100)).tolist())
y_mod = list((base + np_rng_mod.normal(0, 0.5, 100)).tolist())
spearman_cases.append(make_spearman_case("moderate_corr_n100", x_mod, y_mod))

# Binary confidence-vs-correct (typical eval scenario)
conf = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.9, 0.8, 0.7, 0.6]
corr = [1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0]
spearman_cases.append(make_spearman_case("binary_correct_n12", conf, corr))

output = {
    "wilcoxon": wilcoxon_cases,
    "spearman": spearman_cases,
}

out_path = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures", "reference-stats.json")
with open(out_path, "w") as f:
    json.dump(output, f, indent=2)

print(f"Written {len(wilcoxon_cases)} Wilcoxon cases and {len(spearman_cases)} Spearman cases to {out_path}")
for c in wilcoxon_cases:
    print(f"  wilcoxon/{c['name']}: W={c['expected']['statistic']:.4f}, p={c['expected']['pValue']:.6f}, n={c['expected']['n']}")
for c in spearman_cases:
    print(f"  spearman/{c['name']}: rho={c['expected']['rho']:.6f}, p={c['expected']['pValue']:.6f}, n={c['expected']['n']}")
