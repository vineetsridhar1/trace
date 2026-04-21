/**
 * UI side-effects the org-event handlers need to invoke (navigation,
 * badge marks, tab management). The platform plugs in concrete
 * implementations during bootstrap; handlers call them through the
 * registry so the same pure event pipeline runs on web and mobile.
 */
export interface OrgEventUIBindings {
  getActiveChannelId(): string | null;
  getActiveSessionId(): string | null;
  getActiveSessionGroupId(): string | null;
  setActiveChannelId(id: string | null): void;
  setActiveSessionId(id: string | null): void;
  setActiveSessionGroupId(id: string | null): void;
  markChannelDone(id: string): void;
  markSessionDone(id: string): void;
  markSessionGroupDone(id: string): void;
  openSessionTab(groupId: string, sessionId: string): void;
  navigateToSession(channelId: string | null, sessionGroupId: string, sessionId: string): void;
}

const NOOP_BINDINGS: OrgEventUIBindings = {
  getActiveChannelId: () => null,
  getActiveSessionId: () => null,
  getActiveSessionGroupId: () => null,
  setActiveChannelId: () => {},
  setActiveSessionId: () => {},
  setActiveSessionGroupId: () => {},
  markChannelDone: () => {},
  markSessionDone: () => {},
  markSessionGroupDone: () => {},
  openSessionTab: () => {},
  navigateToSession: () => {},
};

let bindings: OrgEventUIBindings = NOOP_BINDINGS;

export function setOrgEventUIBindings(impl: OrgEventUIBindings): void {
  bindings = impl;
}

export function getOrgEventUIBindings(): OrgEventUIBindings {
  return bindings;
}

/** Test-only: reset to no-op bindings. */
export function _resetOrgEventUIBindings(): void {
  bindings = NOOP_BINDINGS;
}
