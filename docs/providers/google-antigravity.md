---
summary: "Experimental delegated text inference through a local Google Antigravity agy CLI"
title: "Google Antigravity (experimental)"
read_when:
  - You want to route OpenClaw text inference through a signed-in Antigravity session
  - You need to understand the limits of the experimental agy backend
---

The `google-antigravity` plugin delegates one-shot text inference to a local signed-in `agy` command.

Antigravity is preview software. This integration is experimental and intentionally narrow. It does not implement ACP, OpenClaw-native tool calls, structured streaming events, persistent CLI sessions, or cancellation semantics.

## Requirements

- Antigravity and `agy` installed on the gateway host
- An existing signed-in Antigravity session
- `agy --help` advertising `--print`, `--model`, and `--print-timeout`

Verify the CLI directly:

```bash
agy --model gemini-3-flash --print "Reply exactly: AGY_OK" --print-timeout 2m0s
```

## Setup

```bash
openclaw models auth login --provider google-antigravity --set-default
```

Setup validates the local `agy` command contract and configures:

```json5
{
  agents: {
    defaults: {
      models: {
        "google-antigravity/gemini-3-flash": {
          agentRuntime: { id: "google-antigravity" },
        },
      },
    },
  },
}
```

Available model ids:

- `google-antigravity/gemini-3-flash`
- `google-antigravity/gemini-3-pro-low`
- `google-antigravity/gemini-3-pro-high`

Short aliases include `flash`, `pro`, `pro-low`, and `pro-high`.

## Authentication boundary

Antigravity owns Google authentication and session state. OpenClaw does not import or persist Antigravity OAuth tokens. The provider uses a non-secret local-runtime marker only so model discovery can recognize the configured CLI path.

Set `ANTIGRAVITY_USER_DATA_DIR` when Antigravity uses a non-default profile directory. OpenClaw forwards only that directory to `agy` and clears inherited Google API-key and project variables before execution.

## Limitations

The backend is stateless. OpenClaw reseeds uncompacted transcript context for each run and serializes executions. Because the current `agy --print` interface receives the prompt through argv, prompts are limited to 8,000 characters and may be visible to local process inspection while the command is running.

The backend declares native tools as always available because `agy` controls its own internal capabilities. OpenClaw does not claim tool negotiation or permission interoperability for this integration.
