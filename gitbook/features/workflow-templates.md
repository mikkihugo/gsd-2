# Workflow Templates

Workflow templates are pre-built patterns for common development tasks. Instead of setting up a full milestone for a quick bugfix or spike, use a template to get started immediately.

## Using Templates

```
/sf start              # pick from available templates
/sf start resume       # resume an in-progress workflow
```

## Available Templates

| Template | Purpose |
|----------|---------|
| `bugfix` | Fix a specific bug with diagnosis and verification |
| `spike` | Time-boxed investigation or prototype |
| `feature` | Standard feature development |
| `hotfix` | Urgent production fix |
| `refactor` | Code restructuring and cleanup |
| `security-audit` | Security review and remediation |
| `dep-upgrade` | Dependency update and migration |
| `full-project` | Complete project from scratch |

## Listing and Inspecting

```
/sf templates                    # list all available templates
/sf templates info <name>        # show details for a template
```

## Custom Workflows

Create your own workflow definitions:

```
/sf workflow new                  # create a new workflow YAML
/sf workflow run <name>           # start a workflow run
/sf workflow list                 # list active runs
/sf workflow validate <name>      # validate definition
/sf workflow pause                # pause running workflow
/sf workflow resume               # resume paused workflow
```

Custom workflows are defined in YAML and can specify phases, dependencies, and configuration for each step.
