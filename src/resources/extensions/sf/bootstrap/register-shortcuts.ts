import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@sf-run/pi-coding-agent";
import { Key } from "@sf-run/pi-tui";

import { GSDDashboardOverlay } from "../dashboard-overlay.js";
import { GSDNotificationOverlay } from "../notification-overlay.js";
import { ParallelMonitorOverlay } from "../parallel-monitor-overlay.js";
import { SF_SHORTCUTS } from "../shortcut-defs.js";
import { projectRoot } from "../commands/context.js";
import { shortcutDesc } from "../../shared/mod.js";

export function registerShortcuts(pi: ExtensionAPI): void {
  const overlayOptions = {
    width: "90%",
    minWidth: 80,
    maxHeight: "92%",
    anchor: "center",
  } as const;

  const openDashboardOverlay = async (ctx: ExtensionContext) => {
    const basePath = projectRoot();
    if (!existsSync(join(basePath, ".gsd"))) {
      ctx.ui.notify("No .gsd/ directory found. Run /gsd to start.", "info");
      return;
    }
    await ctx.ui.custom<boolean>(
      (tui, theme, _kb, done) => new GSDDashboardOverlay(tui, theme, () => done(true)),
      {
        overlay: true,
        overlayOptions,
      },
    );
  };

  const openNotificationsOverlay = async (ctx: ExtensionContext) => {
    await ctx.ui.custom<boolean>(
      (tui, theme, _kb, done) => new GSDNotificationOverlay(tui, theme, () => done(true)),
      {
        overlay: true,
        overlayOptions: {
          width: "80%",
          minWidth: 60,
          maxHeight: "88%",
          anchor: "center",
          backdrop: true,
        },
      },
    );
  };

  const openParallelOverlay = async (ctx: ExtensionContext) => {
    const basePath = projectRoot();
    const parallelDir = join(basePath, ".gsd", "parallel");
    if (!existsSync(parallelDir)) {
      ctx.ui.notify("No parallel workers found. Run /gsd parallel start first.", "info");
      return;
    }
    await ctx.ui.custom<boolean>(
      (tui, theme, _kb, done) => new ParallelMonitorOverlay(tui, theme, () => done(true), basePath),
      {
        overlay: true,
        overlayOptions,
      },
    );
  };

  pi.registerShortcut(Key.ctrlAlt(SF_SHORTCUTS.dashboard.key), {
    description: shortcutDesc(SF_SHORTCUTS.dashboard.action, SF_SHORTCUTS.dashboard.command),
    handler: openDashboardOverlay,
  });

  // Fallback for terminals where Ctrl+Alt letter chords are not forwarded reliably.
  pi.registerShortcut(Key.ctrlShift(SF_SHORTCUTS.dashboard.key), {
    description: shortcutDesc(`${SF_SHORTCUTS.dashboard.action} (fallback)`, SF_SHORTCUTS.dashboard.command),
    handler: openDashboardOverlay,
  });

  pi.registerShortcut(Key.ctrlAlt(SF_SHORTCUTS.notifications.key), {
    description: shortcutDesc(SF_SHORTCUTS.notifications.action, SF_SHORTCUTS.notifications.command),
    handler: openNotificationsOverlay,
  });

  // Fallback for terminals where Ctrl+Alt letter chords are not forwarded reliably.
  pi.registerShortcut(Key.ctrlShift(SF_SHORTCUTS.notifications.key), {
    description: shortcutDesc(`${SF_SHORTCUTS.notifications.action} (fallback)`, SF_SHORTCUTS.notifications.command),
    handler: openNotificationsOverlay,
  });

  pi.registerShortcut(Key.ctrlAlt(SF_SHORTCUTS.parallel.key), {
    description: shortcutDesc(SF_SHORTCUTS.parallel.action, SF_SHORTCUTS.parallel.command),
    handler: openParallelOverlay,
  });

  // No Ctrl+Shift+P fallback — conflicts with cycleModelBackward (shift+ctrl+p).
  // Use Ctrl+Alt+P or /gsd parallel watch instead.
}
