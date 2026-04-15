import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface WorkflowMcpLaunchConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface WorkflowCapabilityOptions {
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
  surface?: string;
  unitType?: string;
  authMode?: "apiKey" | "oauth" | "externalCli" | "none";
  baseUrl?: string;
}

const MCP_WORKFLOW_TOOL_SURFACE = new Set([
  "ask_user_questions",
  "sf_decision_save",
  "sf_complete_milestone",
  "sf_complete_task",
  "sf_complete_slice",
  "sf_generate_milestone_id",
  "sf_journal_query",
  "sf_milestone_complete",
  "sf_milestone_generate_id",
  "sf_milestone_status",
  "sf_milestone_validate",
  "sf_plan_task",
  "sf_plan_milestone",
  "sf_plan_slice",
  "sf_replan_slice",
  "sf_reassess_roadmap",
  "sf_requirement_save",
  "sf_requirement_update",
  "sf_roadmap_reassess",
  "sf_save_decision",
  "sf_save_gate_result",
  "sf_save_requirement",
  "sf_skip_slice",
  "sf_slice_replan",
  "sf_slice_complete",
  "sf_summary_save",
  "sf_task_plan",
  "sf_task_complete",
  "sf_update_requirement",
  "sf_validate_milestone",
]);

function parseLookupOutput(output: Buffer | string): string {
  return output
    .toString()
    .trim()
    .split(/\r?\n/)[0] ?? "";
}

function parseJsonEnv<T>(env: NodeJS.ProcessEnv, name: string): T | undefined {
  const raw = env[name];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON in ${name}`);
  }
}

function lookupCommand(command: string, platform: NodeJS.Platform = process.platform): string | null {
  const lookup = platform === "win32" ? `where ${command}` : `which ${command}`;
  try {
    const resolved = parseLookupOutput(execSync(lookup, { timeout: 5_000, stdio: "pipe" }));
    return resolved || null;
  } catch {
    return null;
  }
}

function findWorkflowCliFromAncestorPath(startPath: string): string | null {
  let current = resolve(startPath);

  while (true) {
    const candidate = resolve(current, "packages", "mcp-server", "dist", "cli.js");
    if (existsSync(candidate)) return candidate;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function getBundledWorkflowMcpCliPath(env: NodeJS.ProcessEnv): string | null {
  const envAnchors = [
    env.SF_BIN_PATH?.trim(),
    env.SF_CLI_PATH?.trim(),
    env.SF_WORKFLOW_PATH?.trim(),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const anchor of envAnchors) {
    const candidate = findWorkflowCliFromAncestorPath(anchor);
    if (candidate) return candidate;
  }

  const candidates = [
    resolve(fileURLToPath(new URL("../../../../packages/mcp-server/src/cli.ts", import.meta.url))),
    resolve(fileURLToPath(new URL("../../../../../packages/mcp-server/src/cli.ts", import.meta.url))),
    resolve(fileURLToPath(new URL("../../../../packages/mcp-server/dist/cli.js", import.meta.url))),
    resolve(fileURLToPath(new URL("../../../../../packages/mcp-server/dist/cli.js", import.meta.url))),
  ];

  for (const bundledCli of candidates) {
    if (existsSync(bundledCli)) return bundledCli;
  }

  return null;
}

function getBundledWorkflowExecutorModulePath(): string | null {
  const candidates = [
    resolve(fileURLToPath(new URL("./tools/workflow-tool-executors.js", import.meta.url))),
    resolve(fileURLToPath(new URL("./tools/workflow-tool-executors.ts", import.meta.url))),
    resolve(fileURLToPath(new URL("../../../../dist/resources/extensions/sf/tools/workflow-tool-executors.js", import.meta.url))),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function getBundledWorkflowWriteGateModulePath(): string | null {
  const candidates = [
    resolve(fileURLToPath(new URL("./bootstrap/write-gate.js", import.meta.url))),
    resolve(fileURLToPath(new URL("./bootstrap/write-gate.ts", import.meta.url))),
    resolve(fileURLToPath(new URL("../../../../dist/resources/extensions/sf/bootstrap/write-gate.js", import.meta.url))),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function getResolveTsHookPath(): string | null {
  const candidates = [
    resolve(fileURLToPath(new URL("./tests/resolve-ts.mjs", import.meta.url))),
    resolve(fileURLToPath(new URL("../../../../src/resources/extensions/sf/tests/resolve-ts.mjs", import.meta.url))),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function mergeNodeOptions(existing: string | undefined, additions: string[]): string | undefined {
  const tokens = (existing ?? "").split(/\s+/).map((value) => value.trim()).filter(Boolean);
  for (const addition of additions) {
    if (!tokens.includes(addition)) {
      tokens.push(addition);
    }
  }
  return tokens.length > 0 ? tokens.join(" ") : undefined;
}

function buildWorkflowLaunchEnv(
  projectRoot: string,
  gsdCliPath: string | undefined,
  explicitEnv?: Record<string, string>,
  workflowCliPath?: string,
): Record<string, string> {
  const executorModulePath = getBundledWorkflowExecutorModulePath();
  const writeGateModulePath = getBundledWorkflowWriteGateModulePath();
  const resolveTsHookPath = getResolveTsHookPath();
  const wantsSourceTs =
    Boolean(resolveTsHookPath) &&
    (
      (workflowCliPath?.endsWith(".ts") ?? false) ||
      (executorModulePath?.endsWith(".ts") ?? false) ||
      (writeGateModulePath?.endsWith(".ts") ?? false)
    );
  const nodeOptions = wantsSourceTs
    ? mergeNodeOptions(explicitEnv?.NODE_OPTIONS, [
        "--experimental-strip-types",
        `--import=${pathToFileURL(resolveTsHookPath!).href}`,
      ])
    : explicitEnv?.NODE_OPTIONS;

  return {
    ...(explicitEnv ?? {}),
    ...(gsdCliPath ? { SF_CLI_PATH: gsdCliPath } : {}),
    ...(executorModulePath ? { SF_WORKFLOW_EXECUTORS_MODULE: executorModulePath } : {}),
    ...(writeGateModulePath ? { SF_WORKFLOW_WRITE_GATE_MODULE: writeGateModulePath } : {}),
    ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}),
    SF_PERSIST_WRITE_GATE_STATE: "1",
    SF_WORKFLOW_PROJECT_ROOT: projectRoot,
  };
}

export function detectWorkflowMcpLaunchConfig(
  projectRoot = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): WorkflowMcpLaunchConfig | null {
  const name = env.SF_WORKFLOW_MCP_NAME?.trim() || "gsd-workflow";
  const explicitCommand = env.SF_WORKFLOW_MCP_COMMAND?.trim();
  const explicitArgs = parseJsonEnv<unknown>(env, "SF_WORKFLOW_MCP_ARGS");
  const explicitEnv = parseJsonEnv<Record<string, string>>(env, "SF_WORKFLOW_MCP_ENV");
  const explicitCwd = env.SF_WORKFLOW_MCP_CWD?.trim();
  const gsdCliPath = env.SF_CLI_PATH?.trim() || env.SF_BIN_PATH?.trim();
  const workflowProjectRoot =
    explicitEnv?.SF_WORKFLOW_PROJECT_ROOT?.trim() ||
    env.SF_WORKFLOW_PROJECT_ROOT?.trim() ||
    env.SF_PROJECT_ROOT?.trim() ||
    explicitCwd ||
    projectRoot;
  const resolvedWorkflowProjectRoot = resolve(workflowProjectRoot);

  if (explicitCommand) {
    const launchEnv = buildWorkflowLaunchEnv(resolve(workflowProjectRoot), gsdCliPath, explicitEnv);
    return {
      name,
      command: explicitCommand,
      args: Array.isArray(explicitArgs) && explicitArgs.length > 0 ? explicitArgs.map(String) : undefined,
      cwd: explicitCwd || undefined,
      env: Object.keys(launchEnv).length > 0 ? launchEnv : undefined,
    };
  }

  const distCli = resolve(resolvedWorkflowProjectRoot, "packages", "mcp-server", "dist", "cli.js");
  if (existsSync(distCli)) {
    return {
      name,
      command: process.execPath,
      args: [distCli],
      cwd: resolvedWorkflowProjectRoot,
      env: buildWorkflowLaunchEnv(resolvedWorkflowProjectRoot, gsdCliPath, undefined, distCli),
    };
  }

  const bundledCli = getBundledWorkflowMcpCliPath(env);
  if (bundledCli) {
    return {
      name,
      command: process.execPath,
      args: [bundledCli],
      cwd: resolvedWorkflowProjectRoot,
      env: buildWorkflowLaunchEnv(resolvedWorkflowProjectRoot, gsdCliPath, undefined, bundledCli),
    };
  }

  const binPath = lookupCommand("gsd-mcp-server");
  if (binPath) {
    return {
      name,
      command: binPath,
      env: buildWorkflowLaunchEnv(resolvedWorkflowProjectRoot, gsdCliPath),
    };
  }

  return null;
}

export function buildWorkflowMcpServers(
  projectRoot = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Record<string, Record<string, unknown>> | undefined {
  const launch = detectWorkflowMcpLaunchConfig(projectRoot, env);
  if (!launch) return undefined;

  return {
    [launch.name]: {
      command: launch.command,
      ...(launch.args && launch.args.length > 0 ? { args: launch.args } : {}),
      ...(launch.env ? { env: launch.env } : {}),
      ...(launch.cwd ? { cwd: launch.cwd } : {}),
    },
  };
}

export function getRequiredWorkflowToolsForGuidedUnit(unitType: string): string[] {
  switch (unitType) {
    case "discuss-milestone":
      return ["sf_summary_save", "sf_plan_milestone"];
    case "discuss-slice":
      return ["sf_summary_save"];
    case "research-milestone":
    case "research-slice":
      return ["sf_summary_save"];
    case "plan-milestone":
      return ["sf_plan_milestone"];
    case "plan-slice":
      return ["sf_plan_slice"];
    case "execute-task":
      return ["sf_task_complete"];
    case "complete-slice":
      return ["sf_slice_complete"];
    default:
      return [];
  }
}

export function getRequiredWorkflowToolsForAutoUnit(unitType: string): string[] {
  switch (unitType) {
    case "discuss-milestone":
      return ["sf_summary_save", "sf_plan_milestone"];
    case "research-milestone":
    case "research-slice":
    case "run-uat":
      return ["sf_summary_save"];
    case "plan-milestone":
      return ["sf_plan_milestone"];
    case "plan-slice":
      return ["sf_plan_slice"];
    case "execute-task":
    case "execute-task-simple":
    case "reactive-execute":
      return ["sf_complete_task"];
    case "complete-slice":
      return ["sf_complete_slice"];
    case "replan-slice":
      return ["sf_replan_slice"];
    case "reassess-roadmap":
      return ["sf_milestone_status", "sf_reassess_roadmap"];
    case "gate-evaluate":
      return ["sf_save_gate_result"];
    case "validate-milestone":
      return ["sf_milestone_status", "sf_validate_milestone"];
    case "complete-milestone":
      return ["sf_milestone_status", "sf_complete_milestone"];
    default:
      return [];
  }
}

export function usesWorkflowMcpTransport(
  authMode: WorkflowCapabilityOptions["authMode"],
  baseUrl: string | undefined,
): boolean {
  return authMode === "externalCli" && typeof baseUrl === "string" && baseUrl.startsWith("local://");
}

export function supportsStructuredQuestions(
  activeTools: string[],
  options: Pick<WorkflowCapabilityOptions, "authMode" | "baseUrl"> = {},
): boolean {
  if (!activeTools.includes("ask_user_questions")) return false;

  // Workflow MCP currently exposes ask_user_questions via MCP form elicitation.
  // Local external CLI transports such as Claude Code can invoke the tool, but
  // do not reliably complete that elicitation round-trip yet, so guided discuss
  // prompts must fall back to plain-text questioning.
  if (usesWorkflowMcpTransport(options.authMode, options.baseUrl)) return false;

  return true;
}

export function getWorkflowTransportSupportError(
  provider: string | undefined,
  requiredTools: string[],
  options: WorkflowCapabilityOptions = {},
): string | null {
  if (!provider || requiredTools.length === 0) return null;
  if (!usesWorkflowMcpTransport(options.authMode, options.baseUrl)) return null;

  const projectRoot = options.projectRoot ?? process.cwd();
  const env = options.env ?? process.env;
  const launch = detectWorkflowMcpLaunchConfig(projectRoot, env);
  const surface = options.surface ?? "workflow dispatch";
  const unitLabel = options.unitType ? ` for ${options.unitType}` : "";
  const providerLabel = `"${provider}"`;

  if (!launch) {
    return `Provider ${providerLabel} cannot run ${surface}${unitLabel}: the SF workflow MCP server is not configured or discoverable. Detected Claude Code model but no workflow MCP. Please run /gsd mcp init . from your project root. You can also configure SF_WORKFLOW_MCP_COMMAND, build packages/mcp-server/dist/cli.js, or install gsd-mcp-server on PATH.`;
  }

  const missing = [...new Set(requiredTools)].filter((tool) => !MCP_WORKFLOW_TOOL_SURFACE.has(tool));
  if (missing.length === 0) return null;

  return `Provider ${providerLabel} cannot run ${surface}${unitLabel}: this unit requires ${missing.join(", ")}, but the workflow MCP transport currently exposes only ${Array.from(MCP_WORKFLOW_TOOL_SURFACE).sort().join(", ")}.`;
}
