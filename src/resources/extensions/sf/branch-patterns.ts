/**
 * SF branch naming patterns — single source of truth.
 *
 * sf/<worktree>/<milestone>/<slice>  → SLICE_BRANCH_RE
 * sf/quick/<id>-<slug>               → QUICK_BRANCH_RE
 * sf/<workflow>/<...>                 → WORKFLOW_BRANCH_RE (non-milestone sf/ branches)
 */

/** Matches sf/ slice branches: sf/[worktree/]M001[-hash]/S01 */
export const SLICE_BRANCH_RE = /^sf\/(?:([a-zA-Z0-9_-]+)\/)?(M\d+(?:-[a-z0-9]{6})?)\/(S\d+)$/;

/** Matches sf/quick/ task branches */
export const QUICK_BRANCH_RE = /^sf\/quick\//;

/** Matches sf/ workflow branches (non-milestone, e.g. sf/workflow-name/...) */
export const WORKFLOW_BRANCH_RE = /^sf\/(?!M\d)[\w-]+\//;
