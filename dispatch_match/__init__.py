"""Dispatch Match: optimal vehicle-to-request assignment with the Hungarian method."""
from .core import (
    Assignment,
    assign_greedy,
    assign_hungarian,
    assign_sequential,
    distance_matrix,
    make_scenario,
)

__all__ = [
    "Assignment",
    "assign_greedy",
    "assign_hungarian",
    "assign_sequential",
    "distance_matrix",
    "make_scenario",
]
