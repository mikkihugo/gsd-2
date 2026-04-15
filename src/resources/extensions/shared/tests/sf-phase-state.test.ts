import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
	activateSF,
	deactivateSF,
	setCurrentPhase,
	clearCurrentPhase,
	isSFActive,
	getCurrentPhase,
} from "../sf-phase-state.js";

describe("sf-phase-state", () => {
	beforeEach(() => {
		deactivateSF();
	});

	it("tracks active/inactive state", () => {
		assert.equal(isSFActive(), false);
		activateSF();
		assert.equal(isSFActive(), true);
		deactivateSF();
		assert.equal(isSFActive(), false);
	});

	it("tracks the current phase when active", () => {
		activateSF();
		assert.equal(getCurrentPhase(), null);
		setCurrentPhase("plan-milestone");
		assert.equal(getCurrentPhase(), "plan-milestone");
		clearCurrentPhase();
		assert.equal(getCurrentPhase(), null);
	});

	it("returns null phase when inactive even if phase was set", () => {
		activateSF();
		setCurrentPhase("plan-milestone");
		deactivateSF();
		assert.equal(getCurrentPhase(), null);
	});

	it("deactivation clears the current phase", () => {
		activateSF();
		setCurrentPhase("execute-task");
		deactivateSF();
		activateSF();
		assert.equal(getCurrentPhase(), null);
	});
});
