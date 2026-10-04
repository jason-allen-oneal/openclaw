import { openOpenClawStateDatabase } from "./openclaw-state-db.js";
import {
  createSqliteWorkerBackend as createBackend,
  openExistingSqliteWorkerBackend as openExistingBackend,
} from "./openclaw-state.worker.js";

function withBackupFault(backend: ReturnType<typeof createBackend>, databasePath: string) {
  return {
    ...backend,
    execute(command: Parameters<typeof backend.execute>[0]) {
      if (command.type !== "pluginState.register") {
        return backend.execute(command);
      }
      // Admission remains canonical; only this connection's write receives the fault.
      const { db } = openOpenClawStateDatabase({ path: databasePath });
      db.exec(`CREATE TEMP TRIGGER backup_fixture_failure
        BEFORE UPDATE ON plugin_state_entries
        WHEN OLD.plugin_id = 'memory-core' AND OLD.namespace = 'dreaming-memory-backups'
        BEGIN SELECT RAISE(ABORT, 'synthetic backup storage failure'); END`);
      try {
        return backend.execute(command);
      } finally {
        db.exec("DROP TRIGGER temp.backup_fixture_failure");
      }
    },
  };
}

export function createSqliteWorkerBackend(...args: Parameters<typeof createBackend>) {
  return withBackupFault(createBackend(...args), args[1].databasePath);
}

export function openExistingSqliteWorkerBackend(...args: Parameters<typeof openExistingBackend>) {
  return withBackupFault(openExistingBackend(...args), args[1].databasePath);
}
