import itertools

import numpy as np
import pytest

from dispatch_match import (
    assign_greedy,
    assign_hungarian,
    assign_sequential,
    distance_matrix,
    make_scenario,
)


def brute_force(cost, max_pickup=None):
    """Best (most pairs, then smallest total) by trying everything."""
    n, m = cost.shape
    k = min(n, m)
    best = (0, 0.0)
    for size in range(k, -1, -1):
        found = None
        for vs in itertools.combinations(range(n), size):
            for rs in itertools.permutations(range(m), size):
                ds = [cost[i, j] for i, j in zip(vs, rs)]
                if max_pickup is not None and any(d > max_pickup for d in ds):
                    continue
                if found is None or sum(ds) < found:
                    found = sum(ds)
        if found is not None:
            return size, found
    return best


@pytest.mark.parametrize("seed", range(12))
@pytest.mark.parametrize("shape", [(4, 4), (3, 5), (5, 3)])
def test_matches_brute_force(seed, shape):
    v, r = make_scenario(*shape, seed=seed)
    a = assign_hungarian(v, r)
    size, total = brute_force(distance_matrix(v, r))
    assert len(a.pairs) == size
    assert a.total == pytest.approx(total)


@pytest.mark.parametrize("seed", range(12))
@pytest.mark.parametrize("limit", [20.0, 40.0, 60.0])
def test_pickup_limit_matches_brute_force(seed, limit):
    v, r = make_scenario(4, 4, seed=seed)
    a = assign_hungarian(v, r, max_pickup=limit)
    size, total = brute_force(distance_matrix(v, r), limit)
    assert len(a.pairs) == size
    assert a.total == pytest.approx(total)
    assert all(d <= limit for d in a.distances)


def test_never_worse_than_heuristics():
    for seed in range(30):
        v, r = make_scenario(8, 8, seed=seed)
        h = assign_hungarian(v, r).total
        assert h <= assign_greedy(v, r).total + 1e-9
        assert h <= assign_sequential(v, r).total + 1e-9


def test_unequal_counts_leave_the_extras_unmatched():
    v, r = make_scenario(6, 3, seed=1)
    a = assign_hungarian(v, r)
    assert len(a.pairs) == 3 and len(a.unmatched_vehicles) == 3 and not a.unmatched_requests
    a = assign_hungarian(r, v)
    assert len(a.unmatched_requests) == 3 and not a.unmatched_vehicles


def test_each_point_used_at_most_once():
    v, r = make_scenario(7, 9, seed=3)
    for f in (assign_hungarian, assign_greedy, assign_sequential):
        a = f(v, r, max_pickup=50)
        assert len({i for i, _ in a.pairs}) == len(a.pairs)
        assert len({j for _, j in a.pairs}) == len(a.pairs)
        assert len(a.pairs) + len(a.unmatched_vehicles) == 7
        assert len(a.pairs) + len(a.unmatched_requests) == 9


def test_empty_inputs():
    for v, r in [([], []), ([[1, 1]], []), ([], [[1, 1]])]:
        a = assign_hungarian(v, r)
        assert a.pairs == () and a.total == 0.0
        assert assign_greedy(v, r).pairs == ()
        assert assign_sequential(v, r).pairs == ()


def test_greedy_can_be_worse():
    # Vehicles at x=0 and x=3, requests at x=2 and x=6.
    # Closest pair first takes 3 -> 2 (1) then 0 -> 6 (6) = 7.
    # The optimum is 0 -> 2 (2) and 3 -> 6 (3) = 5.
    v = [[0, 0], [3, 0]]
    r = [[2, 0], [6, 0]]
    assert assign_greedy(v, r).total == pytest.approx(7)
    assert assign_hungarian(v, r).total == pytest.approx(5)


def test_limit_zero_matches_nothing():
    v, r = make_scenario(3, 3, seed=2)
    assert assign_hungarian(v, r, max_pickup=0.0).pairs == ()
