import type { ExtensionAPI } from "@sf-run/pi-coding-agent";
import * as server from "./proxy-server.js";

export function registerProxyCommands(pi: ExtensionAPI): void {
  pi.registerCommand("genai-proxy", {
    description: "Manage GenAI Proxy server — start | stop | status",
    async handler(args, ctx) {
      const parts = (args ?? "").trim().split(/\s+/);
      const subcommand = parts[0] || "status";

      switch (subcommand) {
        case "start":
          const port = parseInt(parts[1], 10) || 3000;
          if (server.isRunning()) {
            ctx.ui.notify("GenAI Proxy is already running.", "info");
            return;
          }
          await server.startProxy(port, (msg) => {
            if (ctx.hasUI) {
               ctx.ui.notify(msg, "info");
            } else {
               process.stderr.write(`[genai-proxy] ${msg}\n`);
            }
          });
          ctx.ui.notify(`GenAI Proxy started on port ${port}`, "success");
          break;

        case "stop":
          if (!server.isRunning()) {
            ctx.ui.notify("GenAI Proxy is not running.", "warning");
            return;
          }
          server.stopProxy();
          ctx.ui.notify("GenAI Proxy stopped.", "success");
          break;

        case "status":
          if (server.isRunning()) {
            ctx.ui.notify("GenAI Proxy is running.", "info");
          } else {
            ctx.ui.notify("GenAI Proxy is not running.", "info");
          }
          break;

        default:
          ctx.ui.notify("Usage: /genai-proxy start [port] | stop | status", "warning");
      }
    },
  });
}
