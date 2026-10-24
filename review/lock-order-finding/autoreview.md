autoreview findings: 1
[P2] [P2] Avoid acquiring the chat lock while holding the runtime scope lock
apps/android/app/src/main/java/ai/openclaw/app/NodeRuntime.kt:5371
This call is made while `gatewayDataScopeLock` is held, but `refreshCommandsFromLegacyHint()` acquires `gatewayScopeApplyLock` and, while holding it, calls `currentCacheScope()`. In production that scope is supplied by `NodeRuntime` and requires the runtime gateway-scope state, creating the opposite lock order used here. A concurrent chat refresh can therefore hold the chat lock while waiting for the runtime lock as the legacy-hint handler holds the runtime lock while waiting for the chat lock, permanently stalling metadata/event processing. Determine whether the chat refresh should be started while holding the runtime lock, then invoke it after releasing that lock (or otherwise enforce one lock order).

overall: patch is incorrect (0.86)
The catalog/status reconciliation logic otherwise appears consistent with the supplied requirements and tests, including same-scope joining, bounded legacy catch-up, status recovery, scope fencing, and reset cancellation. However, the new legacy coordinator introduces a concrete cross-component lock-order inversion that can deadlock metadata handling. Review was completed from the provided patch and dataset; unchanged repository context was unavailable by design.
