autoreview findings: 1
[P2] [P2] Reconcile the general catalog on status-only settlement
apps/android/app/src/main/java/ai/openclaw/app/NodeRuntime.kt:5416
This branch refreshes only the provider-config catalog. The general `_modelCatalog` also comes from `models.list`, but unlike the provider and chat catalogs it neither records `hasPendingProviders` nor receives a follow-up read here. If its initial response is partial while providers are pending, the later `modelCatalogStatusChanged` event leaves its availability/auth rows stale indefinitely until a manual refresh or unrelated invalidation, potentially continuing to hide or disable models after discovery completes.

overall: patch is incorrect (0.94)
The legacy-hint cadence, active-read joining, scope resets, and provider/chat status reconciliation are generally covered by the supplied implementation and tests. However, status-only provider settlement is not propagated to NodeRuntime's general model catalog, leaving one of the three catalog owners stale after a pending discovery completes.
