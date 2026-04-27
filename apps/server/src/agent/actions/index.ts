/**
 * Action Registry — aggregates all domain action files into unified indexes.
 *
 * This is the single entry point for action lookups, dispatch, and prompt rendering.
 * Domain files define registrations + dispatchers; this file builds the indexes.
 */

import type { AgentActionRegistration, ActionDispatcher, ScopeType } from "./types.js";

// Domain imports
import { ticketActions, ticketDispatchers } from "./ticket.actions.js";
import { channelActions, channelDispatchers } from "./channel.actions.js";
import { chatActions, chatDispatchers } from "./chat.actions.js";
import { sessionActions, sessionDispatchers } from "./session.actions.js";
import { projectActions, projectDispatchers } from "./project.actions.js";
import { readActions, readDispatchers } from "./read.actions.js";
import { inboxActions, inboxDispatchers } from "./inbox.actions.js";
import { systemActions, systemDispatchers } from "./system.actions.js";
import { memoryActions, memoryDispatchers } from "./memory.actions.js";

// ---------------------------------------------------------------------------
// Aggregate all actions
// ---------------------------------------------------------------------------

const allActions: AgentActionRegistration[] = [
  ...ticketActions,
  ...channelActions,
  ...chatActions,
  ...sessionActions,
  ...projectActions,
  ...readActions,
  ...inboxActions,
  ...systemActions,
  ...memoryActions,
];

// ---------------------------------------------------------------------------
// Backward-compatibility aliases (old name → new name)
// ---------------------------------------------------------------------------

const ACTION_ALIASES: Record<string, string> = {
  "message.sendToChannel": "channel.sendMessage",
  "link.create": "ticket.link",
};

// ---------------------------------------------------------------------------
// Indexed lookups — O(1) by name, pre-computed by scope
// ---------------------------------------------------------------------------

const actionsByName = new Map<string, AgentActionRegistration>(allActions.map((a) => [a.name, a]));

const ALL_SCOPES: ScopeType[] = ["chat", "channel", "ticket", "session", "project", "system"];

const actionsByScopeCache = new Map<ScopeType, AgentActionRegistration[]>();
const coreByScopeCache = new Map<ScopeType, AgentActionRegistration[]>();
const extendedByScopeCache = new Map<ScopeType, AgentActionRegistration[]>();

for (const scope of ALL_SCOPES) {
  const scoped = allActions.filter((a) => a.scopes.includes(scope));
  actionsByScopeCache.set(scope, scoped);
  coreByScopeCache.set(
    scope,
    scoped.filter((a) => a.tier === "core"),
  );
  extendedByScopeCache.set(
    scope,
    scoped.filter((a) => a.tier === "extended"),
  );
}

// ---------------------------------------------------------------------------
// Dispatch registry — merged from all domain dispatchers
// ---------------------------------------------------------------------------

const dispatchRegistry = new Map<string, ActionDispatcher>([
  ...Object.entries(ticketDispatchers),
  ...Object.entries(channelDispatchers),
  ...Object.entries(chatDispatchers),
  ...Object.entries(sessionDispatchers),
  ...Object.entries(projectDispatchers),
  ...Object.entries(readDispatchers),
  ...Object.entries(inboxDispatchers),
  ...Object.entries(systemDispatchers),
  ...Object.entries(memoryDispatchers),
]);

// ---------------------------------------------------------------------------
// Startup validation — every registered action must have a dispatcher
// ---------------------------------------------------------------------------

for (const action of allActions) {
  if (!dispatchRegistry.has(action.name)) {
    throw new Error(
      `Action "${action.name}" is registered but has no dispatcher. ` +
        `Add a dispatcher in the corresponding domain file.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get all registered actions. */
export function getAllActions(): readonly AgentActionRegistration[] {
  return allActions;
}

/** Get actions filtered by scope type. */
export function getActionsByScope(scope: ScopeType): AgentActionRegistration[] {
  return actionsByScopeCache.get(scope) ?? [];
}

/** Get core actions (full schema in prompt) filtered by scope. Pre-computed. */
export function getCoreActions(scope: ScopeType): AgentActionRegistration[] {
  return coreByScopeCache.get(scope) ?? [];
}

/** Get extended actions (catalog line in prompt) filtered by scope. Pre-computed. */
export function getExtendedActions(scope: ScopeType): AgentActionRegistration[] {
  return extendedByScopeCache.get(scope) ?? [];
}

/** Find a specific action by name. Supports backward-compat aliases. O(1). */
export function findAction(name: string): AgentActionRegistration | undefined {
  return actionsByName.get(name) ?? actionsByName.get(ACTION_ALIASES[name] ?? "");
}

/** Get a dispatcher function for an action name. Supports aliases. */
export function getDispatcher(name: string): ActionDispatcher | undefined {
  return dispatchRegistry.get(name) ?? dispatchRegistry.get(ACTION_ALIASES[name] ?? "");
}

/** Validate that action parameters contain all required fields and no unknown fields. */
export function validateActionParams(
  action: AgentActionRegistration,
  params: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const knownFields = new Set(Object.keys(action.parameters.fields));

  for (const key of Object.keys(params)) {
    if (!knownFields.has(key)) {
      errors.push(`Unknown field: ${key}`);
    }
  }

  for (const [fieldName, field] of Object.entries(action.parameters.fields)) {
    if (field.required && (params[fieldName] === undefined || params[fieldName] === null)) {
      errors.push(`Missing required field: ${fieldName}`);
    }

    const value = params[fieldName];
    if (value === undefined || value === null) continue;

    if (field.type === "array") {
      if (!Array.isArray(value)) {
        errors.push(`Field ${fieldName} must be an array`);
      } else if (field.items?.type === "string") {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] !== "string") {
            errors.push(`Field ${fieldName}[${i}] must be a string`);
            break;
          }
        }
      }
    } else if (field.type === "string" && typeof value !== "string") {
      errors.push(`Field ${fieldName} must be a string`);
    } else if (field.type === "number" && typeof value !== "number") {
      errors.push(`Field ${fieldName} must be a number`);
    } else if (field.type === "boolean" && typeof value !== "boolean") {
      errors.push(`Field ${fieldName} must be a boolean`);
    }

    if (field.enum && typeof value === "string" && !field.enum.includes(value)) {
      errors.push(`Field ${fieldName} must be one of: ${field.enum.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Re-export types for consumers
export type {
  AgentActionRegistration,
  ActionDispatcher,
  ScopeType,
  RiskLevel,
  ParameterField,
  ParameterSchema,
} from "./types.js";
export type { ServiceContainer, AgentContext } from "./types.js";
