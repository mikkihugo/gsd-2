import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@sf-run/pi-coding-agent";
import type { Model } from "@sf-run/pi-ai";
import type { SFState } from "../../types.js";

import { computeProgressScore, formatProgressLine } from "../../progress-score.js";
import { loadEffectiveSFPreferences, getGlobalSFPreferencesPath, getProjectSFPreferencesPath } from "../../preferences.js";
import { ensurePreferencesFile, handlePrefs, handlePrefsMode, handlePrefsWizard } from "../../commands-prefs-wizard.js";
import { runEnvironmentChecks } from "../../doctor-environment.js";
import { deriveState } from "../../state.js";
import { handleCmux } from "../../commands-cmux.js";
import { setSessionModelOverride } from "../../session-model-override.js";
import { projectRoot } from "../context.js";
import { formattedShortcutPair } from "../../shortcut-defs.js";

export function showHelp(ctx: ExtensionCommandContext, args = ""): void {
  const summaryLines = [
    "SF — Singularity Forge\n",
    "QUICK START",
    "  /sf start <tpl>   Start a workflow template",
    "  /sf               Run next unit (same as /sf next)",
    "  /sf auto          Run all queued units continuously",
    "  /sf pause         Pause auto-mode",
    "  /sf stop          Stop auto-mode gracefully",
    "",
    "VISIBILITY",
    `  /sf status         Dashboard  (${formattedShortcutPair("dashboard")})`,
    `  /sf parallel watch Parallel monitor  (${formattedShortcutPair("parallel")})`,
    `  /sf notifications  Notification history  (${formattedShortcutPair("notifications")})`,
    "  /sf visualize      Interactive 10-tab TUI",
    "  /sf queue          Show queued/dispatched units",
    "",
    "COURSE CORRECTION",
    "  /sf steer <desc>   Apply user override to active work",
    "  /sf capture <text> Quick-capture a thought to CAPTURES.md",
    "  /sf triage         Classify and route pending captures",
    "  /sf undo           Revert last completed unit  [--force]",
    "  /sf rethink        Conversational project reorganization",
    "",
    "SETUP",
    "  /sf init           Project init wizard",
    "  /sf setup          Global setup status  [llm|search|remote|keys|prefs]",
    "  /sf model          Switch active session model",
    "  /sf prefs          Manage preferences",
    "  /sf doctor         Diagnose and repair .sf/ state",
    "",
    "Use /sf help full for the complete command reference.",
  ];

  const fullLines = [
    "SF — Singularity Forge\n",
    "WORKFLOW",
    "  /sf start <tpl>   Start a workflow template (bugfix, spike, feature, hotfix, etc.)",
    "  /sf templates     List available workflow templates  [info <name>]",
    "  /sf               Run next unit in step mode (same as /sf next)",
    "  /sf next           Execute next task, then pause  [--dry-run] [--verbose]",
    "  /sf auto           Run all queued units continuously  [--verbose]",
    "  /sf stop           Stop auto-mode gracefully",
    "  /sf pause          Pause auto-mode (preserves state, /sf auto to resume)",
    "  /sf discuss        Start guided milestone/slice discussion",
    "  /sf new-milestone  Create milestone from headless context (used by sf headless)",
    "",
    "VISIBILITY",
    `  /sf status         Show progress dashboard  (${formattedShortcutPair("dashboard")})`,
    `  /sf parallel watch Open parallel worker monitor  (${formattedShortcutPair("parallel")})`,
    "  /sf visualize      Interactive 10-tab TUI (progress, timeline, deps, metrics, health, agent, changes, knowledge, captures, export)",
    "  /sf queue          Show queued/dispatched units and execution order",
    "  /sf history        View execution history  [--cost] [--phase] [--model] [N]",
    "  /sf changelog      Show categorized release notes  [version]",
    `  /sf notifications  View persistent notification history  [clear|tail|filter]  (${formattedShortcutPair("notifications")})`,
    "",
    "COURSE CORRECTION",
    "  /sf steer <desc>   Apply user override to active work",
    "  /sf capture <text> Quick-capture a thought to CAPTURES.md",
    "  /sf triage         Classify and route pending captures",
    "  /sf skip <unit>    Prevent a unit from auto-mode dispatch",
    "  /sf undo           Revert last completed unit  [--force]",
    "  /sf rethink        Conversational project reorganization — reorder, park, discard, add milestones",
    "  /sf park [id]      Park a milestone — skip without deleting  [reason]",
    "  /sf unpark [id]    Reactivate a parked milestone",
    "",
    "PROJECT KNOWLEDGE",
    "  /sf knowledge <type> <text>   Add rule, pattern, or lesson to KNOWLEDGE.md",
    "  /sf codebase [generate|update|stats]   Manage the CODEBASE.md cache used in prompt context",
    "",
    "SETUP & CONFIGURATION",
    "  /sf init           Project init wizard — detect, configure, bootstrap .sf/",
    "  /sf setup          Global setup status  [llm|search|remote|keys|prefs]",
    "  /sf model          Switch active session model  [provider/model|model-id]",
    "  /sf mode           Set workflow mode (solo/team)  [global|project]",
    "  /sf prefs          Manage preferences  [global|project|status|wizard|setup|import-claude]",
    "  /sf cmux           Manage cmux integration  [status|on|off|notifications|sidebar|splits|browser]",
    "  /sf config         Set API keys for external tools",
    "  /sf keys           API key manager  [list|add|remove|test|rotate|doctor]",
    "  /sf show-config    Show effective configuration (models, routing, toggles)",
    "  /sf hooks          Show post-unit hook configuration",
    "  /sf extensions     Manage extensions  [list|enable|disable|info]",
    "  /sf fast           Toggle OpenAI service tier  [on|off|flex|status]",
    "  /sf mcp            MCP server status and connectivity  [status|check <server>|init [dir]]",
    "",
    "MAINTENANCE",
    "  /sf doctor         Diagnose and repair .sf/ state  [audit|fix|heal] [scope]",
    "  /sf export         Export milestone/slice results  [--json|--markdown|--html] [--all]",
    "  /sf cleanup        Remove merged branches or snapshots  [branches|snapshots]",
    "  /sf migrate        Migrate .planning/ (v1) to .sf/ (v2) format",
    "  /sf remote         Control remote auto-mode  [slack|discord|status|disconnect]",
    "  /sf inspect        Show SQLite DB diagnostics (schema, row counts, recent entries)",
    "  /sf update         Update SF to the latest version via npm",
  ];
  const full = ["full", "--full", "all"].includes(args.trim().toLowerCase());
  ctx.ui.notify((full ? fullLines : summaryLines).join("\n"), "info");
}

export async function handleStatus(ctx: ExtensionCommandContext): Promise<void> {
  const basePath = projectRoot();
  // Open DB in cold sessions so status uses DB-backed state, not filesystem fallback (#3385)
  const { ensureDbOpen } = await import("../../bootstrap/dynamic-tools.js");
  await ensureDbOpen();
  const state = await deriveState(basePath);

  if (state.registry.length === 0) {
    ctx.ui.notify("No SF milestones found. Run /sf to start.", "info");
    return;
  }

  const { SFDashboardOverlay } = await import("../../dashboard-overlay.js");
  const result = await ctx.ui.custom<boolean>(
    (tui, theme, _kb, done) => new SFDashboardOverlay(tui, theme, () => done(true)),
    {
      overlay: true,
      overlayOptions: {
        width: "90%",
        minWidth: 80,
        maxHeight: "92%",
        anchor: "center",
      },
    },
  );

  if (result === undefined) {
    ctx.ui.notify(formatTextStatus(state), "info");
  }
}

export async function fireStatusViaCommand(ctx: ExtensionContext): Promise<void> {
  await handleStatus(ctx as ExtensionCommandContext);
}

export async function handleVisualize(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("Visualizer requires an interactive terminal.", "warning");
    return;
  }

  const { SFVisualizerOverlay } = await import("../../visualizer-overlay.js");
  const result = await ctx.ui.custom<boolean>(
    (tui, theme, _kb, done) => new SFVisualizerOverlay(tui, theme, () => done(true)),
    {
      overlay: true,
      overlayOptions: {
        width: "80%",
        minWidth: 80,
        maxHeight: "90%",
        anchor: "center",
      },
    },
  );

  if (result === undefined) {
    ctx.ui.notify("Visualizer requires an interactive terminal. Use /sf status for a text-based overview.", "warning");
  }
}

export async function handleSetup(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const { detectProjectState, hasGlobalSetup } = await import("../../detection.js");

  const globalConfigured = hasGlobalSetup();
  const detection = detectProjectState(projectRoot());

  const statusLines = ["SF Setup Status\n"];
  statusLines.push(`  Global preferences: ${globalConfigured ? "configured" : "not set"}`);
  statusLines.push(`  Project state: ${detection.state}`);
  if (detection.projectSignals.primaryLanguage) {
    statusLines.push(`  Detected: ${detection.projectSignals.primaryLanguage}`);
  }

  if (args === "llm" || args === "auth") {
    ctx.ui.notify("Use /login to configure LLM authentication.", "info");
    return;
  }
  if (args === "search") {
    ctx.ui.notify("Use /search-provider to configure web search.", "info");
    return;
  }
  if (args === "remote") {
    ctx.ui.notify("Use /sf remote to configure remote questions.", "info");
    return;
  }
  if (args === "keys") {
    const { handleKeys } = await import("../../key-manager.js");
    await handleKeys("", ctx);
    return;
  }
  if (args === "prefs") {
    await ensurePreferencesFile(getGlobalSFPreferencesPath(), ctx, "global");
    await handlePrefsWizard(ctx, "global");
    return;
  }

  ctx.ui.notify(statusLines.join("\n"), "info");
  ctx.ui.notify(
    "Available setup commands:\n" +
    "  /sf setup llm     — LLM authentication\n" +
    "  /sf setup search  — Web search provider\n" +
    "  /sf setup remote  — Remote questions (Discord/Slack/Telegram)\n" +
    "  /sf setup keys    — Tool API keys\n" +
    "  /sf setup prefs   — Global preferences wizard",
    "info",
  );
}

function sortModelsForSelection(models: Model<any>[], currentModel: Model<any> | undefined): Model<any>[] {
  return [...models].sort((a, b) => {
    const aCurrent = currentModel && a.provider === currentModel.provider && a.id === currentModel.id;
    const bCurrent = currentModel && b.provider === currentModel.provider && b.id === currentModel.id;
    if (aCurrent && !bCurrent) return -1;
    if (!aCurrent && bCurrent) return 1;
    const providerCmp = a.provider.localeCompare(b.provider);
    if (providerCmp !== 0) return providerCmp;
    return a.id.localeCompare(b.id);
  });
}

function buildProviderModelGroups(
  models: Model<any>[],
  currentModel: Model<any> | undefined,
): Map<string, Model<any>[]> {
  const byProvider = new Map<string, Model<any>[]>();

  for (const model of sortModelsForSelection(models, currentModel)) {
    let group = byProvider.get(model.provider);
    if (!group) {
      group = [];
      byProvider.set(model.provider, group);
    }
    group.push(model);
  }
  return byProvider;
}

async function selectModelByProvider(
  title: string,
  models: Model<any>[],
  ctx: ExtensionCommandContext,
  currentModel: Model<any> | undefined,
): Promise<Model<any> | undefined> {
  const byProvider = buildProviderModelGroups(models, currentModel);
  const providerOptions = Array.from(byProvider.entries()).map(([provider, group]) =>
    `${provider} (${group.length} model${group.length === 1 ? "" : "s"})`,
  );
  providerOptions.push("(cancel)");

  const providerChoice = await ctx.ui.select(`${title} — choose provider:`, providerOptions);
  if (!providerChoice || typeof providerChoice !== "string" || providerChoice === "(cancel)") return undefined;

  const providerName = providerChoice.replace(/ \(\d+ models?\)$/, "");
  const providerModels = byProvider.get(providerName);
  if (!providerModels || providerModels.length === 0) return undefined;

  const optionToModel = new Map<string, Model<any>>();
  const modelOptions = providerModels.map((model) => {
    const isCurrent = currentModel && model.provider === currentModel.provider && model.id === currentModel.id;
    const label = `${isCurrent ? "* " : ""}${model.id}`;
    optionToModel.set(label, model);
    return label;
  });
  modelOptions.push("(cancel)");

  const modelChoice = await ctx.ui.select(`${title} — ${providerName}:`, modelOptions);
  if (!modelChoice || typeof modelChoice !== "string" || modelChoice === "(cancel)") return undefined;
  return optionToModel.get(modelChoice);
}

async function resolveRequestedModel(
  query: string,
  ctx: ExtensionCommandContext,
): Promise<Model<any> | undefined> {
  const { resolveModelId } = await import("../../auto-model-selection.js");
  const models = ctx.modelRegistry.getAvailable();
  const exact = resolveModelId(query, models, ctx.model?.provider);
  if (exact) return exact;

  const lowerQuery = query.toLowerCase();
  const partialMatches = models.filter((model) =>
    model.id.toLowerCase().includes(lowerQuery)
      || `${model.provider}/${model.id}`.toLowerCase().includes(lowerQuery),
  );

  if (partialMatches.length === 1) return partialMatches[0];
  if (partialMatches.length === 0 || !ctx.hasUI) return undefined;
  return selectModelByProvider(`Multiple models match "${query}"`, partialMatches, ctx, ctx.model);
}

async function handleModel(trimmedArgs: string, ctx: ExtensionCommandContext, pi: ExtensionAPI | undefined): Promise<void> {
  const availableModels = ctx.modelRegistry.getAvailable();
  if (availableModels.length === 0) {
    ctx.ui.notify("No available models found. Check provider auth and model discovery.", "warning");
    return;
  }
  if (!pi) {
    ctx.ui.notify("Model switching is unavailable in this context.", "warning");
    return;
  }

  const trimmed = trimmedArgs.trim();
  let targetModel: Model<any> | undefined;

  if (!trimmed) {
    if (!ctx.hasUI) {
      const current = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "(none)";
      ctx.ui.notify(`Current model: ${current}\nUsage: /sf model <provider/model|model-id>`, "info");
      return;
    }

    targetModel = await selectModelByProvider("Select session model:", availableModels, ctx, ctx.model);
  } else {
    targetModel = await resolveRequestedModel(trimmed, ctx);
  }

  if (!targetModel) {
    ctx.ui.notify(`Model "${trimmed}" not found. Use /sf model with an exact provider/model or a unique model ID.`, "warning");
    return;
  }

  const ok = await pi.setModel(targetModel);
  if (!ok) {
    ctx.ui.notify(`No API key for ${targetModel.provider}/${targetModel.id}`, "warning");
    return;
  }

  // /sf model is an explicit per-session pin for SF dispatches.
  // This is captured at auto bootstrap so it survives internal session
  // switches during /sf auto and /sf next runs.
  const sessionId = ctx.sessionManager?.getSessionId?.();
  if (sessionId) {
    setSessionModelOverride(sessionId, {
      provider: targetModel.provider,
      id: targetModel.id,
    });
  }

  ctx.ui.notify(`Model: ${targetModel.provider}/${targetModel.id}`, "info");
}

export async function handleCoreCommand(
  trimmed: string,
  ctx: ExtensionCommandContext,
  pi?: ExtensionAPI,
): Promise<boolean> {
  if (trimmed === "help" || trimmed === "h" || trimmed === "?" || trimmed.startsWith("help ")) {
    showHelp(ctx, trimmed.startsWith("help ") ? trimmed.slice(5).trim() : "");
    return true;
  }
  if (trimmed === "status") {
    await handleStatus(ctx);
    return true;
  }
  if (trimmed === "visualize") {
    await handleVisualize(ctx);
    return true;
  }
  if (trimmed === "widget" || trimmed.startsWith("widget ")) {
    const { cycleWidgetMode, setWidgetMode, getWidgetMode } = await import("../../auto-dashboard.js");
    const arg = trimmed.replace(/^widget\s*/, "").trim();
    if (arg === "full" || arg === "small" || arg === "min" || arg === "off") {
      setWidgetMode(arg);
    } else {
      cycleWidgetMode();
    }
    ctx.ui.notify(`Widget: ${getWidgetMode()}`, "info");
    return true;
  }
  if (trimmed === "model" || trimmed.startsWith("model ")) {
    await handleModel(trimmed.replace(/^model\s*/, "").trim(), ctx, pi);
    return true;
  }
  if (trimmed === "mode" || trimmed.startsWith("mode ")) {
    const modeArgs = trimmed.replace(/^mode\s*/, "").trim();
    const scope = modeArgs === "project" ? "project" : "global";
    const path = scope === "project" ? getProjectSFPreferencesPath() : getGlobalSFPreferencesPath();
    await ensurePreferencesFile(path, ctx, scope);
    await handlePrefsMode(ctx, scope);
    return true;
  }
  if (trimmed === "prefs" || trimmed.startsWith("prefs ")) {
    await handlePrefs(trimmed.replace(/^prefs\s*/, "").trim(), ctx);
    return true;
  }
  if (trimmed === "cmux" || trimmed.startsWith("cmux ")) {
    await handleCmux(trimmed.replace(/^cmux\s*/, "").trim(), ctx);
    return true;
  }
  if (trimmed === "show-config") {
    const { SFConfigOverlay, formatConfigText } = await import("../../config-overlay.js");
    const result = await ctx.ui.custom<boolean>(
      (tui, theme, _kb, done) => new SFConfigOverlay(tui, theme, () => done(true)),
      {
        overlay: true,
        overlayOptions: {
          width: "65%",
          minWidth: 55,
          maxHeight: "85%",
          anchor: "center",
        },
      },
    );
    if (result === undefined) {
      ctx.ui.notify(formatConfigText(), "info");
    }
    return true;
  }
  if (trimmed === "setup" || trimmed.startsWith("setup ")) {
    await handleSetup(trimmed.replace(/^setup\s*/, "").trim(), ctx);
    return true;
  }
  return false;
}

export function formatTextStatus(state: SFState): string {
  const lines: string[] = ["SF Status\n"];
  lines.push(formatProgressLine(computeProgressScore()));
  lines.push("");
  lines.push(`Phase: ${state.phase}`);

  if (state.activeMilestone) {
    lines.push(`Active milestone: ${state.activeMilestone.id} — ${state.activeMilestone.title}`);
  }
  if (state.activeSlice) {
    lines.push(`Active slice: ${state.activeSlice.id} — ${state.activeSlice.title}`);
  }
  if (state.activeTask) {
    lines.push(`Active task: ${state.activeTask.id} — ${state.activeTask.title}`);
  }
  if (state.progress) {
    const { milestones, slices, tasks } = state.progress;
    const parts: string[] = [`milestones ${milestones.done}/${milestones.total}`];
    if (slices) parts.push(`slices ${slices.done}/${slices.total}`);
    if (tasks) parts.push(`tasks ${tasks.done}/${tasks.total}`);
    lines.push(`Progress: ${parts.join(", ")}`);
  }
  if (state.nextAction) {
    lines.push(`Next: ${state.nextAction}`);
  }
  if (state.blockers.length > 0) {
    lines.push(`Blockers: ${state.blockers.join("; ")}`);
  }
  if (state.registry.length > 0) {
    lines.push("");
    lines.push("Milestones:");
    for (const milestone of state.registry) {
      const icon = milestone.status === "complete"
        ? "✓"
        : milestone.status === "active"
          ? "▶"
          : milestone.status === "parked"
            ? "⏸"
            : "○";
      lines.push(`  ${icon} ${milestone.id}: ${milestone.title} (${milestone.status})`);
    }
  }

  const envResults = runEnvironmentChecks(projectRoot());
  const envIssues = envResults.filter((result) => result.status !== "ok");
  if (envIssues.length > 0) {
    lines.push("");
    lines.push("Environment:");
    for (const issue of envIssues) {
      lines.push(`  ${issue.status === "error" ? "✗" : "⚠"} ${issue.message}`);
    }
  }

  return lines.join("\n");
}
