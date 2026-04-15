import type { ExtensionAPI, ExtensionCommandContext } from "@sf-run/pi-coding-agent";

import { SF_COMMAND_DESCRIPTION, getGsdArgumentCompletions } from "./catalog.js";

export function registerSFCommand(pi: ExtensionAPI): void {
  pi.registerCommand("sf", {
    description: SF_COMMAND_DESCRIPTION,
    getArgumentCompletions: getGsdArgumentCompletions,
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const { handleSFCommand } = await import("./dispatcher.js");
      const { setStderrLoggingEnabled } = await import("../workflow-logger.js");
      const previousStderrSetting = setStderrLoggingEnabled(false);
      try {
        await handleSFCommand(args, ctx, pi);
      } finally {
        setStderrLoggingEnabled(previousStderrSetting);
      }
    },
  });
}
