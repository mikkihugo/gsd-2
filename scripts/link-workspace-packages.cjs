#!/usr/bin/env node
/**
 * link-workspace-packages.cjs
 *
 * Creates node_modules/@sf-run/* and node_modules/@singularity-forge/* symlinks pointing
 * to shipped packages/* directories.
 *
 * During development, npm workspaces creates these automatically. But in the
 * published tarball, workspace packages are shipped under packages/ (via the
 * "files" field) and the @sf-run/* imports in compiled code need node_modules/@sf-run/*
 * to resolve. This script bridges the gap.
 *
 * Runs as part of postinstall (before any ESM code that imports @sf-run/*).
 *
 * On Windows without Developer Mode or administrator rights, creating symlinks
 * (even NTFS junctions) can fail with EPERM. In that case we fall back to
 * cpSync (directory copy) which works universally.
 */
const { existsSync, mkdirSync, symlinkSync, cpSync, lstatSync, readlinkSync, unlinkSync } = require('fs')
const { resolve, join } = require('path')

const root = resolve(__dirname, '..')
const packagesDir = join(root, 'packages')
const scopeDirs = {
  '@sf-run': join(root, 'node_modules', '@sf-run'),
  '@singularity-forge': join(root, 'node_modules', '@singularity-forge'),
}

// Map directory names to scoped package names
const packageMap = {
  'native': { scope: '@sf-run', name: 'native' },
  'pi-agent-core': { scope: '@sf-run', name: 'pi-agent-core' },
  'pi-ai': { scope: '@sf-run', name: 'pi-ai' },
  'pi-coding-agent': { scope: '@sf-run', name: 'pi-coding-agent' },
  'pi-tui': { scope: '@sf-run', name: 'pi-tui' },
  'rpc-client': { scope: '@singularity-forge', name: 'rpc-client' },
  'mcp-server': { scope: '@singularity-forge', name: 'mcp-server' },
}

for (const scopeDir of Object.values(scopeDirs)) {
  if (!existsSync(scopeDir)) {
    mkdirSync(scopeDir, { recursive: true })
  }
}

let linked = 0
let copied = 0
for (const [dir, pkg] of Object.entries(packageMap)) {
  const source = join(packagesDir, dir)
  const scopeDir = scopeDirs[pkg.scope]
  const target = join(scopeDir, pkg.name)

  if (!existsSync(source)) continue

  // Skip if already correctly linked or is a real directory (bundled)
  if (existsSync(target)) {
    try {
      const stat = lstatSync(target)
      if (stat.isSymbolicLink()) {
        const linkTarget = readlinkSync(target)
        if (resolve(join(scopeDir, linkTarget)) === source || linkTarget === source) {
          continue // Already correct
        }
        unlinkSync(target) // Wrong target, relink
      } else {
        continue // Real directory (e.g., copied or from bundleDependencies), don't touch
      }
    } catch {
      continue
    }
  }

  let symlinkOk = false
  try {
    symlinkSync(source, target, 'junction') // junction works on Windows too
    symlinkOk = true
    linked++
  } catch {
    // Symlink failed — common on Windows without Developer Mode or admin rights.
    // Fall back to a directory copy so the package is still resolvable.
  }

  if (!symlinkOk) {
    try {
      cpSync(source, target, { recursive: true })
      copied++
    } catch {
      // Non-fatal — loader.ts will emit a clearer error if resolution still fails
    }
  }
}

if (linked > 0) process.stderr.write(`  Linked ${linked} workspace package${linked !== 1 ? 's' : ''}\n`)
if (copied > 0) process.stderr.write(`  Copied ${copied} workspace package${copied !== 1 ? 's' : ''} (symlinks unavailable)\n`)
