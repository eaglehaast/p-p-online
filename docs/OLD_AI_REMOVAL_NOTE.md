# After demolition note (old AI)

Status after this PR:
- old AI v1/v2 runtime no longer executes;
- Computer mode now shows explicit hard-fail when old AI launch is attempted;
- old AI debug/export surface is deactivated with explicit message;
- AI smoke/compare scripts tied to old behavior were removed;
- behavior contract file is preserved as target reference only (`docs/AI_BEHAVIOR_CONTRACT.md`).

This PR is intentionally limited to demolition/cleanup only.
No new AI implementation is introduced here.
