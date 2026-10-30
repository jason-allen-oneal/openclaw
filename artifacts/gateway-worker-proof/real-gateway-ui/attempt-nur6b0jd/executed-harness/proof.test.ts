import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "<candidate-checkout>/node_modules/vitest/dist/index.js";
import { createOpenClawTestInstance } from "<candidate-checkout>/test/helpers/openclaw-test-instance.ts";
import { importSqliteSessionRows } from "<candidate-checkout>/src/config/sessions/session-accessor.sqlite-import.test-support.ts";
import { cleanupSessionStateForTest } from "<candidate-checkout>/src/test-utils/session-state-cleanup.ts";
import { resolveTargetSqlitePath } from "<candidate-checkout>/src/infra/session-sqlite-migration-readers.ts";
import { createSessionSqliteMigrationRun, writeSessionSqliteMigrationManifest } from "<candidate-checkout>/src/infra/session-sqlite-migration-manifest.ts";
import { readMigrationArtifactIdentity } from "<candidate-checkout>/src/infra/session-sqlite-migration-artifact.ts";
import { resolveUpdateCaptureRoot } from "<candidate-checkout>/src/infra/update-capture-paths.ts";
import { createControlUiE2eArtifactDir } from "<candidate-checkout>/ui/src/test-helpers/control-ui-e2e-artifacts.ts";
import { pairControlUiPage } from "<candidate-checkout>/ui/src/test-helpers/control-ui-browser-pairing.ts";
import { waitForControlUiGatewayReady } from "<candidate-checkout>/ui/src/test-helpers/control-ui-e2e-readiness.ts";
import { waitForControlUiRoute } from "<candidate-checkout>/ui/src/test-helpers/control-ui-e2e.ts";
import { takeControlUiScreenshotFrame } from "<candidate-checkout>/ui/src/test-helpers/control-ui-e2e-screenshot.ts";
import { createControlUiE2eSuite } from "<candidate-checkout>/ui/src/e2e/control-ui-e2e-suite.test-support.ts";

const repo = "<candidate-checkout>";
let owner: Awaited<ReturnType<typeof createOpenClawTestInstance>>;
let artifactDir: string;
let target: { agentId: string; storePath: string };
let sqlitePath: string;
let fixture: { files: string[]; manifestPath: string } | undefined;
const results: unknown[] = [];
const assetHashes: Record<string, string> = {};
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const hashFiles = (files: string[]) => Object.fromEntries(files.map((file) => [path.basename(file), sha(fs.readFileSync(file))]));
const sanitize = (value: unknown) => {
  let text = JSON.stringify(value);
  for (const secret of [owner?.gatewayToken, owner?.hookToken]) {
    if (secret) text = text.replaceAll(secret, "<synthetic-token-redacted>");
  }
  if (owner) text = text.replaceAll(owner.state.root, "<isolated-state>");
  text = text.replaceAll(repo, "<candidate-checkout>")
    .replace(/(?:127\.0\.0\.1|localhost):\d+/gu, "<isolated-loopback>")
    .replace(/([?&#](?:token|code|handoff|ticket|password)=)[^&\s"\\]+/gu, "$1<redacted>");
  return JSON.parse(text);
};
function save(name: string, value: unknown) {
  fs.writeFileSync(path.join(artifactDir, name), JSON.stringify(sanitize(value), null, 2) + "\n");
}
function seedArchives() {
  const archiveDir = path.join(owner.stateDir, "agents/main/session-sqlite-import-archive");
  fs.mkdirSync(archiveDir, { recursive: true });
  const files = [path.join(archiveDir, "history.trajectory.jsonl.imported-1"), path.join(archiveDir, "changed.jsonl.imported-1")];
  fs.writeFileSync(files[0], JSON.stringify({ traceSchema: 1, event: "synthetic_unique_historical_event", payload: "Not represented in active SQLite" }) + "\n");
  fs.writeFileSync(files[1], JSON.stringify({ type: "session", version: 3, id: "22222222-2222-4222-8222-222222222222" }) + "\n");
  const previousIdentity = readMigrationArtifactIdentity(files[1]);
  const run = createSessionSqliteMigrationRun(owner.env, [{ ...target, sqlitePath }]);
  const moves = files.map((archivePath, index) => ({
    archivePath, sourcePath: path.join(path.dirname(target.storePath), index ? "changed.jsonl" : "history.trajectory.jsonl"),
    kind: index ? "transcript" as const : "trajectory" as const,
    ...(index ? { artifact: { identity: previousIdentity, classification: "imported" as const, reason: "verified-import", dependencies: [], disposal: { state: "retained" as const } } } : {}),
  }));
  run.manifest.targets[0].plannedMoves = structuredClone(moves);
  run.manifest.targets[0].completedMoves = structuredClone(moves);
  run.manifest.targets[0].validationBeforeArchive = "passed";
  run.manifest.completedAt = run.manifest.startedAt;
  writeSessionSqliteMigrationManifest(run);
  fs.appendFileSync(files[1], JSON.stringify({ type: "message", id: "later-unique", parentId: null, message: { role: "user", content: "Changed bytes after recorded import identity" } }) + "\n");
  fixture = { files, manifestPath: run.manifestPath };
  save("synthetic-fixture.json", { label: "Synthetic archive data; no live installation or model calls", ...fixture, archiveBytes: files.map((file) => fs.statSync(file).size), manifest: run.manifest });
}

const suite = createControlUiE2eSuite({
  name: "Recovery Storage actual built Gateway proof",
  startServerBeforeBrowser: true,
  setupTimeoutMs: 180_000,
  teardownTimeoutMs: 60_000,
  async startServer() {
    artifactDir = createControlUiE2eArtifactDir("real-gateway-recovery");
    owner = await createOpenClawTestInstance({
      name: "recovery-storage-proof", cwd: repo, entrypoint: ["dist/index.js"],
      env: { OPENCLAW_TEST_MINIMAL_GATEWAY: undefined, VITEST: undefined, NODE_ENV: undefined },
      startTimeoutMs: 120_000,
      config: {
        gateway: { controlUi: { enabled: true } },
        update: { channel: "stable", checkOnStart: false, auto: { enabled: false } },
        cron: { enabled: false },
        models: { catalogRefresh: { enabled: false } },
        agents: { entries: { main: { name: "Recovery Proof" } } },
        plugins: { allow: [] },
      },
    });
    owner.state.applyEnv();
    const config = JSON.parse(fs.readFileSync(owner.configPath, "utf8"));
    config.agents.defaults = { workspace: owner.state.workspaceDir };
    await owner.state.writeConfig(config);
    target = { agentId: "main", storePath: path.join(owner.stateDir, "agents/main/sessions/sessions.json") };
    await importSqliteSessionRows({ ...target, env: owner.env, sessionKey: "agent:main:recovery-proof",
      entry: { sessionId: "11111111-1111-4111-8111-111111111111", updatedAt: 1793361602000, label: "Synthetic recovery proof" },
      readTranscriptEvents: (append) => {
        append({ type: "session", version: 3, id: "11111111-1111-4111-8111-111111111111", timestamp: "2026-10-30T12:00:00.000Z" });
        append({ type: "message", id: "synthetic-user", parentId: null, timestamp: "2026-10-30T12:00:01.000Z", message: { role: "user", content: "Synthetic preserved conversation" } });
      },
    });
    await cleanupSessionStateForTest({ stateDir: owner.stateDir, rootPath: owner.state.root });
    sqlitePath = resolveTargetSqlitePath(target, owner.env);
    fs.mkdirSync(resolveUpdateCaptureRoot(owner.stateDir), { recursive: true });
    await owner.startGateway();
    expect(owner.env.NODE_ENV).toBeUndefined();
    expect(owner.env.VITEST).toBeUndefined();
    save("gateway-start.json", { execution: "built-process", minimalGateway: false, nodeEnv: owner.env.NODE_ENV ?? null, vitest: owner.env.VITEST ?? null, externalModelCalls: 0, readiness: owner.readiness, port: "isolated-free-port", assets: "actual dist/control-ui served by Gateway" });
    return {
      baseUrl: `http://127.0.0.1:${owner.port}/`,
      async close() {
        await owner.stopGateway();
        save("gateway-log.json", { logs: owner.logs() });
        save("results.json", { results, assetHashes, finalArchiveHashes: fixture ? hashFiles([...fixture.files, fixture.manifestPath]) : null });
        await owner.cleanup();
      },
    };
  },
});

suite.define(() => {
  it("renders empty, retained, and incomplete inventories through real RPC and measures three route-entry widths", async () => {
    for (const stage of ["empty", "retained", "incomplete"] as const) {
      if (stage === "retained") seedArchives();
      if (stage === "incomplete") fs.writeFileSync(path.join(path.dirname(fixture!.manifestPath), "synthetic-unreadable.json"), "{not-valid-json\n");
      const immutableBefore = fixture ? hashFiles([...fixture.files, fixture.manifestPath]) : null;
      for (const width of [400, 820, 1280]) {
        console.log(`[recovery-proof] starting ${stage}/${width}`);
        await suite.withPage({ colorScheme: "dark", locale: "en-US", serviceWorkers: "block", viewport: { width, height: 1100 } }, async ({ page }) => {
          const rpc: unknown[] = [], consoleEvents: unknown[] = [], pageErrors: string[] = [];
          const pending = new Map<string, { method: string; params: unknown }>();
          const assetReads: Promise<void>[] = [];
          page.on("console", (message) => consoleEvents.push({ type: message.type(), text: message.text() }));
          page.on("pageerror", (error) => pageErrors.push(error.message));
          page.on("response", (response) => {
            const url = new URL(response.url());
            if (url.origin === new URL(suite.server.baseUrl).origin && /\.(?:js|css)$/u.test(url.pathname)) {
              assetReads.push(response.body().then((body) => {
                assetHashes[url.pathname] = sha(body);
                expect(body.equals(fs.readFileSync(path.join(repo, "dist/control-ui", url.pathname)))).toBe(true);
              }));
            }
          });
          page.on("websocket", (socket) => {
            socket.on("framesent", (frame) => {
              let data; try { data = JSON.parse(String(frame.payload)); } catch { return; }
              if (data.type === "req" && data.method === "update.status") {
                pending.set(data.id, { method: data.method, params: data.params });
                rpc.push({ direction: "request", id: data.id, method: data.method, params: data.params });
                save(`${stage}-${width}-rpc.json`, rpc);
              }
              if (data.type === "req" && ["update.run", "update.recovery.cleanup"].includes(data.method)) rpc.push({ forbiddenMutation: data.method });
            });
            socket.on("framereceived", (frame) => {
              let data; try { data = JSON.parse(String(frame.payload)); } catch { return; }
              if (data.type === "res" && pending.has(data.id)) {
                rpc.push({ direction: "response", id: data.id, ok: data.ok, recoveryCopies: data.payload?.recoveryCopies, error: data.error });
                save(`${stage}-${width}-rpc.json`, rpc);
              }
            });
          });
          await pairControlUiPage(page, async (args) => {
            const response = await owner.cli(args, { timeoutMs: 60_000 });
            expect(response.code, response.stderr).toBe(0);
            return response.stdout;
          });
          await page.evaluate(() => { history.pushState(null, "", "/settings/profile"); window.dispatchEvent(new PopStateEvent("popstate")); });
          await waitForControlUiRoute(page, { pathname: "/settings/profile", routeId: "profile" });
          await waitForControlUiGatewayReady(page);
          await page.evaluate(async () => { await document.fonts.ready; });
          const shellSelector = await page.locator(".shell").evaluate((element) =>
            element.classList.contains("shell--mobile-nav") ? ".topbar-nav-toggle" : ".settings-sidebar__back",
          );
          await page.locator(shellSelector).waitFor({ state: "visible" });
          const chrome = () => page.locator(shellSelector).evaluate((element) => {
            const box = element.getBoundingClientRect();
            return [box.x, box.y, box.width, box.height];
          });
          const chromeBefore = await chrome();
          expect(chromeBefore[2]).toBeGreaterThan(0);
          expect(chromeBefore[3]).toBeGreaterThan(0);
          await page.evaluate(() => {
            const shifts: unknown[] = [];
            const record = (entries: PerformanceEntry[]) => entries.forEach((entry: any) => shifts.push({ value: entry.value, hadRecentInput: entry.hadRecentInput, sources: entry.sources?.map((source: any) => ({ node: source.node instanceof Element ? `${source.node.tagName}.${source.node.className}` : source.node?.nodeName, section: source.node instanceof Element ? source.node.closest(".settings-section")?.querySelector("h2,h3,h4")?.textContent : null, text: source.node?.textContent?.slice(0, 200), previousRect: source.previousRect, currentRect: source.currentRect })) }));
            const observer = new PerformanceObserver((list) => record(list.getEntries()));
            observer.observe({ type: "layout-shift" });
            Reflect.set(window, "__recoveryProofShifts", () => { record(observer.takeRecords()); return shifts; });
          });
          await page.evaluate(() => { history.pushState(null, "", "/settings/updates"); window.dispatchEvent(new PopStateEvent("popstate")); });
          const heading = page.getByRole("heading", { name: "Recovery storage", exact: true });
          const storage = page.locator(".settings-section").filter({ has: heading });
          await expect.poll(async () => {
            const failed: any = rpc.find((entry: any) => entry.direction === "response" && entry.ok === false);
            if (failed) throw new Error(`Real update.status failed: ${JSON.stringify(failed.error)}`);
            return heading.isVisible();
          }, { timeout: 60_000 }).toBe(true);
          await expect.poll(() => rpc.some((entry: any) => entry.direction === "response" && entry.recoveryCopies)).toBe(true);
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const shifts = await page.evaluate(() => Reflect.get(window, "__recoveryProofShifts")());
          const chromeAfter = await chrome();
          const text = await storage.textContent();
          const response: any = rpc.findLast((entry: any) => entry.direction === "response" && entry.recoveryCopies);
          const request: any = rpc.find((entry: any) => entry.direction === "request" && entry.id === response.id);
          const layout = await storage.evaluate((element) => ({ documentWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth, sectionWidth: element.getBoundingClientRect().width, sectionScrollWidth: element.scrollWidth }));
          const frame = await takeControlUiScreenshotFrame(page, storage, [heading, storage.getByRole("link", { name: "Safe recovery and retirement guidance" })], { animations: "disabled", scrollTo: storage, elements: [storage] });
          fs.writeFileSync(path.join(artifactDir, `${stage}-${width}.png`), frame.png);
          fs.writeFileSync(path.join(artifactDir, `${stage}-${width}-storage.png`), frame.elements[0].png);
          await Promise.all(assetReads);
          const item = { stage, width, height: 1100, rpc, text, shifts, shellSelector, chromeBefore, chromeAfter, layout, consoleEvents, pageErrors, screenshot: `${stage}-${width}.png` };
          results.push(item);
          save(`${stage}-${width}.json`, item);
          expect(request.params).toEqual({ includeRecoveryCopies: true });
          expect(response.ok).toBe(true);
          expect(response.recoveryCopies.total.count).toBe(stage === "empty" ? 0 : 2);
          if (stage !== "empty") {
            expect(text).toContain("artifact-metadata-changed");
            expect(response.recoveryCopies.total.logicalBytes).toBe(320);
          }
          if (stage === "retained") expect(text).toContain("historical-manifest-without-import-proof");
          if (stage === "incomplete") {
            expect(response.recoveryCopies.incomplete).toBe(true);
            expect(response.recoveryCopies.incompleteReasons).toContain("unreadable-manifest");
            expect(text).toContain("Incomplete inventory");
            expect(text).toContain("unreadable-recovery-dependencies");
          }
          expect(await storage.getByRole("button").count()).toBe(0);
          expect(rpc.some((entry: any) => entry.forbiddenMutation)).toBe(false);
          expect(pageErrors).toEqual([]);
          const recoveryShifts = shifts.filter((entry: any) => entry.sources?.some((source: any) => source.section === "Recovery storage"));
          expect.soft(recoveryShifts, `${stage}/${width} Recovery storage route entry layout shifts`).toEqual([]);
          expect.soft(chromeAfter, `${stage}/${width} shell geometry`).toEqual(chromeBefore);
          expect.soft(layout.documentScrollWidth, `${stage}/${width} document overflow`).toBeLessThanOrEqual(width);
        });
      }
      if (fixture) {
        const immutableAfter = hashFiles([...fixture.files, fixture.manifestPath]);
        save(`${stage}-preservation.json`, { before: immutableBefore, after: immutableAfter });
        expect(immutableAfter).toEqual(immutableBefore);
      }
    }
    save("completion.json", { executionFinished: true, assertionsPassed: "See authoritative command.json exitCode; soft failures may remain", scenarios: results.length, apiMocked: false, servedAssetHashesVerified: Object.keys(assetHashes).length, readOnlyArchiveBytesVerified: true, realModelCalls: 0 });
  }, 600_000);
});
