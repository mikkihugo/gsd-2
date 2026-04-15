# Full Project Workflow

<template_meta>
name: full-project
version: 1
requires_project: true
artifact_dir: .sf/
</template_meta>

<purpose>
The complete SF workflow with full ceremony: roadmap, milestones, slices, tasks,
research, planning, execution, and verification. Use for greenfield projects or
major features that need the full planning apparatus.

This template wraps the existing SF workflow for registry completeness.
When selected, it routes to the standard /sf init → /sf auto pipeline.
</purpose>

<phases>
1. init    — Initialize project, detect stack, create .sf/
2. discuss — Define requirements, decisions, and architecture
3. plan    — Create roadmap with milestones and slices
4. execute — Execute slices: research → plan → implement → verify per slice
5. verify  — Milestone-level verification and completion
</phases>

<process>

## Routing to Standard SF

This template is a convenience entry point. When selected via `/sf start full-project`,
it should route to the standard SF workflow:

1. If `.sf/` doesn't exist: Run `/sf init` to bootstrap the project
2. If `.sf/` exists but no milestones: Start the discuss phase via `/sf discuss`
3. If milestones exist: Resume via `/sf auto` or `/sf next`

The full SF workflow protocol is defined in `SF-WORKFLOW.md` and handles all
phases, state tracking, and agent orchestration.

</process>
