/**
 * Action Registry — thin re-export layer.
 *
 * All action definitions, dispatchers, and indexes live in `actions/`.
 * This file preserves the original import paths for existing consumers.
 */

export {
  getAllActions,
  getActionsByScope,
  getCoreActions,
  getExtendedActions,
  findAction,
  getDispatcher,
  validateActionParams,
} from "./actions/index.js";

export type {
  AgentActionRegistration,
  ActionDispatcher,
  ScopeType,
  RiskLevel,
  ParameterField,
  ParameterSchema,
  ServiceContainer,
  AgentContext,
} from "./actions/index.js";
