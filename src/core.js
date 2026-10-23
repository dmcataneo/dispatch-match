/* Dispatch Match core: distance matrix, Hungarian method and two simple rules.
   Points live on a made-up 100 x 100 plane. Works in the browser (window.DispatchCore)
   and in Node (module.exports), so the same file is used by the app and the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DispatchCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SIZE = 100;

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function distanceMatrix(vehicles, requests) {
    return vehicles.map(function (v) { return requests.map(function (r) { return dist(v, r); }); });
  }

  /* Hungarian method (Kuhn-Munkres, shortest augmenting path with potentials, O(n^2 m)).
     cost is n x m with n <= m. Returns for each row the chosen column. */
  function hungarianRows(cost, n, m) {
    const INF = Infinity;
    const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);
    const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = INF, j1 = 0;
        for (let j = 1; j <= m; j++) {
          if (used[j]) continue;
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const rowToCol = new Array(n).fill(-1);
    for (let j = 1; j <= m; j++) if (p[j]) rowToCol[p[j] - 1] = j - 1;
    return rowToCol;
  }

  function build(method, cost, pairs) {
    pairs = pairs.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    const nV = cost.length, nR = nV ? cost[0].length : 0;
    const usedV = new Set(pairs.map(function (p) { return p[0]; }));
    const usedR = new Set(pairs.map(function (p) { return p[1]; }));
    const distances = pairs.map(function (p) { return cost[p[0]][p[1]]; });
    const total = distances.reduce(function (s, d) { return s + d; }, 0);
    const unmatchedVehicles = [], unmatchedRequests = [];
    for (let i = 0; i < nV; i++) if (!usedV.has(i)) unmatchedVehicles.push(i);
    for (let j = 0; j < nR; j++) if (!usedR.has(j)) unmatchedRequests.push(j);
    return {
      method: method, pairs: pairs, distances: distances, total: total,
      longest: distances.length ? Math.max.apply(null, distances) : 0,
      mean: distances.length ? total / distances.length : 0,
      unmatchedVehicles: unmatchedVehicles, unmatchedRequests: unmatchedRequests
    };
  }

  /* Minimum total distance. With maxPickup, longer pairs are forbidden: the most
     pairs win first, then the shortest total. */
  function assignHungarian(vehicles, requests, maxPickup) {
    const cost = distanceMatrix(vehicles, requests);
    const nV = vehicles.length, nR = requests.length;
    if (!nV || !nR) return build('optimal', cost, []);
    let work = cost;
    if (maxPickup != null) {
      let sum = 0;
      cost.forEach(function (row) { row.forEach(function (d) { sum += d; }); });
      const big = sum + 1;
      work = cost.map(function (row) { return row.map(function (d) { return d <= maxPickup ? d : big; }); });
    }
    let pairs = [];
    if (nV <= nR) {
      hungarianRows(work, nV, nR).forEach(function (j, i) { pairs.push([i, j]); });
    } else {
      const t = [];
      for (let j = 0; j < nR; j++) { t.push([]); for (let i = 0; i < nV; i++) t[j].push(work[i][j]); }
      hungarianRows(t, nR, nV).forEach(function (i, j) { pairs.push([i, j]); });
    }
    if (maxPickup != null) pairs = pairs.filter(function (p) { return cost[p[0]][p[1]] <= maxPickup; });
    return build('optimal', cost, pairs);
  }

  /* Repeatedly take the closest remaining vehicle-request pair. */
  function assignGreedy(vehicles, requests, maxPickup) {
    const cost = distanceMatrix(vehicles, requests);
    const all = [];
    cost.forEach(function (row, i) { row.forEach(function (d, j) { all.push([d, i, j]); }); });
    all.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; });
    const fv = new Set(), fr = new Set(), pairs = [];
    for (const t of all) {
      if (maxPickup != null && t[0] > maxPickup) break;
      if (!fv.has(t[1]) && !fr.has(t[2])) { pairs.push([t[1], t[2]]); fv.add(t[1]); fr.add(t[2]); }
    }
    return build('closest', cost, pairs);
  }

  /* Requests are served in order; each takes the nearest free vehicle. */
  function assignSequential(vehicles, requests, maxPickup) {
    const cost = distanceMatrix(vehicles, requests);
    const free = new Set(vehicles.map(function (_, i) { return i; })), pairs = [];
    for (let j = 0; j < requests.length; j++) {
      if (!free.size) break;
      let best = -1;
      free.forEach(function (i) { if (best < 0 || cost[i][j] < cost[best][j] || (cost[i][j] === cost[best][j] && i < best)) best = i; });
      if (maxPickup == null || cost[best][j] <= maxPickup) { pairs.push([best, j]); free.delete(best); }
    }
    return build('order', cost, pairs);
  }

  /* Small seeded random generator so a seed always gives the same scene. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeScenario(nV, nR, seed) {
    const r = rng(seed), pt = function () { return { x: Math.round(r() * 940) / 10 + 3, y: Math.round(r() * 940) / 10 + 3 }; };
    const vehicles = [], requests = [];
    for (let i = 0; i < nV; i++) vehicles.push(pt());
    for (let j = 0; j < nR; j++) requests.push(pt());
    return { vehicles: vehicles, requests: requests };
  }

  return {
    SIZE: SIZE, dist: dist, distanceMatrix: distanceMatrix, assignHungarian: assignHungarian,
    assignGreedy: assignGreedy, assignSequential: assignSequential, makeScenario: makeScenario, rng: rng
  };
});
