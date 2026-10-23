"""Assignment logic. Points live on a made-up 100 x 100 plane, not a real map."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import linear_sum_assignment

SIZE = 100.0


@dataclass(frozen=True)
class Assignment:
    """Result of one matching method.

    pairs: (vehicle_index, request_index) tuples.
    """

    method: str
    pairs: tuple[tuple[int, int], ...]
    unmatched_vehicles: tuple[int, ...]
    unmatched_requests: tuple[int, ...]
    distances: tuple[float, ...] = field(default_factory=tuple)

    @property
    def total(self) -> float:
        return float(sum(self.distances))

    @property
    def longest(self) -> float:
        return float(max(self.distances)) if self.distances else 0.0

    @property
    def mean(self) -> float:
        return self.total / len(self.pairs) if self.pairs else 0.0


def make_scenario(n_vehicles: int, n_requests: int, seed: int = 0):
    """Random vehicle and request positions (fictional)."""
    rng = np.random.default_rng(seed)
    return (
        rng.uniform(0, SIZE, size=(n_vehicles, 2)),
        rng.uniform(0, SIZE, size=(n_requests, 2)),
    )


def distance_matrix(vehicles, requests) -> np.ndarray:
    """Straight-line distance, shape (n_vehicles, n_requests)."""
    v = np.asarray(vehicles, dtype=float).reshape(-1, 2)
    r = np.asarray(requests, dtype=float).reshape(-1, 2)
    return np.linalg.norm(v[:, None, :] - r[None, :, :], axis=2)


def _build(method, cost, pairs) -> Assignment:
    pairs = tuple(sorted((int(i), int(j)) for i, j in pairs))
    used_v = {i for i, _ in pairs}
    used_r = {j for _, j in pairs}
    return Assignment(
        method=method,
        pairs=pairs,
        unmatched_vehicles=tuple(i for i in range(cost.shape[0]) if i not in used_v),
        unmatched_requests=tuple(j for j in range(cost.shape[1]) if j not in used_r),
        distances=tuple(float(cost[i, j]) for i, j in pairs),
    )


def assign_hungarian(vehicles, requests, max_pickup: float | None = None) -> Assignment:
    """Minimum total distance matching (Hungarian method via SciPy).

    Works with unequal counts: min(vehicles, requests) pairs are made.
    With max_pickup, pairs longer than the limit are not allowed. Among all
    matchings, the one with the most pairs wins, then the shortest total distance.
    """
    cost = distance_matrix(vehicles, requests)
    if cost.size == 0:
        return _build("Hungarian", cost, [])
    work = cost
    if max_pickup is not None:
        # A forbidden pair costs more than any set of allowed pairs combined,
        # so the solver only uses one when it has no alternative. Those are dropped.
        big = cost.sum() + 1.0
        work = np.where(cost <= max_pickup, cost, big)
    rows, cols = linear_sum_assignment(work)
    pairs = [(i, j) for i, j in zip(rows, cols) if max_pickup is None or cost[i, j] <= max_pickup]
    return _build("Hungarian", cost, pairs)


def assign_greedy(vehicles, requests, max_pickup: float | None = None) -> Assignment:
    """Repeatedly take the closest remaining vehicle-request pair."""
    cost = distance_matrix(vehicles, requests)
    pairs = []
    free_v, free_r = set(range(cost.shape[0])), set(range(cost.shape[1]))
    order = sorted(
        ((cost[i, j], i, j) for i in free_v for j in free_r),
        key=lambda t: (t[0], t[1], t[2]),
    )
    for d, i, j in order:
        if max_pickup is not None and d > max_pickup:
            break
        if i in free_v and j in free_r:
            pairs.append((i, j))
            free_v.discard(i)
            free_r.discard(j)
    return _build("Closest pair first", cost, pairs)


def assign_sequential(vehicles, requests, max_pickup: float | None = None) -> Assignment:
    """Requests are served in order; each takes the nearest free vehicle."""
    cost = distance_matrix(vehicles, requests)
    free = set(range(cost.shape[0]))
    pairs = []
    for j in range(cost.shape[1]):
        if not free:
            break
        i = min(free, key=lambda k: (cost[k, j], k))
        if max_pickup is None or cost[i, j] <= max_pickup:
            pairs.append((i, j))
            free.discard(i)
    return _build("Request order", cost, pairs)
