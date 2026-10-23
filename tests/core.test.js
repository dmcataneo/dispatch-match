const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/core.js');

function bruteForce(cost, limit) {
  const n = cost.length, m = n ? cost[0].length : 0;
  let best = { size: 0, total: 0 };
  function rec(i, usedCols, size, total) {
    if (i === n) {
      if (size > best.size || (size === best.size && total < best.total - 1e-12)) best = { size: size, total: total };
      return;
    }
    rec(i + 1, usedCols, size, total);
    for (let j = 0; j < m; j++) {
      if (usedCols & (1 << j)) continue;
      if (limit != null && cost[i][j] > limit) continue;
      rec(i + 1, usedCols | (1 << j), size + 1, total + cost[i][j]);
    }
  }
  rec(0, 0, 0, 0);
  return best;
}

for (const shape of [[4, 4], [3, 5], [5, 3], [6, 6], [1, 4], [4, 1]]) {
  test('matches brute force ' + shape, () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = C.makeScenario(shape[0], shape[1], seed);
      const a = C.assignHungarian(s.vehicles, s.requests);
      const b = bruteForce(C.distanceMatrix(s.vehicles, s.requests));
      assert.strictEqual(a.pairs.length, b.size);
      assert.ok(Math.abs(a.total - b.total) < 1e-9, 'seed ' + seed);
    }
  });
}

for (const limit of [15, 30, 50]) {
  test('pickup limit ' + limit + ' matches brute force', () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = C.makeScenario(5, 4, seed);
      const a = C.assignHungarian(s.vehicles, s.requests, limit);
      const b = bruteForce(C.distanceMatrix(s.vehicles, s.requests), limit);
      assert.strictEqual(a.pairs.length, b.size);
      assert.ok(Math.abs(a.total - b.total) < 1e-9);
      assert.ok(a.distances.every(d => d <= limit));
    }
  });
}

test('never worse than the two simple rules', () => {
  for (let seed = 0; seed < 60; seed++) {
    const s = C.makeScenario(8, 8, seed);
    const h = C.assignHungarian(s.vehicles, s.requests).total;
    assert.ok(h <= C.assignGreedy(s.vehicles, s.requests).total + 1e-9);
    assert.ok(h <= C.assignSequential(s.vehicles, s.requests).total + 1e-9);
  }
});

test('closest pair first can be worse than optimal', () => {
  const v = [{ x: 40, y: 50 }, { x: 60, y: 50 }];
  const r = [{ x: 49, y: 50 }, { x: 10, y: 50 }];
  assert.ok(C.assignGreedy(v, r).total > C.assignHungarian(v, r).total + 1);
});

test('one to one and empty inputs', () => {
  const s = C.makeScenario(7, 5, 3);
  const a = C.assignHungarian(s.vehicles, s.requests);
  assert.strictEqual(new Set(a.pairs.map(p => p[0])).size, a.pairs.length);
  assert.strictEqual(new Set(a.pairs.map(p => p[1])).size, a.pairs.length);
  assert.strictEqual(a.pairs.length, 5);
  assert.strictEqual(a.unmatchedVehicles.length, 2);
  assert.strictEqual(C.assignHungarian([], s.requests).pairs.length, 0);
  assert.strictEqual(C.assignHungarian(s.vehicles, []).pairs.length, 0);
});

test('same seed gives same scene', () => {
  assert.deepStrictEqual(C.makeScenario(5, 5, 9), C.makeScenario(5, 5, 9));
});
