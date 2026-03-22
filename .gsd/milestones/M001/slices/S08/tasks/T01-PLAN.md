---
estimated_steps: 4
estimated_files: 7
skills_used:
  - create-skill
---

# T01: Create the create-workflow skill with references and workflows

**Slice:** S08 — Workflow Creator Skill + Bundled Examples
**Milestone:** M001

## Description

Create the `create-workflow` skill following the router pattern established by existing skills like `create-skill`. This skill is what users invoke via `/skill create-workflow` (or what `/gsd workflow new` points them to) to conversationally build valid YAML workflow definitions. The skill has a SKILL.md router, two workflow files (create from scratch vs. from template), three reference files (schema, verification policies, feature patterns), and a blank YAML scaffold template.

All schema facts must be extracted from the actual `definition-loader.ts` source code to ensure accuracy. The skill teaches the V1 schema: `version: 1`, `name`, `steps[]` with `id/name/prompt/requires/produces`, optional `context_from`, `verify`, `iterate`, and top-level `params` with `{{ key }}` substitution.

## Steps

1. **Create SKILL.md** — YAML frontmatter with `name: create-workflow`, description with trigger words. Body uses pure XML tags (`<essential_principles>`, `<routing>`, `<reference_index>`). Essential principles encode: V1 schema basics (version: 1, steps need id/name/prompt/requires/produces), YAML snake_case convention, path traversal guard (`..` rejected), and the four verify policies. Routing detects intent: "from scratch" → `workflows/create-from-scratch.md`, "from template" / "from example" → `workflows/create-from-template.md`, "help" → ask clarifying question. Reference index lists the 3 reference files with when-to-read guidance. Keep under 500 lines.

2. **Create reference files** — Three files in `references/`:
   - `yaml-schema-v1.md`: Complete field-by-field schema reference. Top-level fields (version, name, description, params, steps). Step fields (id, name, prompt, requires/depends_on, produces, context_from, verify, iterate). Type constraints, required vs optional, defaults. Extracted from `definition-loader.ts` validation logic.
   - `verification-policies.md`: The four policies with YAML examples — `content-heuristic` (minSize?, pattern?), `shell-command` (command required), `prompt-verify` (prompt required), `human-review` (no extra fields). Show complete YAML snippets for each.
   - `feature-patterns.md`: `context_from` (array of step IDs, injects prior artifacts), `iterate` (source + pattern with capture group, fan-out), `params` (top-level defaults, `{{ key }}` in prompts, CLI overrides). Show complete YAML examples for each.

3. **Create workflow files** — Two files in `workflows/`:
   - `create-from-scratch.md`: Conversational step-by-step guide. Ask purpose → ask steps and dependencies → for each step define name/prompt/produces/verification → ask about context_from chaining → ask about params → ask about iterate → assemble YAML → write to `.gsd/workflow-defs/<name>.yaml` → tell user to run `/gsd workflow validate <name>`.
   - `create-from-template.md`: Start from a bundled example. List available templates in `templates/` → user picks one → walk through customization (rename, adjust steps, change prompts, modify params) → write modified version → validate.

4. **Create blank scaffold template** — `templates/workflow-definition.yaml` with all fields present as commented placeholders. Valid YAML structure with `version: 1`, a single example step with all optional fields shown as comments.

## Must-Haves

- [ ] SKILL.md has valid YAML frontmatter with `name: create-workflow`
- [ ] SKILL.md uses pure XML tags — no markdown headings (#, ##, ###) in skill body
- [ ] SKILL.md is under 500 lines
- [ ] Reference files accurately reflect the V1 schema from `definition-loader.ts`
- [ ] All four verification policies are documented with YAML examples
- [ ] Workflow files reference the correct reference and template file paths
- [ ] Blank scaffold is valid YAML

## Verification

- `test -f src/resources/skills/create-workflow/SKILL.md` — exists
- `head -3 src/resources/skills/create-workflow/SKILL.md | grep -q 'name: create-workflow'` — correct frontmatter
- `wc -l src/resources/skills/create-workflow/SKILL.md` — under 500 lines
- `! grep -qP '^#{1,6} ' src/resources/skills/create-workflow/SKILL.md` — no markdown headings in body (after frontmatter)
- All 7 files exist and are non-empty: `for f in SKILL.md workflows/create-from-scratch.md workflows/create-from-template.md references/yaml-schema-v1.md references/verification-policies.md references/feature-patterns.md templates/workflow-definition.yaml; do test -s "src/resources/skills/create-workflow/$f" || echo "MISSING: $f"; done`

## Observability Impact

- **New inspection surface**: `find src/resources/skills/create-workflow -type f` shows all skill files — agents verify completeness by counting (≥7 for T01 files, ≥10 total after T02).
- **Scaffold validation**: The blank `workflow-definition.yaml` scaffold is itself a valid V1 definition that passes `validateDefinition()` — future agents can test this as a smoke check for schema accuracy.
- **Failure visibility**: If reference files document a schema field incorrectly, the bundled examples (T02) that rely on those docs will fail validation with specific error strings — creating a feedback loop between docs and code.
- **No runtime signals**: This task produces static files (Markdown + YAML) — no logs, metrics, or runtime state to monitor.

## Inputs

- `src/resources/extensions/gsd/definition-loader.ts` — V1 schema validation logic to extract accurate schema facts from
- `src/resources/skills/create-skill/SKILL.md` — existing router-pattern skill to follow as structural reference

## Expected Output

- `src/resources/skills/create-workflow/SKILL.md` — router skill entry point
- `src/resources/skills/create-workflow/workflows/create-from-scratch.md` — conversational definition builder workflow
- `src/resources/skills/create-workflow/workflows/create-from-template.md` — customize-from-example workflow
- `src/resources/skills/create-workflow/references/yaml-schema-v1.md` — complete V1 schema reference
- `src/resources/skills/create-workflow/references/verification-policies.md` — four verify policy patterns
- `src/resources/skills/create-workflow/references/feature-patterns.md` — context_from, iterate, params usage
- `src/resources/skills/create-workflow/templates/workflow-definition.yaml` — blank YAML scaffold
