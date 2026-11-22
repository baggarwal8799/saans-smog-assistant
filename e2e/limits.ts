/**
 * Budgets enforced by e2e/budgets.spec.ts. The docs quote these, and src/docs.test.ts keeps them in step.
 * First-load JS measured 99,971 bytes on the wire (Nov 2026, after the lazy chunks); the budget is that plus about 10%.
 */
export const JS_BUDGET_KB = 108;
/** The narrowest phone width the layout must fit without text spilling out. */
export const NARROW_WIDTH_PX = 320;
