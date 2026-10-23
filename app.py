"""Dispatch Match: place vehicles and requests, see the optimal pairing."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from dispatch_match import (
    assign_greedy,
    assign_hungarian,
    assign_sequential,
    make_scenario,
)
from dispatch_match.core import SIZE

STEP = 4  # click grid spacing
GRID = np.arange(STEP / 2, SIZE, STEP)
HIT_RADIUS = 5.0
BLUE, ORANGE, GREY = "#1f77b4", "#e8590c", "#9aa0a6"

st.set_page_config(page_title="Dispatch Match", layout="wide")


# ---------- state ----------
def load(seed: int, nv: int, nr: int) -> None:
    v, r = make_scenario(nv, nr, seed)
    st.session_state.v = [[round(float(x), 1), round(float(y), 1)] for x, y in v]
    st.session_state.r = [[round(float(x), 1), round(float(y), 1)] for x, y in r]
    st.session_state.version = st.session_state.get("version", 0) + 1
    st.session_state.chart = st.session_state.get("chart", 0) + 1
    st.session_state.pending = None
    st.session_state.prev_pairs = None
    st.session_state.cur_pairs = None
    st.session_state.cur_version = None


if "v" not in st.session_state:
    load(seed=7, nv=6, nr=6)


def edited(renumbered: bool = False) -> None:
    """Call after any change to the points. Removing points renumbers the labels,
    so a before/after pair comparison would be misleading and is skipped."""
    st.session_state.skip_diff = renumbered
    st.session_state.version += 1
    st.session_state.chart += 1


# ---------- sidebar ----------
with st.sidebar:
    st.title("Dispatch Match")
    st.caption("Pair vehicles with requests so the total pickup distance is as small as possible.")
    tool = st.radio(
        "Click on the map to",
        ["Add vehicle", "Add request", "Move a point", "Remove a point"],
        key="tool",
    )
    if tool != "Move a point":
        st.session_state.pending = None
    st.divider()
    limit_on = st.checkbox("Limit pickup distance", value=False)
    max_pickup = st.slider("Longest allowed pickup", 5, 100, 40) if limit_on else None
    st.divider()
    with st.expander("New random scenario"):
        seed = st.number_input("Seed", 0, 9999, 7)
        nv = st.slider("Vehicles", 0, 30, 6)
        nr = st.slider("Requests", 0, 30, 6)
        if st.button("Generate"):
            load(int(seed), nv, nr)
            st.rerun()
    if st.button("Clear all"):
        st.session_state.v, st.session_state.r = [], []
        edited(True)
        st.rerun()

V, R = st.session_state.v, st.session_state.r

# ---------- matching ----------
res = {
    "Hungarian (optimal)": assign_hungarian(V, R, max_pickup),
    "Closest pair first": assign_greedy(V, R, max_pickup),
    "Request order": assign_sequential(V, R, max_pickup),
}
main = res["Hungarian (optimal)"]
token = (st.session_state.version, max_pickup)
if st.session_state.cur_version != token:
    st.session_state.prev_pairs = None if st.session_state.get("skip_diff") else st.session_state.cur_pairs
    st.session_state.cur_pairs = set(main.pairs)
    st.session_state.cur_version = token
prev, cur = st.session_state.prev_pairs, st.session_state.cur_pairs


# ---------- figure ----------
def figure() -> go.Figure:
    fig = go.Figure()
    st.session_state.curves = {0: "g"}
    gx, gy = np.meshgrid(GRID, GRID)
    fig.add_trace(go.Scatter(
        x=gx.ravel(), y=gy.ravel(), mode="markers", name="grid",
        marker=dict(size=STEP * 5, color="rgba(0,0,0,0.004)"),
        customdata=[["g", i] for i in range(gx.size)],
        hovertemplate="click to place here<extra></extra>", showlegend=False,
        selected=dict(marker=dict(color="rgba(0,0,0,0.004)")),
        unselected=dict(marker=dict(color="rgba(0,0,0,0.004)")),
    ))
    for k, (i, j) in enumerate(main.pairs):
        fig.add_trace(go.Scatter(
            x=[V[i][0], R[j][0]], y=[V[i][1], R[j][1]], mode="lines",
            line=dict(color="#2b8a3e", width=3), hoverinfo="skip",
            name="assignment", legendgroup="a", showlegend=(k == 0),
        ))
    for tag, pts, color, symbol, name, un in [
        ("v", V, BLUE, "square", "Vehicle", main.unmatched_vehicles),
        ("r", R, ORANGE, "circle", "Request", main.unmatched_requests),
    ]:
        if not pts:
            continue
        pending = st.session_state.pending
        st.session_state.curves[len(fig.data)] = tag
        fig.add_trace(go.Scatter(
            x=[p[0] for p in pts], y=[p[1] for p in pts], mode="markers+text",
            text=[f"{tag.upper()}{n + 1}" for n in range(len(pts))],
            textposition="top center", name=name,
            customdata=[[tag, n] for n in range(len(pts))],
            marker=dict(
                size=15, symbol=symbol, color=color,
                line=dict(width=[4 if pending == (tag, n) else (3 if n in un else 1) for n in range(len(pts))],
                          color=["#000" if pending == (tag, n) else ("#d6336c" if n in un else "white") for n in range(len(pts))]),
            ),
            selected=dict(marker=dict(opacity=1)), unselected=dict(marker=dict(opacity=1)),
            hovertemplate=f"{name} %{{text}}<br>x=%{{x}}, y=%{{y}}<extra></extra>",
        ))
    fig.update_layout(
        height=640, clickmode="event+select", margin=dict(l=10, r=10, t=10, b=10),
        xaxis=dict(range=[-4, SIZE + 4], showgrid=True, gridcolor="#eee", zeroline=False, title="x (made-up units)", constrain="domain"),
        yaxis=dict(range=[-4, SIZE + 4], showgrid=True, gridcolor="#eee", zeroline=False, scaleanchor="x", title="y"),
        plot_bgcolor="white", legend=dict(orientation="h", y=1.04),
    )
    fig.update_xaxes(showline=True, linecolor="#ccc", mirror=True)
    fig.update_yaxes(showline=True, linecolor="#ccc", mirror=True)
    return fig


# ---------- layout ----------
left, right = st.columns([3, 2])
with left:
    hint = {
        "Add vehicle": "Click an empty spot to add a vehicle (blue square).",
        "Add request": "Click an empty spot to add a request (orange circle).",
        "Move a point": "Click a point, then click where it should go."
        + (f" Moving {st.session_state.pending[0].upper()}{st.session_state.pending[1] + 1}." if st.session_state.pending else ""),
        "Remove a point": "Click a point to remove it.",
    }[tool]
    st.caption(hint)
    event = st.plotly_chart(
        figure(), key=f"map_{st.session_state.chart}", on_select="rerun",
        selection_mode="points", config={"displayModeBar": False},
    )

# Handle one click, then reset the chart so the same spot can be clicked again.
pts = (event or {}).get("selection", {}).get("points", []) if event else []
if pts:
    # Work out which existing point (if any) the click landed on, by distance.
    p0 = pts[0]
    cx, cy = float(p0["x"]), float(p0["y"])
    tag0 = st.session_state.curves.get(p0.get("curve_number"))
    pointhit = None
    if tag0 in ("v", "r"):
        pointhit = (tag0, int(p0["point_index"]))
    else:
        best = HIT_RADIUS
        for t, arr in (("v", V), ("r", R)):
            for n, (px, py) in enumerate(arr):
                d = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
                if d <= best:
                    best, pointhit = d, (t, n)
    where = [round(cx, 1), round(cy, 1)]
    pending = st.session_state.pending
    done = False
    renum = False
    if tool == "Add vehicle" and not pointhit:
        V.append(where); done = True
    elif tool == "Add request" and not pointhit:
        R.append(where); done = True
    elif tool == "Remove a point" and pointhit:
        (V if pointhit[0] == "v" else R).pop(pointhit[1]); done = True; renum = True
    elif tool == "Move a point":
        if pending is None and pointhit:
            st.session_state.pending = pointhit
            st.session_state.chart += 1
            st.rerun()
        elif pending is not None and not pointhit:
            (V if pending[0] == "v" else R)[pending[1]] = where
            st.session_state.pending = None; done = True
    if done:
        edited(renum)
        st.rerun()
    else:
        st.session_state.chart += 1
        st.rerun()

with right:
    n_changed = None
    if prev is not None and cur is not None and prev != cur:
        n_changed = len(cur - prev)
    c1, c2, c3 = st.columns(3)
    c1.metric("Pairs", len(main.pairs))
    c2.metric("Total distance", f"{main.total:.1f}")
    c3.metric("Longest pickup", f"{main.longest:.1f}")
    if n_changed:
        st.info(f"{n_changed} of {len(cur)} pairs are different after your last change.")
    elif prev is not None and prev == cur:
        st.caption("Your last change did not alter any pair.")
    if main.unmatched_requests:
        from dispatch_match import distance_matrix

        dm = distance_matrix(V, R)
        far, busy = [], []
        for j in main.unmatched_requests:
            in_range = limit_on and bool(len(V)) and (dm[:, j] <= max_pickup).any()
            if not len(V) or (limit_on and not in_range):
                far.append(j)
            else:
                busy.append(j)
        lines = []
        if far:
            lines.append(", ".join(f"R{j + 1}" for j in far)
                         + (" - no vehicle within the pickup limit." if len(V) else " - no vehicles."))
        if busy:
            lines.append(", ".join(f"R{j + 1}" for j in busy)
                         + " - every vehicle in range is better used for other requests.")
        st.warning("Unserved requests (pink outline): " + " ".join(lines))
    if main.unmatched_vehicles:
        st.caption("Idle vehicles (pink outline): " + ", ".join(f"V{i + 1}" for i in main.unmatched_vehicles))

    t1, t2, t3 = st.tabs(["Compare methods", "Pairs", "Edit coordinates"])
    with t1:
        rows = []
        for name, a in res.items():
            rows.append({
                "Method": name, "Pairs": len(a.pairs), "Total": round(a.total, 1),
                "Mean": round(a.mean, 1), "Longest": round(a.longest, 1),
            })
        df = pd.DataFrame(rows)
        st.dataframe(df, hide_index=True, use_container_width=True)
        best = main.total
        extra = [(n, a.total - best) for n, a in res.items() if len(a.pairs) == len(main.pairs) and a.total - best > 1e-9]
        if extra:
            st.caption("Same number of pairs, more distance than the Hungarian result: "
                       + "; ".join(f"{n} +{d:.1f}" for n, d in extra) + ".")
        st.caption("Hungarian gives the smallest total for the same number of pairs. "
                   "It does not minimise the longest single pickup.")
    with t2:
        if main.pairs:
            st.dataframe(pd.DataFrame(
                [{"Vehicle": f"V{i + 1}", "Request": f"R{j + 1}", "Distance": round(d, 1)}
                 for (i, j), d in zip(main.pairs, main.distances)]
            ), hide_index=True, use_container_width=True)
        else:
            st.caption("No pairs yet.")
    with t3:
        st.caption("Exact positions, 0 to 100. Edit a cell, or add and delete rows.")
        for label, key in (("Vehicles", "v"), ("Requests", "r")):
            st.markdown(f"**{label}**")
            df0 = pd.DataFrame(st.session_state[key], columns=["x", "y"])
            out = st.data_editor(
                df0, num_rows="dynamic", key=f"ed_{key}_{st.session_state.version}",
                column_config={"x": st.column_config.NumberColumn(min_value=0.0, max_value=SIZE),
                               "y": st.column_config.NumberColumn(min_value=0.0, max_value=SIZE)},
                hide_index=True, use_container_width=True,
            )
            clean = out.dropna().clip(0, SIZE).round(1).values.tolist()
            if clean != st.session_state[key]:
                renumbered = len(clean) != len(st.session_state[key])
                st.session_state[key] = clean
                edited(renumbered)
                st.rerun()
