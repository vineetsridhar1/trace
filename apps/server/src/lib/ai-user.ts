/**
 * Well-known identity for the Trace AI agent.
 *
 * The AI is a real User row so that all foreign keys (createdById, etc.)
 * work naturally. This user is auto-created in the seed and added as an
 * OrgMember of every organization.
 */

/** Deterministic UUID for the AI user — never changes. */
export const TRACE_AI_USER_ID = "00000000-0000-4000-a000-000000000001";

export const TRACE_AI_EMAIL = "ai@trace.dev";
export const TRACE_AI_NAME = "Trace AI";
