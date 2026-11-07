# Retained failed attempts

- Original head d7b6b7bb: built Gateway and `sessions.create` worked, but HTTP `/tools/invoke` returned404 `Tool not available: read`. The public HTTP surface excludes base coding tools. No file-tool proof from that attempt is claimed. Original receipt/log remain retained locally.
- Current45e8df9c: attempted a real-model `agent exec` using ambient configuration with isolated `--state-dir`. Plugin discovery nevertheless tried ambient state and encountered `GatewayStateOwnerContentionError`; cancelled with SIGTERM, exit143, after27.38seconds, before inference or tool calls. The live Gateway was not stopped, and ownership was not bypassed. All task subprocesses were verified gone. No successful real-model run is claimed.

The passing trace uses a clearly disclosed scripted model transport with pinned synthetic configuration; actual shipped CLI, runtime tool owners, containment checks and filesystem operations execute unmodified.
