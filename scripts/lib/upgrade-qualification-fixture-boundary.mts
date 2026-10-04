import { constants, watch } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export async function awaitBoundary(directory: string, timeout: number, failed: Promise<unknown>) {
  const filename = path.join(directory, "boundary.json");
  const watcher = watch(directory);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<unknown>((resolve, reject) => {
      let reading = false;
      const inspect = async () => {
        if (reading) {
          return;
        }
        reading = true;
        try {
          const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            resolve(JSON.parse(await handle.readFile("utf8")));
          } finally {
            await handle.close();
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        } finally {
          reading = false;
        }
      };
      watcher.on("change", () => {
        void inspect();
      });
      watcher.on("error", reject);
      timer = setTimeout(
        () => reject(new Error("Required crash boundary was never reached.")),
        timeout,
      );
      failed.then(
        () => reject(new Error("Runner exited without reaching its required crash boundary.")),
        reject,
      );
      void inspect();
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    watcher.close();
  }
}
