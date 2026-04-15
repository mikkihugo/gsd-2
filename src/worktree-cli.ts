/**
 * SF Worktree CLI — standalone subcommand and -w flag handling.
 *
 * Manages the full worktree lifecycle from the command line:
 *   sf -w                    Create auto-named worktree, start interactive session
 *   sf -w my-feature         Create/resume named worktree
 *   sf worktree list         List worktrees with status
 *   sf worktree merge [name] Squash-merge a worktree into main
 *   sf worktree clean        Remove all merged/empty worktrees
 *   sf worktree remove <n>   Remove a specific worktree
 *
 * On session exit (via session_shutdown event), auto-commits dirty work
 * so nothing is lost. The SF extension reads SF_CLI_WORKTREE to know
 * when a session was launched via -w.
 *
 * Note: Extension modules are .ts files loaded via jiti (not compiled to .js).
 * We use createJiti() here because this module is compiled by tsc but imports
 * from resources/extensions/sf/ which are shipped as raw .ts (#1283).
 */

import chalk from 'chalk'
import { createJiti } from '@mariozechner/jiti'
import { fileURLToPath } from 'node:url'
import { generateWorktreeName } from './worktree-name-gen.js'
import { existsSync } from 'node:fs'
import { resolveBundledSourceResource } from './bundled-resource-path.js'

const jiti = createJiti(fileURLToPath(import.meta.url), { interopDefault: true, debug: false })
const sfExtensionPath = (...segments: string[]) =>
  resolveBundledSourceResource(import.meta.url, 'extensions', 'sf', ...segments)

// Lazily-loaded extension modules (loaded once on first use via jiti)
let _ext: ExtensionModules | null = null

interface ExtensionModules {
  createWorktree: (basePath: string, name: string) => { path: string; branch: string }
  listWorktrees: (basePath: string) => Array<{ name: string; path: string; branch: string }>
  removeWorktree: (basePath: string, name: string, opts?: { deleteBranch?: boolean }) => void
  mergeWorktreeToMain: (basePath: string, name: string, commitMessage: string) => void
  diffWorktreeAll: (basePath: string, name: string) => { added: any[]; modified: any[]; removed: any[] }
  diffWorktreeNumstat: (basePath: string, name: string) => Array<{ added: number; removed: number }>
  worktreeBranchName: (name: string) => string
  worktreePath: (basePath: string, name: string) => string
  runWorktreePostCreateHook: (basePath: string, wtPath: string) => string | null
  nativeHasChanges: (path: string) => boolean
  nativeDetectMainBranch: (basePath: string) => string
  nativeCommitCountBetween: (basePath: string, from: string, to: string) => number
  inferCommitType: (name: string) => string
  autoCommitCurrentBranch: (wtPath: string, reason: string, name: string) => void
}

async function loadExtensionModules(): Promise<ExtensionModules> {
  if (_ext) return _ext
  const [wtMgr, autoWt, gitBridge, gitSvc, wt] = await Promise.all([
    jiti.import(sfExtensionPath('worktree-manager.ts'), {}) as Promise<any>,
    jiti.import(sfExtensionPath('auto-worktree.ts'), {}) as Promise<any>,
    jiti.import(sfExtensionPath('native-git-bridge.ts'), {}) as Promise<any>,
    jiti.import(sfExtensionPath('git-service.ts'), {}) as Promise<any>,
    jiti.import(sfExtensionPath('worktree.ts'), {}) as Promise<any>,
  ])
  _ext = {
    createWorktree: wtMgr.createWorktree,
    listWorktrees: wtMgr.listWorktrees,
    removeWorktree: wtMgr.removeWorktree,
    mergeWorktreeToMain: wtMgr.mergeWorktreeToMain,
    diffWorktreeAll: wtMgr.diffWorktreeAll,
    diffWorktreeNumstat: wtMgr.diffWorktreeNumstat,
    worktreeBranchName: wtMgr.worktreeBranchName,
    worktreePath: wtMgr.worktreePath,
    runWorktreePostCreateHook: autoWt.runWorktreePostCreateHook,
    nativeHasChanges: gitBridge.nativeHasChanges,
    nativeDetectMainBranch: gitBridge.nativeDetectMainBranch,
    nativeCommitCountBetween: gitBridge.nativeCommitCountBetween,
    inferCommitType: gitSvc.inferCommitType,
    autoCommitCurrentBranch: wt.autoCommitCurrentBranch,
  }
  return _ext
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface WorktreeStatus {
  name: string
  path: string
  branch: string
  exists: boolean
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  uncommitted: boolean
  commits: number
}

// ─── Status Helpers ─────────────────────────────────────────────────────────

function getWorktreeStatus(ext: ExtensionModules, basePath: string, name: string, wtPath: string): WorktreeStatus {
  const diff = ext.diffWorktreeAll(basePath, name)
  const numstat = ext.diffWorktreeNumstat(basePath, name)
  const filesChanged = diff.added.length + diff.modified.length + diff.removed.length
  let linesAdded = 0
  let linesRemoved = 0
  for (const s of numstat) { linesAdded += s.added; linesRemoved += s.removed }

  let uncommitted = false
  try { uncommitted = existsSync(wtPath) && ext.nativeHasChanges(wtPath) } catch { /* */ }

  let commits = 0
  try {
    const mainBranch = ext.nativeDetectMainBranch(basePath)
    commits = ext.nativeCommitCountBetween(basePath, mainBranch, ext.worktreeBranchName(name))
  } catch { /* */ }

  return {
    name,
    path: wtPath,
    branch: ext.worktreeBranchName(name),
    exists: existsSync(wtPath),
    filesChanged,
    linesAdded,
    linesRemoved,
    uncommitted,
    commits,
  }
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatStatus(s: WorktreeStatus): string {
  const lines: string[] = []
  const badge = s.uncommitted
    ? chalk.yellow(' (uncommitted)')
    : s.filesChanged > 0
      ? chalk.cyan(' (unmerged)')
      : chalk.green(' (clean)')

  lines.push(`  ${chalk.bold.cyan(s.name)}${badge}`)
  lines.push(`    ${chalk.dim('branch')}  ${chalk.magenta(s.branch)}`)
  lines.push(`    ${chalk.dim('path')}    ${chalk.dim(s.path)}`)

  if (s.filesChanged > 0) {
    lines.push(`    ${chalk.dim('diff')}    ${s.filesChanged} files, ${chalk.green(`+${s.linesAdded}`)} ${chalk.red(`-${s.linesRemoved}`)}, ${s.commits} commit${s.commits === 1 ? '' : 's'}`)
  }

  return lines.join('\n')
}

// ─── Subcommand: list ───────────────────────────────────────────────────────

async function handleList(basePath: string): Promise<void> {
  const ext = await loadExtensionModules()
  const worktrees = ext.listWorktrees(basePath)

  if (worktrees.length === 0) {
    process.stderr.write(chalk.dim('No worktrees. Create one with: sf -w <name>\n'))
    return
  }

  process.stderr.write(chalk.bold('\nWorktrees\n\n'))
  for (const wt of worktrees) {
    const status = getWorktreeStatus(ext, basePath, wt.name, wt.path)
    process.stderr.write(formatStatus(status) + '\n\n')
  }
}

// ─── Subcommand: merge ──────────────────────────────────────────────────────

async function handleMerge(basePath: string, args: string[]): Promise<void> {
  const ext = await loadExtensionModules()
  const name = args[0]
  if (!name) {
    // If only one worktree exists, merge it
    const worktrees = ext.listWorktrees(basePath)
    if (worktrees.length === 1) {
      await doMerge(ext, basePath, worktrees[0].name)
      return
    }
    process.stderr.write(chalk.red('Usage: sf worktree merge <name>\n'))
    process.stderr.write(chalk.dim('Run sf worktree list to see worktrees.\n'))
    process.exit(1)
  }
  await doMerge(ext, basePath, name)
}

async function doMerge(ext: ExtensionModules, basePath: string, name: string): Promise<void> {
  const worktrees = ext.listWorktrees(basePath)
  const wt = worktrees.find(w => w.name === name)
  if (!wt) {
    process.stderr.write(chalk.red(`Worktree "${name}" not found.\n`))
    process.exit(1)
  }

  const status = getWorktreeStatus(ext, basePath, name, wt.path)
  if (status.filesChanged === 0 && !status.uncommitted) {
    process.stderr.write(chalk.dim(`Worktree "${name}" has no changes to merge.\n`))
    // Clean up empty worktree
    ext.removeWorktree(basePath, name, { deleteBranch: true })
    process.stderr.write(chalk.green(`Removed empty worktree ${chalk.bold(name)}.\n`))
    return
  }

  // Auto-commit dirty work before merge
  if (status.uncommitted) {
    try {
      ext.autoCommitCurrentBranch(wt.path, 'worktree-merge', name)
      process.stderr.write(chalk.dim('  Auto-committed dirty work before merge.\n'))
    } catch { /* best-effort */ }
  }

  const commitType = ext.inferCommitType(name)
  const commitMessage = `${commitType}: merge worktree ${name}\n\nSF-Worktree: ${name}`

  process.stderr.write(`\nMerging ${chalk.bold.cyan(name)} → ${chalk.magenta(ext.nativeDetectMainBranch(basePath))}\n`)
  process.stderr.write(chalk.dim(`  ${status.filesChanged} files, ${chalk.green(`+${status.linesAdded}`)} ${chalk.red(`-${status.linesRemoved}`)}\n\n`))

  try {
    ext.mergeWorktreeToMain(basePath, name, commitMessage)
    ext.removeWorktree(basePath, name, { deleteBranch: true })
    process.stderr.write(chalk.green(`✓ Merged and cleaned up ${chalk.bold(name)}\n`))
    process.stderr.write(chalk.dim(`  commit: ${commitMessage}\n`))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(chalk.red(`✗ Merge failed: ${msg}\n`))
    process.stderr.write(chalk.dim('  Resolve conflicts manually, then run sf worktree merge again.\n'))
    process.exit(1)
  }
}

// ─── Subcommand: clean ──────────────────────────────────────────────────────

async function handleClean(basePath: string): Promise<void> {
  const ext = await loadExtensionModules()
  const worktrees = ext.listWorktrees(basePath)
  if (worktrees.length === 0) {
    process.stderr.write(chalk.dim('No worktrees to clean.\n'))
    return
  }

  let cleaned = 0
  for (const wt of worktrees) {
    const status = getWorktreeStatus(ext, basePath, wt.name, wt.path)
    if (status.filesChanged === 0 && !status.uncommitted) {
      try {
        ext.removeWorktree(basePath, wt.name, { deleteBranch: true })
        process.stderr.write(chalk.green(`  ✓ Removed ${chalk.bold(wt.name)} (clean)\n`))
        cleaned++
      } catch {
        process.stderr.write(chalk.yellow(`  ✗ Failed to remove ${wt.name}\n`))
      }
    } else {
      process.stderr.write(chalk.dim(`  ─ Kept ${chalk.bold(wt.name)} (${status.filesChanged} changed files)\n`))
    }
  }

  process.stderr.write(chalk.dim(`\nCleaned ${cleaned} worktree${cleaned === 1 ? '' : 's'}.\n`))
}

// ─── Subcommand: remove ─────────────────────────────────────────────────────

async function handleRemove(basePath: string, args: string[]): Promise<void> {
  const ext = await loadExtensionModules()
  const name = args[0]
  if (!name) {
    process.stderr.write(chalk.red('Usage: sf worktree remove <name>\n'))
    process.exit(1)
  }

  const worktrees = ext.listWorktrees(basePath)
  const wt = worktrees.find(w => w.name === name)
  if (!wt) {
    process.stderr.write(chalk.red(`Worktree "${name}" not found.\n`))
    process.exit(1)
  }

  const status = getWorktreeStatus(ext, basePath, name, wt.path)
  if (status.filesChanged > 0 || status.uncommitted) {
    process.stderr.write(chalk.yellow(`⚠ Worktree "${name}" has unmerged changes (${status.filesChanged} files).\n`))
    process.stderr.write(chalk.yellow('  Use --force to remove anyway, or merge first: sf worktree merge ' + name + '\n'))
    if (!process.argv.includes('--force')) {
      process.exit(1)
    }
  }

  ext.removeWorktree(basePath, name, { deleteBranch: true })
  process.stderr.write(chalk.green(`✓ Removed worktree ${chalk.bold(name)}\n`))
}

// ─── Subcommand: status (default when no args) ─────────────────────────────

async function handleStatusBanner(basePath: string): Promise<void> {
  const ext = await loadExtensionModules()
  const worktrees = ext.listWorktrees(basePath)
  if (worktrees.length === 0) return

  const withChanges = worktrees.filter(wt => {
    try {
      const diff = ext.diffWorktreeAll(basePath, wt.name)
      return diff.added.length + diff.modified.length + diff.removed.length > 0
    } catch { return false }
  })

  if (withChanges.length === 0) return

  const names = withChanges.map(w => chalk.cyan(w.name)).join(', ')
  process.stderr.write(
    chalk.dim('[forge] ') +
    chalk.yellow(`${withChanges.length} worktree${withChanges.length === 1 ? '' : 's'} with unmerged changes: `) +
    names + '\n' +
    chalk.dim('[forge] ') +
    chalk.dim('Resume: sf -w <name>  |  Merge: sf worktree merge <name>  |  List: sf worktree list\n\n'),
  )
}

// ─── -w flag: create/resume worktree for interactive session ────────────────

async function handleWorktreeFlag(worktreeFlag: boolean | string): Promise<void> {
  const ext = await loadExtensionModules()
  const basePath = process.cwd()

  // sf -w (no name) — resume most recent worktree with changes, or create new
  if (worktreeFlag === true) {
    const existing = ext.listWorktrees(basePath)
    const withChanges = existing.filter(wt => {
      try {
        const diff = ext.diffWorktreeAll(basePath, wt.name)
        return diff.added.length + diff.modified.length + diff.removed.length > 0
      } catch { return false }
    })

    if (withChanges.length === 1) {
      // Single active worktree — resume it
      const wt = withChanges[0]
      process.chdir(wt.path)
      process.env.SF_CLI_WORKTREE = wt.name
      process.env.SF_CLI_WORKTREE_BASE = basePath
      process.stderr.write(chalk.green(`✓ Resumed worktree ${chalk.bold(wt.name)}\n`))
      process.stderr.write(chalk.dim(`  path   ${wt.path}\n`))
      process.stderr.write(chalk.dim(`  branch ${wt.branch}\n\n`))
      return
    }

    if (withChanges.length > 1) {
      // Multiple active worktrees — show them and ask user to pick
      process.stderr.write(chalk.yellow(`${withChanges.length} worktrees have unmerged changes:\n\n`))
      for (const wt of withChanges) {
        const status = getWorktreeStatus(ext, basePath, wt.name, wt.path)
        process.stderr.write(formatStatus(status) + '\n\n')
      }
      process.stderr.write(chalk.dim('Specify which one: sf -w <name>\n'))
      process.exit(0)
    }

    // No active worktrees — create a new one
    const name = generateWorktreeName()
    await createAndEnter(ext, basePath, name)
    return
  }

  // sf -w <name> — create or resume named worktree
  const name = worktreeFlag as string
  const existing = ext.listWorktrees(basePath)
  const found = existing.find(wt => wt.name === name)

  if (found) {
    process.chdir(found.path)
    process.env.SF_CLI_WORKTREE = name
    process.env.SF_CLI_WORKTREE_BASE = basePath
    process.stderr.write(chalk.green(`✓ Resumed worktree ${chalk.bold(name)}\n`))
    process.stderr.write(chalk.dim(`  path   ${found.path}\n`))
    process.stderr.write(chalk.dim(`  branch ${found.branch}\n\n`))
  } else {
    await createAndEnter(ext, basePath, name)
  }
}

async function createAndEnter(ext: ExtensionModules, basePath: string, name: string): Promise<void> {
  try {
    const info = ext.createWorktree(basePath, name)

    const hookError = ext.runWorktreePostCreateHook(basePath, info.path)
    if (hookError) {
      process.stderr.write(chalk.yellow(`[forge] ${hookError}\n`))
    }

    process.chdir(info.path)
    process.env.SF_CLI_WORKTREE = name
    process.env.SF_CLI_WORKTREE_BASE = basePath
    process.stderr.write(chalk.green(`✓ Created worktree ${chalk.bold(name)}\n`))
    process.stderr.write(chalk.dim(`  path   ${info.path}\n`))
    process.stderr.write(chalk.dim(`  branch ${info.branch}\n\n`))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(chalk.red(`[forge] Failed to create worktree: ${msg}\n`))
    process.exit(1)
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  handleList,
  handleMerge,
  handleClean,
  handleRemove,
  handleStatusBanner,
  handleWorktreeFlag,
  getWorktreeStatus,
}
