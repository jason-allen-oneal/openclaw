# Native opt-out media/failure matrix

Source: `a1dcdd90a282d2d636eec9151a47a833be89a1af`. 6/6 canonical cases passed. Status is derived from retained canonical summaries and real native/receiver observations.

| Case | Outcome | Delivery | Media | Failure notices | Direct mirrors | Post-terminal observation |
|---|---|---|---:|---:|---:|---:|
| native-media-unset-optout-v1 | ok | delivered | 1 | 0 | 1 | 34984 ms |
| native-media-false-optout-v1 | ok | suspended | 0 | 0 | 0 | 30020 ms |
| native-media-true-optout-v1 | ok | delivered | 1 | 0 | 1 | 35138 ms |
| native-failure-unset-optout-v1 | error | delivered | 0 | 1 | 1 | 73627 ms |
| native-failure-false-optout-v1 | error | pending | 0 | 0 | 0 | 30002 ms |
| native-failure-true-optout-v1 | error | delivered | 0 | 1 | 1 | 69134 ms |

Unset and true preserve eligible fallback. Explicit false withholds fallback. Received PNG byte-for-byte assertions, exact native run/child-correlated mirrors and source-account/conversation assertions are part of every relevant canonical case.

## Scope

- Built CLI and real localhost portable transport, not an installed public package or live external provider/channel.
- Provider HTTP503 matcher also affects parent post-spawn continuation; ordinary sanitized provider-error traffic is retained and excluded from direct-fallback notices.
- False failure result is bounded absence for >=30 seconds after native terminal error, not proof of permanent suspension if captured delivery is pending.
- Source-account/conversation checks apply to each isolated direct case; private-parent isolation is a separate owner.
