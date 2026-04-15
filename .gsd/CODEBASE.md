# Codebase Map

Generated: 2026-04-15T12:09:27Z | Files: 500 | Described: 0/500
<!-- gsd:codebase-meta {"generatedAt":"2026-04-15T12:09:27Z","fingerprint":"447265c2205a9bc92066b5de4a0866717d17b961","fileCount":500,"truncated":true} -->
Note: Truncated to first 500 files. Run with higher --max-files to include all.

### (root)/
- `.dockerignore`
- `.gitignore`
- `.npmignore`
- `.npmrc`
- `.prompt-injection-scanignore`
- `.secretscanignore`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `Dockerfile`
- `flake.nix`
- `LICENSE`
- `package-lock.json`
- `package.json`
- `README.md`
- `VISION.md`

### .github/
- `.github/CODEOWNERS`
- `.github/FUNDING.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`

### .github/ISSUE_TEMPLATE/
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`

### .github/workflows/
- `.github/workflows/ai-triage.yml`
- `.github/workflows/build-native.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/cleanup-dev-versions.yml`
- `.github/workflows/pipeline.yml`
- `.github/workflows/pr-risk.yml`

### bin/
- `bin/gsd-from-source`

### docker/
- `docker/.env.example`
- `docker/bootstrap.sh`
- `docker/docker-compose.full.yaml`
- `docker/docker-compose.yaml`
- `docker/Dockerfile.ci-builder`
- `docker/Dockerfile.sandbox`
- `docker/entrypoint.sh`
- `docker/README.md`

### docs/
- `docs/README.md`

### docs/dev/
- `docs/dev/ADR-001-branchless-worktree-architecture.md`
- `docs/dev/ADR-003-pipeline-simplification.md`
- `docs/dev/ADR-004-capability-aware-model-routing.md`
- `docs/dev/ADR-005-multi-model-provider-tool-strategy.md`
- `docs/dev/ADR-007-model-catalog-split.md`
- `docs/dev/ADR-008-gsd-tools-over-mcp-for-provider-parity.md`
- `docs/dev/ADR-008-IMPLEMENTATION-PLAN.md`
- `docs/dev/ADR-009-IMPLEMENTATION-PLAN.md`
- `docs/dev/ADR-009-orchestration-kernel-refactor.md`
- `docs/dev/ADR-010-pi-clean-seam-architecture.md`
- `docs/dev/agent-knowledge-index.md`
- `docs/dev/architecture.md`
- `docs/dev/ci-cd-pipeline.md`
- `docs/dev/FILE-SYSTEM-MAP.md`
- `docs/dev/FRONTIER-TECHNIQUES.md`
- `docs/dev/pi-context-optimization-opportunities.md`
- `docs/dev/PRD-branchless-worktree-architecture.md`
- `docs/dev/PRD-pi-clean-seam-refactor.md`

### docs/dev/building-coding-agents/
- *(27 files: 27 .md)*

### docs/dev/context-and-hooks/
- `docs/dev/context-and-hooks/01-the-context-pipeline.md`
- `docs/dev/context-and-hooks/02-hook-reference.md`
- `docs/dev/context-and-hooks/03-context-injection-patterns.md`
- `docs/dev/context-and-hooks/04-message-types-and-llm-visibility.md`
- `docs/dev/context-and-hooks/05-inter-extension-communication.md`
- `docs/dev/context-and-hooks/06-advanced-patterns-from-source.md`
- `docs/dev/context-and-hooks/07-the-system-prompt-anatomy.md`
- `docs/dev/context-and-hooks/README.md`

### docs/dev/extending-pi/
- *(26 files: 26 .md)*

### docs/dev/pi-ui-tui/
- *(24 files: 24 .md)*

### docs/dev/proposals/
- `docs/dev/proposals/698-browser-tools-feature-additions.md`
- `docs/dev/proposals/rfc-gitops-branching-strategy.md`

### docs/dev/proposals/workflows/
- `docs/dev/proposals/workflows/backmerge.yml`
- `docs/dev/proposals/workflows/create-release.yml`
- `docs/dev/proposals/workflows/README.md`
- `docs/dev/proposals/workflows/sync-next.yml`

### docs/dev/superpowers/plans/
- `docs/dev/superpowers/plans/2026-03-17-cicd-pipeline.md`

### docs/dev/superpowers/specs/
- `docs/dev/superpowers/specs/2026-03-17-cicd-pipeline-design.md`

### docs/dev/what-is-pi/
- `docs/dev/what-is-pi/01-what-pi-is.md`
- `docs/dev/what-is-pi/02-design-philosophy.md`
- `docs/dev/what-is-pi/03-the-four-modes-of-operation.md`
- `docs/dev/what-is-pi/04-the-architecture-how-everything-fits-together.md`
- `docs/dev/what-is-pi/05-the-agent-loop-how-pi-thinks.md`
- `docs/dev/what-is-pi/06-tools-how-pi-acts-on-the-world.md`
- `docs/dev/what-is-pi/07-sessions-memory-that-branches.md`
- `docs/dev/what-is-pi/08-compaction-how-pi-manages-context-limits.md`
- `docs/dev/what-is-pi/09-the-customization-stack.md`
- `docs/dev/what-is-pi/10-providers-models-multi-model-by-default.md`
- `docs/dev/what-is-pi/11-the-interactive-tui.md`
- `docs/dev/what-is-pi/12-the-message-queue-talking-while-pi-thinks.md`
- `docs/dev/what-is-pi/13-context-files-project-instructions.md`
- `docs/dev/what-is-pi/14-the-sdk-rpc-embedding-pi.md`
- `docs/dev/what-is-pi/15-pi-packages-the-ecosystem.md`
- `docs/dev/what-is-pi/16-why-pi-matters-what-makes-it-different.md`
- `docs/dev/what-is-pi/17-file-reference-all-documentation.md`
- `docs/dev/what-is-pi/18-quick-reference-commands-shortcuts.md`
- `docs/dev/what-is-pi/19-building-branded-apps-on-top-of-pi.md`
- `docs/dev/what-is-pi/README.md`

### docs/user-docs/
- *(21 files: 21 .md)*

### docs/zh-CN/
- `docs/zh-CN/README.md`

### docs/zh-CN/user-docs/
- *(21 files: 21 .md)*

### gitbook/
- `gitbook/README.md`
- `gitbook/SUMMARY.md`

### gitbook/configuration/
- `gitbook/configuration/custom-models.md`
- `gitbook/configuration/git-settings.md`
- `gitbook/configuration/mcp-servers.md`
- `gitbook/configuration/notifications.md`
- `gitbook/configuration/preferences.md`
- `gitbook/configuration/providers.md`

### gitbook/core-concepts/
- `gitbook/core-concepts/auto-mode.md`
- `gitbook/core-concepts/project-structure.md`
- `gitbook/core-concepts/step-mode.md`

### gitbook/features/
- `gitbook/features/captures.md`
- `gitbook/features/cost-management.md`
- `gitbook/features/dynamic-model-routing.md`
- `gitbook/features/github-sync.md`
- `gitbook/features/headless.md`
- `gitbook/features/parallel.md`
- `gitbook/features/remote-questions.md`
- `gitbook/features/skills.md`
- `gitbook/features/teams.md`
- `gitbook/features/token-optimization.md`
- `gitbook/features/visualizer.md`
- `gitbook/features/web-interface.md`
- `gitbook/features/workflow-templates.md`

### gitbook/getting-started/
- `gitbook/getting-started/choosing-a-model.md`
- `gitbook/getting-started/first-project.md`
- `gitbook/getting-started/installation.md`

### gitbook/reference/
- `gitbook/reference/cli-flags.md`
- `gitbook/reference/commands.md`
- `gitbook/reference/environment-variables.md`
- `gitbook/reference/keyboard-shortcuts.md`
- `gitbook/reference/migration.md`
- `gitbook/reference/troubleshooting.md`

### gsd-orchestrator/
- `gsd-orchestrator/SKILL.md`

### gsd-orchestrator/references/
- `gsd-orchestrator/references/answer-injection.md`
- `gsd-orchestrator/references/commands.md`
- `gsd-orchestrator/references/json-result.md`

### gsd-orchestrator/templates/
- `gsd-orchestrator/templates/spec.md`

### gsd-orchestrator/workflows/
- `gsd-orchestrator/workflows/build-from-spec.md`
- `gsd-orchestrator/workflows/monitor-and-poll.md`
- `gsd-orchestrator/workflows/step-by-step.md`

### mintlify-docs/
- `mintlify-docs/docs`
- `mintlify-docs/docs.json`
- `mintlify-docs/getting-started.mdx`
- `mintlify-docs/introduction.mdx`

### mintlify-docs/guides/
- `mintlify-docs/guides/auto-mode.mdx`
- `mintlify-docs/guides/captures-triage.mdx`
- `mintlify-docs/guides/change-management.mdx`
- `mintlify-docs/guides/commands.mdx`
- `mintlify-docs/guides/configuration.mdx`
- `mintlify-docs/guides/cost-management.mdx`
- `mintlify-docs/guides/custom-models.mdx`
- `mintlify-docs/guides/dynamic-model-routing.mdx`
- `mintlify-docs/guides/git-strategy.mdx`
- `mintlify-docs/guides/migration.mdx`
- `mintlify-docs/guides/parallel-orchestration.mdx`
- `mintlify-docs/guides/remote-questions.mdx`
- `mintlify-docs/guides/skills.mdx`
- `mintlify-docs/guides/token-optimization.mdx`
- `mintlify-docs/guides/troubleshooting.mdx`
- `mintlify-docs/guides/visualizer.mdx`
- `mintlify-docs/guides/web-interface.mdx`
- `mintlify-docs/guides/working-in-teams.mdx`

### native/
- `native/.gitignore`
- `native/.npmignore`
- `native/Cargo.toml`
- `native/README.md`

### native/.cargo/
- `native/.cargo/config.toml`

### native/crates/ast/
- `native/crates/ast/Cargo.toml`

### native/crates/ast/src/
- `native/crates/ast/src/ast.rs`
- `native/crates/ast/src/glob_util.rs`
- `native/crates/ast/src/lib.rs`

### native/crates/ast/src/language/
- `native/crates/ast/src/language/mod.rs`
- `native/crates/ast/src/language/parsers.rs`

### native/crates/engine/
- `native/crates/engine/build.rs`
- `native/crates/engine/Cargo.toml`

### native/crates/engine/src/
- *(22 files: 22 .rs)*

### native/crates/grep/
- `native/crates/grep/Cargo.toml`

### native/crates/grep/src/
- `native/crates/grep/src/lib.rs`

### native/npm/darwin-arm64/
- `native/npm/darwin-arm64/package.json`

### native/npm/darwin-x64/
- `native/npm/darwin-x64/package.json`

### native/npm/linux-arm64-gnu/
- `native/npm/linux-arm64-gnu/package.json`

### native/npm/linux-x64-gnu/
- `native/npm/linux-x64-gnu/package.json`

### native/npm/win32-x64-msvc/
- `native/npm/win32-x64-msvc/package.json`

### native/scripts/
- `native/scripts/build.js`
- `native/scripts/sync-platform-versions.cjs`

### packages/daemon/
- `packages/daemon/package.json`
- `packages/daemon/tsconfig.json`

### packages/daemon/src/
- *(27 files: 27 .ts)*

### packages/mcp-server/
- `packages/mcp-server/.npmignore`
- `packages/mcp-server/package.json`
- `packages/mcp-server/README.md`
- `packages/mcp-server/tsconfig.json`

### packages/mcp-server/src/
- `packages/mcp-server/src/cli.ts`
- `packages/mcp-server/src/env-writer.test.ts`
- `packages/mcp-server/src/env-writer.ts`
- `packages/mcp-server/src/import-candidates.test.ts`
- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/src/mcp-server.test.ts`
- `packages/mcp-server/src/secure-env-collect.test.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/src/session-manager.ts`
- `packages/mcp-server/src/tool-credentials.test.ts`
- `packages/mcp-server/src/tool-credentials.ts`
- `packages/mcp-server/src/types.ts`
- `packages/mcp-server/src/workflow-tools.test.ts`
- `packages/mcp-server/src/workflow-tools.ts`

### packages/mcp-server/src/readers/
- `packages/mcp-server/src/readers/captures.ts`
- `packages/mcp-server/src/readers/doctor-lite.ts`
- `packages/mcp-server/src/readers/graph.test.ts`
- `packages/mcp-server/src/readers/graph.ts`
- `packages/mcp-server/src/readers/index.ts`
- `packages/mcp-server/src/readers/knowledge.ts`
- `packages/mcp-server/src/readers/metrics.ts`
- `packages/mcp-server/src/readers/paths.ts`
- `packages/mcp-server/src/readers/readers.test.ts`
- `packages/mcp-server/src/readers/roadmap.ts`
- `packages/mcp-server/src/readers/state.ts`

### packages/native/
- `packages/native/package.json`
- `packages/native/tsconfig.json`

### packages/native/src/
- `packages/native/src/index.ts`
- `packages/native/src/native.ts`

### packages/native/src/__tests__/
- `packages/native/src/__tests__/clipboard.test.mjs`
- `packages/native/src/__tests__/diff.test.mjs`
- `packages/native/src/__tests__/fd.test.mjs`
- `packages/native/src/__tests__/glob.test.mjs`
- `packages/native/src/__tests__/grep.test.mjs`
- `packages/native/src/__tests__/highlight.test.mjs`
- `packages/native/src/__tests__/html.test.mjs`
- `packages/native/src/__tests__/image.test.mjs`
- `packages/native/src/__tests__/json-parse.test.mjs`
- `packages/native/src/__tests__/module-compat.test.mjs`
- `packages/native/src/__tests__/ps.test.mjs`
- `packages/native/src/__tests__/stream-process.test.mjs`
- `packages/native/src/__tests__/text.test.mjs`
- `packages/native/src/__tests__/truncate.test.mjs`
- `packages/native/src/__tests__/ttsr.test.mjs`
- `packages/native/src/__tests__/xxhash.test.mjs`

### packages/native/src/ast/
- `packages/native/src/ast/index.ts`
- `packages/native/src/ast/types.ts`

### packages/native/src/clipboard/
- `packages/native/src/clipboard/index.ts`
- `packages/native/src/clipboard/types.ts`

### packages/native/src/diff/
- `packages/native/src/diff/index.ts`
- `packages/native/src/diff/types.ts`

### packages/native/src/fd/
- `packages/native/src/fd/index.ts`
- `packages/native/src/fd/types.ts`

### packages/native/src/glob/
- `packages/native/src/glob/index.ts`
- `packages/native/src/glob/types.ts`

### packages/native/src/grep/
- `packages/native/src/grep/index.ts`
- `packages/native/src/grep/types.ts`

### packages/native/src/gsd-parser/
- `packages/native/src/gsd-parser/index.ts`
- `packages/native/src/gsd-parser/types.ts`

### packages/native/src/highlight/
- `packages/native/src/highlight/index.ts`
- `packages/native/src/highlight/types.ts`

### packages/native/src/html/
- `packages/native/src/html/index.ts`
- `packages/native/src/html/types.ts`

### packages/native/src/image/
- `packages/native/src/image/index.ts`
- `packages/native/src/image/types.ts`

### packages/native/src/json-parse/
- `packages/native/src/json-parse/index.ts`

### packages/native/src/ps/
- `packages/native/src/ps/index.ts`
- `packages/native/src/ps/types.ts`

### packages/native/src/stream-process/
- `packages/native/src/stream-process/index.ts`

### packages/native/src/text/
- `packages/native/src/text/index.ts`
- `packages/native/src/text/types.ts`

### packages/native/src/truncate/
- `packages/native/src/truncate/index.ts`

### packages/native/src/ttsr/
- `packages/native/src/ttsr/index.ts`
- `packages/native/src/ttsr/types.ts`

### packages/native/src/xxhash/
- `packages/native/src/xxhash/index.ts`

### packages/pi-agent-core/
- `packages/pi-agent-core/package.json`
- `packages/pi-agent-core/tsconfig.json`

### packages/pi-agent-core/src/
- `packages/pi-agent-core/src/agent-loop.test.ts`
- `packages/pi-agent-core/src/agent-loop.ts`
- `packages/pi-agent-core/src/agent.test.ts`
- `packages/pi-agent-core/src/agent.ts`
- `packages/pi-agent-core/src/index.ts`
- `packages/pi-agent-core/src/proxy.ts`
- `packages/pi-agent-core/src/types.ts`

### packages/pi-ai/
- `packages/pi-ai/bedrock-provider.d.ts`
- `packages/pi-ai/bedrock-provider.js`
- `packages/pi-ai/oauth.d.ts`
- `packages/pi-ai/oauth.js`
- `packages/pi-ai/package.json`

### packages/pi-ai/scripts/
- `packages/pi-ai/scripts/generate-models.ts`

### packages/pi-ai/src/
- `packages/pi-ai/src/api-registry.ts`
- `packages/pi-ai/src/bedrock-provider.ts`
- `packages/pi-ai/src/cli.ts`
- `packages/pi-ai/src/env-api-keys.ts`
- `packages/pi-ai/src/index.ts`
- `packages/pi-ai/src/models.custom.ts`
- `packages/pi-ai/src/models.generated.test.ts`
- `packages/pi-ai/src/models.generated.ts`
- `packages/pi-ai/src/models.test.ts`
- `packages/pi-ai/src/models.ts`
- `packages/pi-ai/src/oauth.ts`
- `packages/pi-ai/src/stream.ts`
- `packages/pi-ai/src/types.ts`
- `packages/pi-ai/src/web-runtime-env-api-keys.ts`

### packages/pi-ai/src/providers/
- *(25 files: 25 .ts)*

### packages/pi-ai/src/utils/
- `packages/pi-ai/src/utils/event-stream.ts`
- `packages/pi-ai/src/utils/hash.ts`
- `packages/pi-ai/src/utils/json-parse.ts`
- `packages/pi-ai/src/utils/overflow.ts`
- `packages/pi-ai/src/utils/repair-tool-json.ts`
- `packages/pi-ai/src/utils/sanitize-unicode.ts`
- `packages/pi-ai/src/utils/typebox-helpers.ts`
- `packages/pi-ai/src/utils/validation.ts`

### packages/pi-ai/src/utils/oauth/
- `packages/pi-ai/src/utils/oauth/github-copilot.test.ts`
- `packages/pi-ai/src/utils/oauth/github-copilot.ts`
- `packages/pi-ai/src/utils/oauth/google-antigravity.ts`
- `packages/pi-ai/src/utils/oauth/google-gemini-cli.ts`
- `packages/pi-ai/src/utils/oauth/google-oauth-utils.ts`
- `packages/pi-ai/src/utils/oauth/index.ts`
- `packages/pi-ai/src/utils/oauth/openai-codex.ts`
- `packages/pi-ai/src/utils/oauth/pkce.ts`
- `packages/pi-ai/src/utils/oauth/types.ts`

### packages/pi-ai/src/utils/tests/
- `packages/pi-ai/src/utils/tests/json-parse.test.ts`
- `packages/pi-ai/src/utils/tests/overflow.test.ts`
- `packages/pi-ai/src/utils/tests/repair-tool-json.test.ts`
