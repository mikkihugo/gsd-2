import type { ExtensionAPI, ExtensionCommandContext } from "@sf-run/pi-coding-agent";

import { SF_COMMAND_DESCRIPTION, getGsdArgumentCompletions } from "./catalog.js";

export function registerGSDCommand(pi: ExtensionAPI): void {
  pi.registerCommand("gsd", {
    description: SF_COMMAND_DESCRIPTION,
    getArgumentCompletions: getGsdArgumentCompletions,
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const { handleGSDCommand } = await import("./dispatcher.js");
      const { setStderrLoggingEnabled } = await import("../workflow-logger.js");
      const previousStderrSetting = setStderrLoggingEnabled(false);
      try {
        await handleGSDCommand(args, ctx, pi);
      } finally {
        setStderrLoggingEnabled(previousStderrSetting);
      }
    },
  });
}
