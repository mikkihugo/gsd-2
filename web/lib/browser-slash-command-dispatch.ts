import { BUILTIN_SLASH_COMMANDS } from "../../packages/pi-coding-agent/src/core/slash-commands.ts"

export type BrowserSlashCommandSurface =
  | "settings"
  | "model"
  | "thinking"
  | "git"
  | "resume"
  | "name"
  | "fork"
  | "compact"
  | "login"
  | "logout"
  | "session"
  | "export"
  // SF subcommand surfaces (S02)
  | "sf-status"
  | "sf-visualize"
  | "sf-forensics"
  | "sf-doctor"
  | "sf-skill-health"
  | "sf-knowledge"
  | "sf-capture"
  | "sf-triage"
  | "sf-quick"
  | "sf-history"
  | "sf-undo"
  | "sf-inspect"
  | "sf-prefs"
  | "sf-config"
  | "sf-hooks"
  | "sf-mode"
  | "sf-steer"
  | "sf-export"
  | "sf-cleanup"
  | "sf-queue"

export type BrowserSlashCommandLocalAction = "clear_terminal" | "refresh_workspace" | "sf_help"

export type BrowserSlashPromptCommandType = "prompt" | "follow_up"

export interface BrowserSlashCommandDispatchOptions {
  isStreaming?: boolean
}

export type BrowserSlashCommandDispatchResult =
  | {
      kind: "prompt"
      input: string
      slashCommandName: string | null
      command: {
        type: BrowserSlashPromptCommandType
        message: string
      }
    }
  | {
      kind: "rpc"
      input: string
      commandName: string
      command:
        | { type: "get_state" }
        | { type: "new_session" }
    }
  | {
      kind: "surface"
      input: string
      commandName: string
      surface: BrowserSlashCommandSurface
      args: string
    }
  | {
      kind: "local"
      input: string
      commandName: string
      action: BrowserSlashCommandLocalAction
    }
  | {
      kind: "reject"
      input: string
      commandName: string
      reason: string
      guidance: string
    }
  | {
      kind: "view-navigate"
      input: string
      commandName: string
      view: string
    }

export interface BrowserSlashCommandTerminalNotice {
  type: "system" | "error"
  message: string
}

const BUILTIN_COMMAND_DESCRIPTIONS = new Map(BUILTIN_SLASH_COMMANDS.map((command) => [command.name, command.description]))
const BUILTIN_COMMAND_NAMES = new Set(BUILTIN_COMMAND_DESCRIPTIONS.keys())

const SURFACE_COMMANDS = new Map<string, BrowserSlashCommandSurface>([
  ["settings", "settings"],
  ["model", "model"],
  ["thinking", "thinking"],
  ["git", "git"],
  ["resume", "resume"],
  ["name", "name"],
  ["fork", "fork"],
  ["compact", "compact"],
  ["login", "login"],
  ["logout", "logout"],
  ["session", "session"],
  ["export", "export"],
])

// --- SF subcommand dispatch (S02) ---

const SF_SURFACE_SUBCOMMANDS = new Map<string, BrowserSlashCommandSurface>([
  ["status", "sf-status"],
  ["visualize", "sf-visualize"],
  ["forensics", "sf-forensics"],
  ["doctor", "sf-doctor"],
  ["skill-health", "sf-skill-health"],
  ["knowledge", "sf-knowledge"],
  ["capture", "sf-capture"],
  ["triage", "sf-triage"],
  ["quick", "sf-quick"],
  ["history", "sf-history"],
  ["undo", "sf-undo"],
  ["inspect", "sf-inspect"],
  ["model", "model"],
  ["prefs", "sf-prefs"],
  ["config", "sf-config"],
  ["hooks", "sf-hooks"],
  ["mode", "sf-mode"],
  ["steer", "sf-steer"],
  ["export", "sf-export"],
  ["cleanup", "sf-cleanup"],
  ["queue", "sf-queue"],
])

const SF_PASSTHROUGH_SUBCOMMANDS = new Set<string>([
  "auto",
  "next",
  "stop",
  "pause",
  "skip",
  "discuss",
  "run-hook",
  "migrate",
  "remote",
])

export const SF_HELP_TEXT = `Available /sf subcommands:

Workflow:    next · auto · stop · pause · skip · queue · quick · capture · triage
Diagnostics: status · visualize · forensics · doctor · skill-health · inspect
Context:     knowledge · history · undo · discuss
Settings:    model · prefs · config · hooks · mode · steer
Advanced:    export · cleanup · run-hook · migrate · remote

Type /sf <subcommand> to run. Use /sf help for this message.`

function dispatchGSDSubcommand(
  input: string,
  args: string,
  options: BrowserSlashCommandDispatchOptions,
): BrowserSlashCommandDispatchResult {
  const trimmedArgs = args.trim()
  const spaceIndex = trimmedArgs.search(/\s/)
  const subcommand = spaceIndex === -1 ? trimmedArgs : trimmedArgs.slice(0, spaceIndex)
  const subArgs = spaceIndex === -1 ? "" : trimmedArgs.slice(spaceIndex + 1).trim()

  // Bare `/sf` — equivalent to `/sf next`, pass through to bridge
  if (!subcommand) {
    return {
      kind: "prompt",
      input,
      slashCommandName: "sf",
      command: {
        type: getPromptCommandType(options),
        message: input,
      },
    }
  }

  // `/sf help` — render inline help locally
  if (subcommand === "help") {
    return {
      kind: "local",
      input,
      commandName: "sf",
      action: "sf_help",
    }
  }

  // `/sf visualize` — navigate to the visualizer view directly
  if (subcommand === "visualize") {
    return {
      kind: "view-navigate",
      input,
      commandName: "sf",
      view: "visualize",
    }
  }

  // Surface-routed subcommands — open browser-native UI
  const surface = SF_SURFACE_SUBCOMMANDS.get(subcommand)
  if (surface) {
    return {
      kind: "surface",
      input,
      commandName: "sf",
      surface,
      args: subArgs,
    }
  }

  // Bridge-passthrough subcommands — let the extension handle them
  if (SF_PASSTHROUGH_SUBCOMMANDS.has(subcommand)) {
    return {
      kind: "prompt",
      input,
      slashCommandName: "sf",
      command: {
        type: getPromptCommandType(options),
        message: input,
      },
    }
  }

  // Unknown subcommand — pass through; extension handler will show "Unknown"
  return {
    kind: "prompt",
    input,
    slashCommandName: "sf",
    command: {
      type: getPromptCommandType(options),
      message: input,
    },
  }
}

function parseSlashCommand(input: string): { name: string; args: string } | null {
  if (!input.startsWith("/")) return null
  const body = input.slice(1).trim()
  if (!body) return null

  const firstSpaceIndex = body.search(/\s/)
  if (firstSpaceIndex === -1) {
    return { name: body, args: "" }
  }

  return {
    name: body.slice(0, firstSpaceIndex),
    args: body.slice(firstSpaceIndex + 1).trim(),
  }
}

function getPromptCommandType(options: BrowserSlashCommandDispatchOptions): BrowserSlashPromptCommandType {
  return options.isStreaming ? "follow_up" : "prompt"
}

function formatBuiltinDescription(commandName: string): string {
  return BUILTIN_COMMAND_DESCRIPTIONS.get(commandName) ?? "Browser handling is reserved for this built-in command."
}

function buildDeferredBuiltinReject(input: string, commandName: string): BrowserSlashCommandDispatchResult {
  const description = formatBuiltinDescription(commandName)
  return {
    kind: "reject",
    input,
    commandName,
    reason: `/${commandName} is a built-in pi command (${description}) that is not available in the browser yet.`,
    guidance: "It was blocked instead of falling through to the model.",
  }
}

export function isAuthoritativeBuiltinSlashCommand(commandName: string): boolean {
  return BUILTIN_COMMAND_NAMES.has(commandName)
}

export function dispatchBrowserSlashCommand(
  input: string,
  options: BrowserSlashCommandDispatchOptions = {},
): BrowserSlashCommandDispatchResult {
  const trimmed = input.trim()
  const parsed = parseSlashCommand(trimmed)

  if (trimmed === "/clear") {
    return {
      kind: "local",
      input: trimmed,
      commandName: "clear",
      action: "clear_terminal",
    }
  }

  if (trimmed === "/refresh") {
    return {
      kind: "local",
      input: trimmed,
      commandName: "refresh",
      action: "refresh_workspace",
    }
  }

  if (trimmed === "/state") {
    return {
      kind: "rpc",
      input: trimmed,
      commandName: "state",
      command: { type: "get_state" },
    }
  }

  if (trimmed === "/new-session") {
    return {
      kind: "rpc",
      input: trimmed,
      commandName: "new",
      command: { type: "new_session" },
    }
  }

  if (!parsed) {
    return {
      kind: "prompt",
      input: trimmed,
      slashCommandName: null,
      command: {
        type: getPromptCommandType(options),
        message: trimmed,
      },
    }
  }

  if (parsed.name === "new") {
    return {
      kind: "rpc",
      input: trimmed,
      commandName: "new",
      command: { type: "new_session" },
    }
  }

  // SF subcommand dispatch — must precede SURFACE_COMMANDS to avoid
  // `/sf export` colliding with the built-in `/export` surface.
  if (parsed.name === "sf") {
    return dispatchGSDSubcommand(trimmed, parsed.args, options)
  }

  const browserSurface = SURFACE_COMMANDS.get(parsed.name)
  if (browserSurface) {
    return {
      kind: "surface",
      input: trimmed,
      commandName: parsed.name,
      surface: browserSurface,
      args: parsed.args,
    }
  }

  if (BUILTIN_COMMAND_NAMES.has(parsed.name)) {
    return buildDeferredBuiltinReject(trimmed, parsed.name)
  }

  return {
    kind: "prompt",
    input: trimmed,
    slashCommandName: parsed.name,
    command: {
      type: getPromptCommandType(options),
      message: trimmed,
    },
  }
}

export function getBrowserSlashCommandTerminalNotice(
  outcome: BrowserSlashCommandDispatchResult,
): BrowserSlashCommandTerminalNotice | null {
  switch (outcome.kind) {
    case "surface":
      return {
        type: "system",
        message: `/${outcome.commandName} is reserved for browser-native handling and was not sent to the model.`,
      }
    case "reject":
      return {
        type: "error",
        message: `${outcome.reason} ${outcome.guidance}`.trim(),
      }
    default:
      return null
  }
}
