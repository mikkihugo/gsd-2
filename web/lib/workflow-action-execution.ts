import type { WorkspaceTerminalLine } from "./sf-workspace-store"
import { getUserMode } from "./use-user-mode"

export type SFViewName = "dashboard" | "power" | "chat" | "roadmap" | "files" | "activity" | "visualize"

export function navigateToSFView(view: SFViewName): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("sf:navigate-view", { detail: { view } }))
}

/**
 * Dispatch a workflow action command through the session command pipeline
 * and navigate to the Power User Mode view.
 *
 * `dispatch` should be a function that sends the command through the workspace
 * store (e.g. `sendCommand(buildPromptCommand(command, bridge))`), so the
 * command is processed by the agent session — not just injected as raw PTY
 * keystrokes.
 */
export function executeWorkflowActionInPowerMode({
  dispatch,
}: {
  dispatch: () => Promise<unknown>
}): void {
  dispatch().catch((error) => {
    console.error("[workflow-action] dispatch failed:", error)
  })
  const mode = getUserMode()
  navigateToSFView(mode === "vibe-coder" ? "chat" : "power")
}

export function derivePendingWorkflowCommandLabel({
  commandInFlight,
  terminalLines,
}: {
  commandInFlight: string | null
  terminalLines: WorkspaceTerminalLine[]
}): string | null {
  if (!commandInFlight) return null

  for (let index = terminalLines.length - 1; index >= 0; index -= 1) {
    const line = terminalLines[index]
    if (line.type !== "input") continue
    const text = line.content.trim()
    if (text) return text
  }

  if (commandInFlight === "prompt") return "Sending command"
  return `/${commandInFlight}`
}
