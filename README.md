# Dispatch Match

Place vehicles and requests on a plane, and see which vehicle should serve which request so the total pickup distance is as small as possible. Click to add, move or remove points and watch the pairing change.

It uses the Hungarian method (via `scipy.optimize.linear_sum_assignment`) and compares it with two simpler rules.

## Run it

```bash
pip install -r requirements.txt
streamlit run app.py
pytest
```

## What you can do

- Click the map to add a vehicle or a request, move a point, or remove one.
- Set a longest allowed pickup distance. Requests nobody can reach in range stay unserved (pink outline).
- Compare three methods on the same points: Hungarian (optimal), closest pair first, and request order.
- Edit exact coordinates in a table.
- After each change, the app shows how many pairs are different.

## How it works

Each vehicle-request pair has a cost, the straight-line distance. The Hungarian method finds the one-to-one pairing with the smallest total cost. With unequal counts, the extra vehicles stay idle or the extra requests stay unserved.

With a pickup limit, pairs that are too long are not allowed. The solver first serves as many requests as possible, then picks the shortest total distance among those options.

Things to keep in mind:

- It minimises the **total** distance. The longest single pickup can still be long.
- Assignment is one to one and made once, for the points as they are now. It does not model time, traffic, vehicles already moving, or requests that arrive later.
- Distance is straight-line on a made-up 100 x 100 plane, not a real map.
- Closest pair first can be worse than the optimum, see `test_greedy_can_be_worse`.

## Tests

`tests/test_core.py` checks the Hungarian result against brute force on small cases (equal and unequal counts, with and without a pickup limit), checks that it is never worse than the two simple rules, and covers empty inputs and the one-to-one constraint.

## Layout

```
app.py                  Streamlit app
dispatch_match/core.py  Matching code
tests/                  Tests
```

All data is generated.
