import fs from "node:fs/promises";
import type { Worker } from "node:worker_threads";

export const SQLITE_ARCHIVE_TASK_TIMEOUT_MS = 180_000;

const cleanups = new WeakMap<Worker, Promise<void>>();

/** Paired worker messages are delivered before exit; cleanup never overlaps native I/O. */
export function trackSqliteArchiveWorkerCleanup(worker: Worker): void {
  const paths = new Set<string>();
  worker.on("message", (message: { type: string; filePath: string; retained: boolean }) => {
    if (message.type === "archive-temporary-file") {
      if (message.retained) {
        paths.add(message.filePath);
      } else {
        paths.delete(message.filePath);
      }
    }
  });
  const cleanup = new Promise<void>((resolve, reject) => {
    worker.once("exit", () => {
      void Promise.all([...paths].map((filePath) => fs.rm(filePath, { force: true }))).then(
        () => resolve(),
        reject,
      );
    });
  });
  cleanups.set(worker, cleanup);
  void cleanup.catch(() => {});
}

export function joinSqliteArchiveWorkerCleanup(worker: Worker): Promise<void> | undefined {
  return cleanups.get(worker);
}
