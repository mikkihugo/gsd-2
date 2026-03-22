/**
 * GSD Skill Catalog — Curated skill packs mapped to tech stacks.
 *
 * Each pack maps a detected (or user-chosen) tech stack to a skills.sh
 * repo + specific skill names.  The init wizard uses this catalog to
 * install relevant skills during project onboarding.
 *
 * Installation is delegated entirely to the skills.sh CLI:
 *   npx skills add <repo> --skill <name> --skill <name> -y
 *
 * Skills are installed into ~/.agents/skills/ (the industry-standard
 * ecosystem directory shared across all agents).
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { showNextAction } from "../shared/tui.js";
import type { ProjectSignals } from "./detection.js";

// ─── Catalog Types ────────────────────────────────────────────────────────────

export interface SkillPack {
  /** Human-readable name shown in the wizard */
  label: string;
  /** Short description */
  description: string;
  /** skills.sh repo identifier (owner/repo) */
  repo: string;
  /** Specific skill names to install from the repo */
  skills: string[];
  /** Which detected primaryLanguage values trigger this pack */
  matchLanguages?: string[];
  /** Which detected project files trigger this pack */
  matchFiles?: string[];
}

// ─── Curated Catalog ──────────────────────────────────────────────────────────

export const SKILL_CATALOG: SkillPack[] = [
  // ── iOS / Swift ───────────────────────────────────────────────────────────
  {
    label: "Swift / iOS",
    description: "SwiftUI, Swift concurrency, SwiftData, iOS frameworks",
    repo: "dpearson2699/swift-ios-skills",
    skills: ["*"],
    matchLanguages: ["swift"],
    matchFiles: ["Package.swift"],
  },
  // ── React / Next.js ───────────────────────────────────────────────────────
  {
    label: "React & Web Frontend",
    description: "React best practices, web design, accessibility, core web vitals",
    repo: "vercel-labs/agent-skills",
    skills: [
      "vercel-react-best-practices",
      "web-design-guidelines",
      "vercel-composition-patterns",
    ],
    matchLanguages: ["javascript/typescript"],
  },
  // ── React Native ──────────────────────────────────────────────────────────
  {
    label: "React Native",
    description: "React Native patterns and cross-platform mobile development",
    repo: "vercel-labs/agent-skills",
    skills: ["vercel-react-native-skills"],
    matchLanguages: ["javascript/typescript"],
  },
  // ── General Frontend ──────────────────────────────────────────────────────
  {
    label: "Frontend Design & UX",
    description: "Frontend design, accessibility, and browser automation",
    repo: "anthropics/skills",
    skills: ["frontend-design"],
    matchLanguages: ["javascript/typescript"],
  },
  // ── Rust ──────────────────────────────────────────────────────────────────
  {
    label: "Rust",
    description: "Rust language patterns and best practices",
    repo: "anthropics/skills",
    skills: ["rust-best-practices"],
    matchLanguages: ["rust"],
    matchFiles: ["Cargo.toml"],
  },
  // ── Python ────────────────────────────────────────────────────────────────
  {
    label: "Python",
    description: "Python patterns and best practices",
    repo: "anthropics/skills",
    skills: ["python-best-practices"],
    matchLanguages: ["python"],
    matchFiles: ["pyproject.toml", "setup.py"],
  },
  // ── Go ────────────────────────────────────────────────────────────────────
  {
    label: "Go",
    description: "Go language patterns and best practices",
    repo: "anthropics/skills",
    skills: ["go-best-practices"],
    matchLanguages: ["go"],
    matchFiles: ["go.mod"],
  },
  // ── General Tooling ───────────────────────────────────────────────────────
  {
    label: "Document Handling",
    description: "PDF, DOCX, XLSX, PPTX creation and manipulation",
    repo: "anthropics/skills",
    skills: ["pdf", "docx", "xlsx", "pptx"],
  },
];

// ─── Greenfield Tech Stack Choices ────────────────────────────────────────────

/**
 * Choices shown to users when no tech stack can be auto-detected
 * (greenfield repos or empty directories).
 */
export const GREENFIELD_STACKS: Array<{
  id: string;
  label: string;
  description: string;
  packs: string[];
}> = [
  {
    id: "ios",
    label: "iOS / Swift",
    description: "SwiftUI, Swift, iOS frameworks",
    packs: ["Swift / iOS"],
  },
  {
    id: "react-web",
    label: "React Web",
    description: "React, Next.js, web frontend",
    packs: ["React & Web Frontend", "Frontend Design & UX"],
  },
  {
    id: "react-native",
    label: "React Native",
    description: "Cross-platform mobile with React Native",
    packs: ["React Native", "React & Web Frontend"],
  },
  {
    id: "fullstack-js",
    label: "Full-Stack JavaScript/TypeScript",
    description: "Node.js backend + React frontend",
    packs: ["React & Web Frontend", "Frontend Design & UX"],
  },
  {
    id: "rust",
    label: "Rust",
    description: "Systems programming with Rust",
    packs: ["Rust"],
  },
  {
    id: "python",
    label: "Python",
    description: "Python applications, scripts, or ML",
    packs: ["Python"],
  },
  {
    id: "go",
    label: "Go",
    description: "Go services and CLIs",
    packs: ["Go"],
  },
  {
    id: "other",
    label: "Other / Skip",
    description: "Install skills later with npx skills add",
    packs: [],
  },
];

// ─── Detection → Pack Matching ────────────────────────────────────────────────

/**
 * Match project signals to relevant skill packs.
 * Returns packs ordered by relevance (language match first, then file match).
 */
export function matchPacksForProject(signals: ProjectSignals): SkillPack[] {
  const matched = new Set<SkillPack>();

  for (const pack of SKILL_CATALOG) {
    // Language match
    if (pack.matchLanguages && signals.primaryLanguage) {
      if (pack.matchLanguages.includes(signals.primaryLanguage)) {
        matched.add(pack);
        continue;
      }
    }

    // File match
    if (pack.matchFiles) {
      for (const file of pack.matchFiles) {
        if (signals.detectedFiles.includes(file)) {
          matched.add(pack);
          break;
        }
      }
    }
  }

  return [...matched];
}

// ─── Installation ─────────────────────────────────────────────────────────────

/**
 * Install a skill pack via the skills.sh CLI.
 * Runs: npx skills add <repo> --skill <name> ... -y
 *
 * Returns true if installation succeeded.
 */
export function installSkillPack(pack: SkillPack): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ["--yes", "skills", "add", pack.repo];

    if (pack.skills.length === 1 && pack.skills[0] === "*") {
      args.push("--all");
    } else {
      for (const skill of pack.skills) {
        args.push("--skill", skill);
      }
      args.push("-y");
    }

    execFile("npx", args, { timeout: 120_000 }, (error) => {
      resolve(!error);
    });
  });
}

/**
 * Check if any skills from a pack are already installed.
 */
export function isPackInstalled(pack: SkillPack): boolean {
  const skillsDir = join(homedir(), ".agents", "skills");
  if (!existsSync(skillsDir)) return false;

  if (pack.skills.length === 1 && pack.skills[0] === "*") {
    // For wildcard packs, check if the repo name appears as a skill dir prefix
    // This is a heuristic — can't know all skill names without querying the repo
    return false;
  }

  return pack.skills.every((name) =>
    existsSync(join(skillsDir, name, "SKILL.md")),
  );
}

// ─── Init Wizard Integration ──────────────────────────────────────────────────

/**
 * Run skill installation step during project init.
 *
 * Brownfield (signals.detectedFiles.length > 0):
 *   Auto-detects tech stack → shows matched packs → installs accepted ones.
 *
 * Greenfield (no files detected):
 *   Asks user what tech stack they're using → maps to packs → installs.
 *
 * Returns the list of installed pack labels.
 */
export async function runSkillInstallStep(
  ctx: ExtensionCommandContext,
  signals: ProjectSignals,
): Promise<string[]> {
  const installed: string[] = [];
  const isBrownfield = signals.detectedFiles.length > 0;

  if (isBrownfield) {
    // ── Brownfield: auto-detect and confirm ─────────────────────────────────
    const matched = matchPacksForProject(signals);
    if (matched.length === 0) return installed;

    // Filter out already-installed packs
    const toInstall = matched.filter((p) => !isPackInstalled(p));
    if (toInstall.length === 0) return installed;

    const packNames = toInstall.map((p) => `${p.label}: ${p.description}`);
    const choice = await showNextAction(ctx, {
      title: "GSD — Install Skills",
      summary: [
        `Detected: ${signals.primaryLanguage ?? "unknown"} project`,
        "",
        "Recommended skill packs:",
        ...packNames.map((n) => `  • ${n}`),
      ],
      actions: [
        {
          id: "install",
          label: "Install recommended skills",
          description: `Install ${toInstall.length} skill pack${toInstall.length > 1 ? "s" : ""} via skills.sh`,
          recommended: true,
        },
        {
          id: "skip",
          label: "Skip",
          description: "Install skills later with npx skills add",
        },
      ],
      notYetMessage: "Run /gsd init when ready.",
    });

    if (choice === "install") {
      for (const pack of toInstall) {
        ctx.ui.notify(`Installing ${pack.label} skills...`, "info");
        const ok = await installSkillPack(pack);
        if (ok) {
          installed.push(pack.label);
        } else {
          ctx.ui.notify(`Failed to install ${pack.label} — try manually: npx skills add ${pack.repo}`, "info");
        }
      }
    }
  } else {
    // ── Greenfield: ask user what they're building ──────────────────────────
    const stackChoice = await showNextAction(ctx, {
      title: "GSD — Project Skills",
      summary: [
        "What are you building? GSD will install relevant agent skills.",
        "Skills are installed globally via skills.sh and shared across agents.",
      ],
      actions: GREENFIELD_STACKS.map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
      })),
      notYetMessage: "Run /gsd init when ready.",
    });

    if (stackChoice === "not_yet" || stackChoice === "other") return installed;

    const stack = GREENFIELD_STACKS.find((s) => s.id === stackChoice);
    if (!stack) return installed;

    const packsToInstall = SKILL_CATALOG.filter((p) =>
      stack.packs.includes(p.label),
    ).filter((p) => !isPackInstalled(p));

    for (const pack of packsToInstall) {
      ctx.ui.notify(`Installing ${pack.label} skills...`, "info");
      const ok = await installSkillPack(pack);
      if (ok) {
        installed.push(pack.label);
      } else {
        ctx.ui.notify(`Failed to install ${pack.label} — try manually: npx skills add ${pack.repo}`, "info");
      }
    }
  }

  if (installed.length > 0) {
    ctx.ui.notify(`Installed: ${installed.join(", ")}`, "info");
  }

  return installed;
}
