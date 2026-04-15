import type { ExtensionAPI } from "@sf-run/pi-coding-agent";
import { registerProxyCommands } from "./proxy-command.js";

/**
 * GenAI Proxy Extension
 * 
 * Exposes Singularity Forge's AI engine (pi-ai) as a standard Google GenAI 
 * compatible endpoint. This allows you to use your OAuth-authenticated 
 * Google models with any tool or SDK.
 */
export default function genaiProxy(pi: ExtensionAPI) {
  // Register /genai-proxy commands
  registerProxyCommands(pi);
}
