/**
 * Pure derivation of the primary workflow action based on workspace state.
 * No React dependencies — fully testable with plain imports.
 */

export interface WorkflowActionInput {
  phase: string
  autoActive: boolean
  autoPaused: boolean
  onboardingLocked: boolean
  commandInFlight: string | null
  bootStatus: string
  hasMilestones: boolean
  /** When set, suppresses the action bar if the welcome screen is handling initialization. */
  projectDetectionKind?: string | null
}

export interface WorkflowAction {
  label: string
  command: string
  variant: "default" | "destructive"
}

export interface WorkflowActionResult {
  primary: WorkflowAction | null
  secondaries: { label: string; command: string }[]
  disabled: boolean
  disabledReason?: string
  /** When true, the action represents the all-milestones-complete "New Milestone" state. */
  isNewMilestone: boolean
}

export function deriveWorkflowAction(input: WorkflowActionInput): WorkflowActionResult {
  const { phase, autoActive, autoPaused, onboardingLocked, commandInFlight, bootStatus, hasMilestones, projectDetectionKind } = input

  // When the project welcome screen is active, it handles the initialization CTA.
  // Suppress the action bar to avoid duplicate/confusing buttons.
  if (
    projectDetectionKind &&
    projectDetectionKind !== "active-sf" &&
    projectDetectionKind !== "empty-sf"
  ) {
    return { primary: null, secondaries: [], disabled: true, disabledReason: "Project setup pending", isNewMilestone: false }
  }

  // Determine disabled state and reason
  let disabled = false
  let disabledReason: string | undefined

  if (commandInFlight !== null) {
    disabled = true
    disabledReason = "Command in progress"
  } else if (bootStatus !== "ready") {
    disabled = true
    disabledReason = "Workspace not ready"
  } else if (onboardingLocked) {
    disabled = true
    disabledReason = "Setup required"
  }

  // Derive primary action
  let primary: WorkflowAction | null = null
  const secondaries: { label: string; command: string }[] = []
  let isNewMilestone = false

  if (autoActive && !autoPaused) {
    primary = { label: "Stop Auto", command: "/sf stop", variant: "destructive" }
  } else if (autoPaused) {
    primary = { label: "Resume Auto", command: "/sf auto", variant: "default" }
  } else {
    // Auto is not active
    if (phase === "complete") {
      // All milestones done — surface a distinct "New Milestone" action
      primary = { label: "New Milestone", command: "/sf", variant: "default" }
      isNewMilestone = true
    } else if (phase === "planning") {
      primary = { label: "Plan", command: "/sf", variant: "default" }
    } else if (phase === "executing" || phase === "summarizing") {
      primary = { label: "Start Auto", command: "/sf auto", variant: "default" }
    } else if (phase === "pre-planning" && !hasMilestones) {
      primary = { label: "Initialize Project", command: "/sf", variant: "default" }
    } else if (phase === "blocked") {
      primary = { label: "Blocked", command: "/sf", variant: "default" }
      disabled = true
      disabledReason = "Project is blocked — check blockers"
    } else if (phase === "paused") {
      primary = { label: "Resume", command: "/sf auto", variant: "default" }
    } else if (phase === "validating-milestone") {
      primary = { label: "Validate", command: "/sf", variant: "default" }
    } else if (phase === "completing-milestone") {
      primary = { label: "Complete Milestone", command: "/sf", variant: "default" }
    } else if (phase === "needs-discussion") {
      primary = { label: "Discuss", command: "/sf", variant: "default" }
    } else if (phase === "replanning-slice") {
      primary = { label: "Replan", command: "/sf", variant: "default" }
    } else {
      primary = { label: "Continue", command: "/sf", variant: "default" }
    }

    // Add "Step" secondary when auto is not active (not for new milestone — no step concept there)
    if (primary.command !== "/sf next" && !isNewMilestone) {
      secondaries.push({ label: "Step", command: "/sf next" })
    }
  }

  return { primary, secondaries, disabled, disabledReason, isNewMilestone }
}
