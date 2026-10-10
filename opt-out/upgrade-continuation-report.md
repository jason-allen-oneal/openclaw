# Real upgrade continuation

Source: `a1dcdd90a282d2d636eec9151a47a833be89a1af`. 22/22 cross-checks passed; actual continuation command exit 0.

The real published stable Gateway created session `1939a415-f01a-4f9e-a6d4-fb00fd445ec7` and its persisted history. Candidate Doctor exited 0 and migrated agent 24→25/state 19→20. The initial candidate boot exceeded the unchanged 120 one-second readiness polls while native Gateway boots and a wide type graph overlapped; its failed receipt/logs remain retained unchanged.

After all six native cases finished, one serialized boot reused that exact Doctor-migrated state and config. Health returned HTTP 200 after 64529 ms (poll 58); actual Gateway config/history/inject/history RPCs preserved and used the same session and both histories. The fallback field remained absent, responsePrefix/timeout 73/workspace remained intact, and both migrated databases remained healthy. Stable/Doctor were not rerun; the pre-continuation state is separately preserved privately.

This is a controlled resource-contention continuation, not a source startup repair or a claim that the first attempt passed. Arbitrary concurrent-workload startup remains unproven. It exercises the built candidate CLI, not an installed public candidate package; fallback behavior is proved by separate exact-head native/real HTTP lanes.
