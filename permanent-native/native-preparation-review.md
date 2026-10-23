# Native recovery capability preparation review

The real task-only Gateway reproduction identified a main-thread `process.report.getReport()` wait inside proc-safe 0.4.2 Linux target detection after an archive/reconcile worker was held in native I/O. The supported `@openclaw/proc-safe/systemd` `isSupported()` operation loads that same cached native capability without opening a systemd manager connection.

The existing `registerGatewayRuntimeRecovery` owner now prepares this capability synchronously only for a lifecycle-owned systemd Gateway. The registration precedes `beginBoot` and `params.start` in the run loop. A failed preparation is retained as a report-only result, while successful preparation still requires fresh effective service command, running state, Node executable viability, lifecycle currency, and actual unsettled-worker checks at recovery time. No service result is cached.

This adds no runtime owner, product setting, watchdog, dependency patch, or global diagnostic-report hook. Non-systemd and non-owned lifecycles do not prepare this capability. Tests exercise eager ordering, absence of a late second preparation, unavailable-capability refusal, and non-owned/non-systemd exclusions. Independent read-only review found no substantive defect.

Unit tests establish ordering and branch behavior; they do not establish the actual native deadlock is removed. Parent-owned exact final-head native service proof remains required.
