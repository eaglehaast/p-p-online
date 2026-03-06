# Wall-locked fallback attack: before/after report

## Scenario set
- Synthetic wall-locked scenarios with blocked direct path and available mirror trajectory.
- Distances checked: from 70 to 220 px with step 5 (31 scenarios total).
- Selection metric: share of scenarios where mirror has the best normalized score and is selected.

## Results
- Before changes: 31 / 31 (100%).
- After changes: 31 / 31 (100%).
- Tie epsilon used in comparison model: 1.92.

## Notes
- The run uses the same scenario grid for before and after values.
- Goal of this report is parity check: mirror remains selected in wall-locked cases where normalized score is better.
