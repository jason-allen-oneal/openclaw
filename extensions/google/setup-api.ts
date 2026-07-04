// Google API module exposes the plugin public contract.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildGoogleAntigravityCliBackend } from "./antigravity-cli-backend.js";
import { buildGoogleAntigravityProvider } from "./antigravity-provider.js";
import { buildGoogleGeminiCliBackend } from "./cli-backend.js";
import { createGoogleVertexProvider } from "./provider-contract-api.js";

export default definePluginEntry({
  id: "google",
  name: "Google Setup",
  description: "Lightweight Google setup hooks",
  register(api) {
    api.registerProvider(buildGoogleAntigravityProvider());
    api.registerProvider(createGoogleVertexProvider());
    api.registerCliBackend(buildGoogleAntigravityCliBackend());
    api.registerCliBackend(buildGoogleGeminiCliBackend());
  },
});
