// Barrel export for old .planning migration module

export { handleMigrate } from './command.js';
export { parsePlanningDirectory } from './parser.js';
export { validatePlanningDirectory } from './validator.js';
export { transformToSF } from './transformer.js';
export { writeSFDirectory } from './writer.js';
export type { WrittenFiles, MigrationPreview } from './writer.js';
export { generatePreview } from './preview.js';
export type {
  // Input types (old .planning format)
  PlanningProject,
  PlanningPhase,
  PlanningPlan,
  PlanningPlanFrontmatter,
  PlanningPlanMustHaves,
  PlanningSummary,
  PlanningSummaryFrontmatter,
  PlanningSummaryRequires,
  PlanningRoadmap,
  PlanningRoadmapMilestone,
  PlanningRoadmapEntry,
  PlanningRequirement,
  PlanningResearch,
  PlanningConfig,
  PlanningQuickTask,
  PlanningMilestone,
  PlanningState,
  PlanningPhaseFile,
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
  // Output types (SF-2 format)
  SFProject,
  SFMilestone,
  SFSlice,
  SFTask,
  SFRequirement,
  SFSliceSummaryData,
  SFTaskSummaryData,
  SFBoundaryEntry,
} from './types.js';
