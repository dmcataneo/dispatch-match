# Dispatch Match (Python version)

The earlier Streamlit version of the same idea, kept as a reference. The web version in the repository root is the main project.

```bash
pip install -r requirements.txt
streamlit run app.py
pytest
```

The matching code is in `dispatch_match/core.py` and uses `scipy.optimize.linear_sum_assignment`. The tests compare it with brute force on small cases.
