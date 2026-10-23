# Dispatch Match

An interactive map that pairs vehicles with requests so the total pickup distance is as small as possible. Drag points around and watch the pairing change as you move them.

It runs in the browser. There is nothing to install: open `index.html`, or serve the folder with any static file server.

[Open the live app](https://dmcataneo.github.io/dispatch-match/). No login needed.

## Run locally

```bash
# Option 1: open index.html in a browser
# Option 2: serve the folder
python3 -m http.server 8000     # then visit http://localhost:8000
```

## What you can do

- Click the map to add a request or a vehicle, drag any point to move it, or switch to Remove and click a point.
- Compare three methods on the same points, side by side, each with a small preview:
  - **Hungarian (optimal):** the pairing with the smallest total distance.
  - **Closest pair first:** repeatedly takes the nearest free pair.
  - **Request order:** each request, in order, takes the nearest free vehicle.
- See how much longer each simple rule is than the optimum, and how many pairs differ. Show the optimal pairing as a faint outline on top of any other method.
- Set a longest allowed pickup distance. Requests nobody can reach in range stay unserved (dashed pink ring).
- Open the distance table, the exact input the Hungarian method works on, with the chosen pairs ringed. Hover a cell to see that pair on the map.
- Try the ready-made scenes. "Closest-first trap" is a small case where the greedy rule is clearly worse.
- Undo (Ctrl/Cmd+Z), and copy a link to the exact scene: the points are stored in the URL.

## How it works

Each vehicle-request pair has a cost, the straight-line distance. The Hungarian method (Kuhn-Munkres, shortest augmenting paths with potentials, O(n^2 m)) finds the one-to-one pairing with the smallest total cost. With unequal counts, extra vehicles stay idle or extra requests stay unserved.

With a pickup limit, pairs that are too long are forbidden. A forbidden pair costs more than all allowed pairs combined, so the solver serves as many requests as possible first, then picks the shortest total among those options.

Things to keep in mind:

- It minimises the **total** distance. The longest single pickup can still be long.
- Assignment is one to one and made once, for the points as they are now. It does not model time, traffic, vehicles already moving, or requests that arrive later.
- Distance is straight-line on a made-up 100 x 100 plane, not a real map.
- Closest pair first can be worse than the optimum. A test covers it.

## Tests

```bash
node --test tests/core.test.js
```

The tests check the Hungarian result against brute force on small cases (equal and unequal counts, with and without a pickup limit), check that it is never worse than the two simple rules, and cover empty inputs and the one-to-one constraint. Node 18 or newer, no dependencies.

## Layout

```
index.html, style.css   Page
src/core.js             Matching code (used by the page and the tests)
src/app.js              Map, drag and drop, comparison panel
tests/core.test.js      Tests
python/                 Earlier Streamlit version of the same idea, with its own 78 tests
```

All data is generated or placed by you.

## Author

[dmcataneo](https://github.com/dmcataneo)
