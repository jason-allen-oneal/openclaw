# Android timeout follow-up

## Comparable passing run found

The same PR's earlier head `2dee5c7` passed [android-test-third-party job 124094718154](https://github.com/openclaw/openclaw/actions/runs/41065017584/job/124094718154), testing synthetic merge `fbadc26f61c611300929c0a301276bfaea155b7b`. Job wall time was 12m48s; Gradle reported 11m46s; the actual test task took about 7m22s.

The failed job tested `86b02607`, and the entire Android directory entries/tree hashes and complete CI workflow blob are identical to that passing merge. They also match new local head `bf1debacae768ac8da1a8ee496f99fc1b53323fe` and freshly verified main `d513a1144009efebd2f87bbbff0581741b062833` for Android owners. No Android change was made by the worker/UI fix commits.

Both PR jobs used the same command:

```sh
./gradlew --continue --no-daemon --build-cache --init-script "$OPENCLAW_ROBOLECTRIC_INIT" :app:testThirdPartyDebugUnitTest
```

Both had the same Blacksmith 8-vCPU runner label, `CI_RUNNER_BACKEND=github`, `CI_MAIN_QUALIFICATION=false`, Temurin 21.0.12.1+1-LTS, one test JVM fork, the same Robolectric cache key, no sticky Gradle user home, and one FROM-CACHE Gradle task. This is a substantially stronger comparison than main alone. It is not proof of identical actual CPU availability, contention, network behavior or per-test order.

The failed job took about 8m40s from Gradle-step start to the test task versus 4m25s in the prior pass. Its test task then ran about 9m38s before the 20-minute job timeout, versus 7m22s to finish in the prior pass. Neither output exposes individual test names/results while running. No test report was uploaded for the canceled job, so a specific hung/failing test remains unestablished.

## Main comparison and upstream search

The nearest scheduled-main run [124089261977](https://github.com/openclaw/openclaw/actions/runs/41063477930/job/124089261977) passed in 10m33s job wall, 8m9s Gradle wall. It ran the same Android source/workflow and JDK, but used `CI_RUNNER_BACKEND=blacksmith`, two test forks, sticky Gradle storage, and 31 FROM-CACHE tasks. Two preceding scheduled-main third-party jobs also passed in 8m57s and 10m27s. Those are useful context, **not matched fork-PR environments**.

Fresh main has no Android source or CI-workflow change since the failure. Targeted issues/PR searches found no diagnosed exact timeout fix. The existing September Android parallel-fork/headroom changes are already present in all compared trees; they are not a new repair to import.

## Recommendation

Proceed with the already-needed substantive new-head push and observe its natural Android CI job. Do not run a broad local suite, change source, increase timeouts, weaken assertions, or retry an old job just for green. A new passing result would satisfy that new-head check, not prove the old timeout's cause was fixed.

If the new head times out again, capture that completed job once and compare phase timings, cache use, test JVM fork/CPU settings and report availability against the matched earlier pass. Then use a separately qualified Linux/Android/JDK21 environment to reproduce the same single third-party Gradle task with per-test start/finish reporting and a bounded thread dump before cancellation. Preserve partial XML/binary reports. This discriminates slow compilation, a blocked test, network dependency and runner contention without changing production/tests. Preserve the fork trust/cache boundary; do not simply relabel a fork job as trusted Blacksmith to obtain parallelism or sticky caches.

No remote reruns, source/workflow changes or local tests were performed. All comparisons are exact-SHA/log observations; remaining runtime-cause uncertainty is explicit.
