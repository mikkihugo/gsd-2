/**
 * Process-local phase state for SF-aware shared extensions.
 */

let sfActive = false;
let currentPhase: string | null = null;

export function activateSF(): void {
  sfActive = true;
  currentPhase = null;
}

export function deactivateSF(): void {
  sfActive = false;
  currentPhase = null;
}

export function isSFActive(): boolean {
  return sfActive;
}

export function setCurrentPhase(phase: string): void {
  currentPhase = phase;
}

export function clearCurrentPhase(): void {
  currentPhase = null;
}

export function getCurrentPhase(): string | null {
  return sfActive ? currentPhase : null;
}
