import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, unlinkSync, writeFileSync, type Dirent } from "node:fs";
import path from "node:path";
import { normalizeProviderId } from "@openclaw/model-catalog-core/provider-id";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { isErrno } from "../infra/errno.js";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { withOpenClawAgentDatabaseReadOnly } from "../state/openclaw-agent-db-readonly.js";
import type { DB as OpenClawAgentKyselyDatabase } from "../state/openclaw-agent-db.generated.js";
import { runOpenClawAgentWriteTransaction } from "../state/openclaw-agent-db.js";
import {
  resolveAuthProfileDatabaseOwnerId,
  resolveAuthProfileDatabasePath,
} from "./auth-profiles/sqlite.js";
import { withPluginModelCatalogWriteLockSync } from "./plugin-model-catalog-lock.js";
import { isGeneratedPluginModelCatalog } from "./plugin-model-catalog-repair.js";

const PLUGIN_MODEL_CATALOG_FILE = "catalog.json";
const PLUGIN_MODEL_CATALOG_CACHE_SCOPE = "plugin-model-catalog-v1";
const PLUGIN_MODEL_CATALOG_MIGRATION_SCOPE = "plugin-model-catalog-migration-v1";
export const PLUGIN_MODEL_CATALOG_LOGOUT_SCOPE = "plugin-model-catalog-logout-v1";
export const PLUGIN_MODEL_CATALOG_GENERATION_SCOPE = "plugin-model-catalog-generation-v1";
const PLUGIN_MODEL_CATALOG_GENERATION_KEY = "catalog";
const INITIAL_CATALOG_GENERATION = "initial";

type PluginModelCatalogDatabase = Pick<OpenClawAgentKyselyDatabase, "cache_entries">;

function pluginModelCatalogDatabaseOptions(agentDir: string) {
  return {
    agentId: resolveAuthProfileDatabaseOwnerId(agentDir),
    path: resolveAuthProfileDatabasePath(agentDir),
  };
}

export function readPersistedPluginModelCatalogGeneration(agentDir: string): string {
  const result = withOpenClawAgentDatabaseReadOnly((database) => {
    const kysely = getNodeSqliteKysely<PluginModelCatalogDatabase>(database.db);
    return executeSqliteQuerySync(
      database.db,
      kysely
        .selectFrom("cache_entries")
        .select("value_json")
        .where("scope", "=", PLUGIN_MODEL_CATALOG_GENERATION_SCOPE)
        .where("key", "=", PLUGIN_MODEL_CATALOG_GENERATION_KEY),
    ).rows[0]?.value_json;
  }, pluginModelCatalogDatabaseOptions(agentDir));
  if (!result.found || !result.value) {
    return INITIAL_CATALOG_GENERATION;
  }
  try {
    const parsed = JSON.parse(result.value);
    return isRecord(parsed) && typeof parsed.generation === "string"
      ? parsed.generation
      : INITIAL_CATALOG_GENERATION;
  } catch {
    return INITIAL_CATALOG_GENERATION;
  }
}

export function isActivePluginModelCatalogLogoutFence(valueJson: string | null): boolean {
  if (!valueJson) {
    return true;
  }
  try {
    const parsed = JSON.parse(valueJson);
    return !isRecord(parsed) || parsed.loggedOut !== false;
  } catch {
    return true;
  }
}

export function retireCommittedPluginModelCatalogMigration(params: {
  agentDir: string;
  pluginId: string;
  contents: string;
}): boolean {
  return runOpenClawAgentWriteTransaction(
    (database) => {
      const kysely = getNodeSqliteKysely<PluginModelCatalogDatabase>(database.db);
      const committed = executeSqliteQuerySync(
        database.db,
        kysely
          .selectFrom("cache_entries")
          .select(["scope", "value_json"])
          .where("key", "=", params.pluginId)
          .where("scope", "in", [
            PLUGIN_MODEL_CATALOG_CACHE_SCOPE,
            PLUGIN_MODEL_CATALOG_MIGRATION_SCOPE,
          ]),
      ).rows;
      const contentsByScope = new Map(committed.map((row) => [row.scope, row.value_json]));
      if (
        contentsByScope.get(PLUGIN_MODEL_CATALOG_CACHE_SCOPE) !== params.contents ||
        contentsByScope.get(PLUGIN_MODEL_CATALOG_MIGRATION_SCOPE) !== params.contents
      ) {
        return false;
      }
      executeSqliteQuerySync(
        database.db,
        kysely
          .deleteFrom("cache_entries")
          .where("scope", "=", PLUGIN_MODEL_CATALOG_MIGRATION_SCOPE)
          .where("key", "=", params.pluginId),
      );
      return true;
    },
    pluginModelCatalogDatabaseOptions(params.agentDir),
    { operationLabel: "plugin-model-catalog.retire-migration" },
  );
}

function isPluginModelCatalogMigrationFile(filename: string): boolean {
  return (
    filename === PLUGIN_MODEL_CATALOG_FILE ||
    filename.startsWith(`${PLUGIN_MODEL_CATALOG_FILE}.doctor-importing-`)
  );
}

function readLegacyPluginModelCatalog(pathname: string): string | null {
  try {
    return readFileSync(pathname, "utf8");
  } catch (error) {
    if (isErrno(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function rewriteCatalogWithoutProvider(params: { contents: string; providerId: string }): {
  contents: string;
  generated: boolean;
  matched: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(params.contents);
  } catch {
    return { contents: params.contents, generated: false, matched: false };
  }
  if (!isGeneratedPluginModelCatalog(parsed) || !isRecord(parsed) || !isRecord(parsed.providers)) {
    return { contents: params.contents, generated: false, matched: false };
  }
  const providers = Object.fromEntries(
    Object.entries(parsed.providers).filter(
      ([provider]) => normalizeProviderId(provider) !== params.providerId,
    ),
  );
  if (Object.keys(providers).length === Object.keys(parsed.providers).length) {
    return { contents: params.contents, generated: true, matched: false };
  }
  return { contents: JSON.stringify({ ...parsed, providers }), generated: true, matched: true };
}

/** Prevents a stale writer from republishing a provider after logout. */
export function filterGeneratedPluginModelCatalogForLoggedOutProviders(params: {
  contents: string;
  providerIds: ReadonlySet<string>;
}): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(params.contents);
  } catch {
    return params.contents;
  }
  if (!isGeneratedPluginModelCatalog(parsed) || !isRecord(parsed) || !isRecord(parsed.providers)) {
    return params.contents;
  }
  const providers = Object.fromEntries(
    Object.entries(parsed.providers).filter(
      ([provider]) => !params.providerIds.has(normalizeProviderId(provider)),
    ),
  );
  if (Object.keys(providers).length === Object.keys(parsed.providers).length) {
    return params.contents;
  }
  return Object.keys(providers).length > 0 ? JSON.stringify({ ...parsed, providers }) : null;
}

function hasNoRemainingProviders(contents: string): boolean {
  const parsed: unknown = JSON.parse(contents);
  return (
    isRecord(parsed) && isRecord(parsed.providers) && Object.keys(parsed.providers).length === 0
  );
}

function removeLegacyPluginModelCatalogsForProvider(params: {
  agentDir: string;
  providerId: string;
}): number {
  const pluginsDir = path.join(params.agentDir, "plugins");
  let pluginDirs: Dirent[];
  try {
    pluginDirs = readdirSync(pluginsDir, { withFileTypes: true });
  } catch (error) {
    if (isErrno(error) && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }

  let changed = 0;
  for (const pluginDir of pluginDirs) {
    if (!pluginDir.isDirectory()) {
      continue;
    }
    const pluginPath = path.join(pluginsDir, pluginDir.name);
    let catalogFiles: Dirent[];
    try {
      catalogFiles = readdirSync(pluginPath, { withFileTypes: true });
    } catch (error) {
      if (isErrno(error) && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    for (const catalogFile of catalogFiles) {
      if (!catalogFile.isFile() || !isPluginModelCatalogMigrationFile(catalogFile.name)) {
        continue;
      }
      const pathname = path.join(pluginPath, catalogFile.name);
      const contents = readLegacyPluginModelCatalog(pathname);
      if (contents === null) {
        continue;
      }
      const rewritten = rewriteCatalogWithoutProvider({
        contents,
        providerId: params.providerId,
      });
      if (!rewritten.generated || !rewritten.matched) {
        continue;
      }
      if (hasNoRemainingProviders(rewritten.contents)) {
        unlinkSync(pathname);
      } else {
        writeFileSync(pathname, rewritten.contents, "utf8");
      }
      changed += 1;
    }
  }
  return changed;
}

/** Removes generated catalog copies for a provider after its auth profile is logged out. */
export function removePersistedPluginModelCatalogsForProvider(params: {
  agentDir?: string;
  agentDirs?: readonly string[];
  provider: string;
  lockAlreadyHeld?: boolean;
}): number {
  const providerId = normalizeProviderId(params.provider);
  const agentDirs = [
    ...new Set(
      [...(params.agentDirs ?? []), ...(params.agentDir ? [params.agentDir] : [])].map((agentDir) =>
        path.resolve(agentDir),
      ),
    ),
  ];
  let changedAcrossAgents = 0;
  for (const agentDir of agentDirs) {
    const runWithCatalogLock = <T>(run: () => T): T =>
      params.lockAlreadyHeld ? run() : withPluginModelCatalogWriteLockSync(agentDir, run);
    const legacyChanged = runWithCatalogLock(() =>
      removeLegacyPluginModelCatalogsForProvider({
        agentDir,
        providerId,
      }),
    );
    const persistedChanged = runWithCatalogLock(() =>
      runOpenClawAgentWriteTransaction(
        (database) => {
          const kysely = getNodeSqliteKysely<PluginModelCatalogDatabase>(database.db);
          const generation = randomUUID();
          const now = Date.now();
          executeSqliteQuerySync(
            database.db,
            kysely
              .insertInto("cache_entries")
              .values({
                scope: PLUGIN_MODEL_CATALOG_GENERATION_SCOPE,
                key: PLUGIN_MODEL_CATALOG_GENERATION_KEY,
                value_json: JSON.stringify({ generation }),
                blob: null,
                expires_at: null,
                updated_at: now,
              })
              .onConflict((conflict) =>
                conflict.columns(["scope", "key"]).doUpdateSet({
                  value_json: JSON.stringify({ generation }),
                  updated_at: now,
                }),
              ),
          );
          executeSqliteQuerySync(
            database.db,
            kysely
              .insertInto("cache_entries")
              .values({
                scope: PLUGIN_MODEL_CATALOG_LOGOUT_SCOPE,
                key: providerId,
                value_json: JSON.stringify({ generation, loggedOut: true, loggedOutAt: now }),
                blob: null,
                expires_at: null,
                updated_at: Date.now(),
              })
              .onConflict((conflict) =>
                conflict.columns(["scope", "key"]).doUpdateSet({
                  value_json: JSON.stringify({ generation, loggedOut: true, loggedOutAt: now }),
                  updated_at: now,
                }),
              ),
          );
          const rows = executeSqliteQuerySync(
            database.db,
            kysely
              .selectFrom("cache_entries")
              .select(["scope", "key", "value_json"])
              .where("scope", "in", [
                PLUGIN_MODEL_CATALOG_CACHE_SCOPE,
                PLUGIN_MODEL_CATALOG_MIGRATION_SCOPE,
              ]),
          ).rows;
          let changed = 0;
          for (const row of rows) {
            if (row.value_json === null) {
              continue;
            }
            const rewritten = rewriteCatalogWithoutProvider({
              contents: row.value_json,
              providerId,
            });
            const generatedPluginIdMatches =
              rewritten.generated && normalizeProviderId(row.key) === providerId;
            if (!rewritten.matched && !generatedPluginIdMatches) {
              continue;
            }
            if (row.scope === PLUGIN_MODEL_CATALOG_MIGRATION_SCOPE) {
              if (rewritten.matched) {
                if (!hasNoRemainingProviders(rewritten.contents)) {
                  executeSqliteQuerySync(
                    database.db,
                    kysely
                      .updateTable("cache_entries")
                      .set({ value_json: rewritten.contents, updated_at: Date.now() })
                      .where("scope", "=", row.scope)
                      .where("key", "=", row.key)
                      .where("value_json", "=", row.value_json),
                  );
                } else {
                  executeSqliteQuerySync(
                    database.db,
                    kysely
                      .deleteFrom("cache_entries")
                      .where("scope", "=", row.scope)
                      .where("key", "=", row.key)
                      .where("value_json", "=", row.value_json),
                  );
                }
              } else {
                executeSqliteQuerySync(
                  database.db,
                  kysely
                    .deleteFrom("cache_entries")
                    .where("scope", "=", row.scope)
                    .where("key", "=", row.key)
                    .where("value_json", "=", row.value_json),
                );
              }
              changed += 1;
              continue;
            }
            if (rewritten.matched) {
              executeSqliteQuerySync(
                database.db,
                kysely
                  .updateTable("cache_entries")
                  .set({ value_json: rewritten.contents, updated_at: Date.now() })
                  .where("scope", "=", row.scope)
                  .where("key", "=", row.key)
                  .where("value_json", "=", row.value_json),
              );
            } else {
              executeSqliteQuerySync(
                database.db,
                kysely
                  .deleteFrom("cache_entries")
                  .where("scope", "=", row.scope)
                  .where("key", "=", row.key)
                  .where("value_json", "=", row.value_json),
              );
            }
            changed += 1;
          }
          return changed;
        },
        pluginModelCatalogDatabaseOptions(agentDir),
        { operationLabel: "plugin-model-catalog.logout" },
      ),
    );
    changedAcrossAgents += legacyChanged + persistedChanged;
  }
  return changedAcrossAgents;
}

/** Clears the logout fence after a provider is authenticated again. */
export function clearPersistedPluginModelCatalogProviderInvalidation(params: {
  agentDir?: string;
  agentDirs?: readonly string[];
  provider: string;
  lockAlreadyHeld?: boolean;
}): void {
  const providerId = normalizeProviderId(params.provider);
  const agentDirs = [
    ...new Set(
      [...(params.agentDirs ?? []), ...(params.agentDir ? [params.agentDir] : [])].map((agentDir) =>
        path.resolve(agentDir),
      ),
    ),
  ];
  for (const agentDir of agentDirs) {
    const clear = () =>
      runOpenClawAgentWriteTransaction(
        (database) => {
          const kysely = getNodeSqliteKysely<PluginModelCatalogDatabase>(database.db);
          const generation = randomUUID();
          const now = Date.now();
          executeSqliteQuerySync(
            database.db,
            kysely
              .insertInto("cache_entries")
              .values({
                scope: PLUGIN_MODEL_CATALOG_GENERATION_SCOPE,
                key: PLUGIN_MODEL_CATALOG_GENERATION_KEY,
                value_json: JSON.stringify({ generation }),
                blob: null,
                expires_at: null,
                updated_at: now,
              })
              .onConflict((conflict) =>
                conflict.columns(["scope", "key"]).doUpdateSet({
                  value_json: JSON.stringify({ generation }),
                  updated_at: now,
                }),
              ),
          );
          executeSqliteQuerySync(
            database.db,
            kysely
              .insertInto("cache_entries")
              .values({
                scope: PLUGIN_MODEL_CATALOG_LOGOUT_SCOPE,
                key: providerId,
                value_json: JSON.stringify({ generation, loggedOut: false, loggedInAt: now }),
                blob: null,
                expires_at: null,
                updated_at: now,
              })
              .onConflict((conflict) =>
                conflict.columns(["scope", "key"]).doUpdateSet({
                  value_json: JSON.stringify({ generation, loggedOut: false, loggedInAt: now }),
                  updated_at: now,
                }),
              ),
          );
        },
        pluginModelCatalogDatabaseOptions(agentDir),
        { operationLabel: "plugin-model-catalog.login" },
      );
    if (params.lockAlreadyHeld) {
      clear();
    } else {
      withPluginModelCatalogWriteLockSync(agentDir, clear);
    }
  }
}
