import { gql } from "@urql/core";
import { create } from "zustand";
import { toast } from "sonner";
import { client } from "../lib/urql";

const DESIGN_ELEMENT_STYLE_SOURCE_QUERY = gql`
  query DesignElementEditorStyleSource($sessionGroupId: ID!, $elementId: String!) {
    designElementStyleSource(sessionGroupId: $sessionGroupId, elementId: $elementId) {
      sourceHash
      styles {
        color
        backgroundColor
        fontSize
        fontWeight
        textAlign
        borderRadius
        paddingX
        paddingY
      }
    }
  }
`;

const DESIGN_ELEMENT_TEXT_SOURCE_QUERY = gql`
  query DesignElementEditorTextSource(
    $sessionGroupId: ID!
    $filePath: String!
    $elementId: String!
  ) {
    designElementTextSource(
      sessionGroupId: $sessionGroupId
      filePath: $filePath
      elementId: $elementId
    ) {
      text
      sourceHash
    }
  }
`;

const SAVE_MANUAL_ELEMENT_EDITS_MUTATION = gql`
  mutation SaveManualElementEdits($sessionGroupId: ID!, $inputs: [ManualElementEditInput!]!) {
    saveManualElementEdits(sessionGroupId: $sessionGroupId, inputs: $inputs) {
      commitSha
    }
  }
`;

export type DesignEditorStyles = {
  color: string;
  backgroundColor: string;
  fontSize: number;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  borderRadius: number;
  paddingX: number;
  paddingY: number;
};

const DESIGN_EDITOR_STYLE_KEYS = [
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "textAlign",
  "borderRadius",
  "paddingX",
  "paddingY",
] as const satisfies ReadonlyArray<keyof DesignEditorStyles>;

type ManualStyles = Partial<DesignEditorStyles>;

export type DesignEditorSelectionMessage = {
  filePath: string;
  elementId: string;
  elementName: string;
  text: string;
  autoTarget: boolean;
  editableText: boolean;
  styles: Partial<Record<keyof DesignEditorStyles, string | number>>;
};

export type DesignEditorTarget = {
  filePath: string;
  elementId: string;
  elementName: string;
  autoTarget: boolean;
  editableText: boolean;
  originalText: string;
  draftText: string;
  textSourceHash: string | null;
  originalStyles: DesignEditorStyles;
  draftStyles: DesignEditorStyles;
  manualStyles: ManualStyles;
  styleSourceHash: string;
};

type FrameMessage = Record<string, unknown>;
const frameSenders = new Map<string, (message: FrameMessage) => void>();
let selectionRequest = 0;

export function registerDesignEditorFrame(
  sessionGroupId: string,
  send: (message: FrameMessage) => void,
): () => void {
  frameSenders.set(sessionGroupId, send);
  return () => {
    if (frameSenders.get(sessionGroupId) === send) frameSenders.delete(sessionGroupId);
  };
}

export function reapplyDesignEditorDrafts(sessionGroupId: string): void {
  const state = useDesignEditorStore.getState();
  if (state.activeSessionGroupId !== sessionGroupId) return;
  for (const target of Object.values(state.drafts)) previewTarget(sessionGroupId, target);
}

function post(sessionGroupId: string, message: FrameMessage): void {
  frameSenders.get(sessionGroupId)?.(message);
}

function targetKey(target: Pick<DesignEditorTarget, "filePath" | "elementId">): string {
  return `${target.filePath}\u0000${target.elementId}`;
}

function restoreTarget(sessionGroupId: string, target: DesignEditorTarget | null): void {
  if (!target) return;
  if (target.editableText) {
    post(sessionGroupId, {
      type: "trace:design:preview-text",
      elementId: target.elementId,
      text: target.originalText,
    });
  }
  const changedStyles: Partial<DesignEditorStyles> = {};
  for (const key of DESIGN_EDITOR_STYLE_KEYS) {
    if (target.draftStyles[key] !== target.originalStyles[key]) {
      Object.assign(changedStyles, { [key]: target.originalStyles[key] });
    }
  }
  if (Object.keys(changedStyles).length > 0) {
    post(sessionGroupId, {
      type: "trace:design:preview-styles",
      elementId: target.elementId,
      styles: changedStyles,
    });
  }
}

function previewTarget(sessionGroupId: string, target: DesignEditorTarget): void {
  if (target.editableText && target.draftText !== target.originalText) {
    post(sessionGroupId, {
      type: "trace:design:preview-text",
      elementId: target.elementId,
      text: target.draftText,
    });
  }
  const styles: Partial<DesignEditorStyles> = {};
  for (const key of DESIGN_EDITOR_STYLE_KEYS) {
    if (target.draftStyles[key] !== target.originalStyles[key]) {
      Object.assign(styles, { [key]: target.draftStyles[key] });
    }
  }
  if (Object.keys(styles).length > 0) {
    post(sessionGroupId, {
      type: "trace:design:preview-styles",
      elementId: target.elementId,
      styles,
    });
  }
}

function normalizeStyles(styles: DesignEditorSelectionMessage["styles"]): DesignEditorStyles {
  return {
    color: normalizeColor(styles.color, "#111111"),
    backgroundColor: normalizeColor(styles.backgroundColor, "transparent", true),
    fontSize: clampNumber(styles.fontSize, 8, 96, 16),
    fontWeight: normalizeFontWeight(styles.fontWeight),
    textAlign:
      styles.textAlign === "center" || styles.textAlign === "right" ? styles.textAlign : "left",
    borderRadius: clampNumber(styles.borderRadius, 0, 64, 0),
    paddingX: clampNumber(styles.paddingX, 0, 64, 0),
    paddingY: clampNumber(styles.paddingY, 0, 64, 0),
  };
}

function normalizeColor(
  value: string | number | undefined,
  fallback: string,
  allowTransparent = false,
): string {
  if (typeof value !== "string") return fallback;
  if (/^#[0-9a-f]{6}$/iu.test(value)) return value.toLowerCase();
  const components = value.match(/[\d.]+/gu)?.map(Number) ?? [];
  if (allowTransparent && components.length >= 4 && components[3] === 0) return "transparent";
  const match = value.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/iu);
  if (!match) return fallback;
  return `#${[match[1], match[2], match[3]]
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")}`;
}

function clampNumber(
  value: string | number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : fallback;
}

function normalizeFontWeight(value: string | number | undefined): number {
  const numeric = clampNumber(value, 100, 900, 400);
  return [400, 500, 600, 700].reduce((closest, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(closest - numeric) ? candidate : closest,
  );
}

function manualStyles(value: Record<string, unknown> | null | undefined): ManualStyles {
  const result: ManualStyles = {};
  for (const key of DESIGN_EDITOR_STYLE_KEYS) {
    const field = value?.[key];
    if (field !== null && field !== undefined) {
      Object.assign(result, { [key]: field });
    }
  }
  return result;
}

export function designEditorTextDirty(target: DesignEditorTarget | null): boolean {
  return (
    !!target?.editableText && !!target.textSourceHash && target.draftText !== target.originalText
  );
}

export function designEditorStylesDirty(target: DesignEditorTarget | null): boolean {
  if (!target) return false;
  return DESIGN_EDITOR_STYLE_KEYS.some(
    (key) => target.draftStyles[key] !== target.originalStyles[key],
  );
}

function stylesForSave(target: DesignEditorTarget): ManualStyles {
  const next = { ...target.manualStyles };
  for (const key of DESIGN_EDITOR_STYLE_KEYS) {
    if (target.draftStyles[key] !== target.originalStyles[key]) {
      Object.assign(next, { [key]: target.draftStyles[key] });
    }
  }
  return next;
}

type ManualElementSavedPayload = {
  sessionGroupId: string;
  filePath: string;
  elementId: string;
  text: string | null;
  textSourceHash: string | null;
  styles: Record<string, unknown> | null;
  styleSourceHash: string | null;
};

function targetForSavedEvent(target: DesignEditorTarget, event: ManualElementSavedPayload) {
  return {
    ...target,
    originalText: event.text ?? target.originalText,
    draftText: event.text ?? target.draftText,
    textSourceHash: event.textSourceHash ?? target.textSourceHash,
    originalStyles: event.styles ? target.draftStyles : target.originalStyles,
    draftStyles: event.styles ? target.draftStyles : target.draftStyles,
    manualStyles: event.styles ? manualStyles(event.styles) : target.manualStyles,
    styleSourceHash: event.styleSourceHash ?? target.styleSourceHash,
  };
}

export function reconcileManualElementSaved(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const value = payload as Record<string, unknown>;
  if (
    typeof value.sessionGroupId !== "string" ||
    typeof value.filePath !== "string" ||
    typeof value.elementId !== "string"
  ) {
    return;
  }
  const event: ManualElementSavedPayload = {
    sessionGroupId: value.sessionGroupId,
    filePath: value.filePath,
    elementId: value.elementId,
    text: typeof value.text === "string" ? value.text : null,
    textSourceHash: typeof value.textSourceHash === "string" ? value.textSourceHash : null,
    styles:
      value.styles && typeof value.styles === "object"
        ? (value.styles as Record<string, unknown>)
        : null,
    styleSourceHash: typeof value.styleSourceHash === "string" ? value.styleSourceHash : null,
  };
  const state = useDesignEditorStore.getState();
  if (state.activeSessionGroupId !== event.sessionGroupId) return;
  const key = targetKey(event);
  const savedDraft = state.drafts[key];
  const pendingSaveKeys = state.pendingSaveKeys.filter((pendingKey) => pendingKey !== key);
  const target =
    state.target && targetKey(state.target) === key
      ? targetForSavedEvent(state.target, event)
      : state.target;
  const drafts = { ...state.drafts };
  if (savedDraft) delete drafts[key];
  if (!savedDraft && !state.pendingSaveKeys.includes(key)) return;
  useDesignEditorStore.setState({
    saving: pendingSaveKeys.length > 0,
    error: null,
    target,
    drafts,
    pendingSaveKeys,
  });
  if (pendingSaveKeys.length === 0) toast.success("Edits saved and committed");
}

type DesignEditorState = {
  activeSessionGroupId: string | null;
  target: DesignEditorTarget | null;
  drafts: Record<string, DesignEditorTarget>;
  pendingSaveKeys: string[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  start: (sessionGroupId: string) => void;
  stop: (sessionGroupId: string) => void;
  selectElement: (sessionGroupId: string, selection: DesignEditorSelectionMessage) => Promise<void>;
  changeText: (value: string) => void;
  changeStyle: <Key extends keyof DesignEditorStyles>(
    key: Key,
    value: DesignEditorStyles[Key],
  ) => void;
  resetChanges: () => void;
  cancelSelection: () => void;
  save: () => Promise<void>;
};

export const useDesignEditorStore = create<DesignEditorState>((set, get) => ({
  activeSessionGroupId: null,
  target: null,
  drafts: {},
  pendingSaveKeys: [],
  loading: false,
  saving: false,
  error: null,

  start: (sessionGroupId) => {
    const state = get();
    if (state.activeSessionGroupId && state.activeSessionGroupId !== sessionGroupId) {
      for (const target of Object.values(state.drafts))
        restoreTarget(state.activeSessionGroupId, target);
      post(state.activeSessionGroupId, { type: "trace:design:edit-mode", enabled: false });
    }
    set({
      activeSessionGroupId: sessionGroupId,
      target: null,
      drafts: {},
      pendingSaveKeys: [],
      error: null,
    });
    post(sessionGroupId, { type: "trace:design:edit-mode", enabled: true });
  },

  stop: (sessionGroupId) => {
    const state = get();
    if (state.activeSessionGroupId !== sessionGroupId) return;
    selectionRequest += 1;
    for (const target of Object.values(state.drafts)) restoreTarget(sessionGroupId, target);
    post(sessionGroupId, { type: "trace:design:edit-mode", enabled: false });
    set({
      activeSessionGroupId: null,
      target: null,
      drafts: {},
      pendingSaveKeys: [],
      loading: false,
      saving: false,
      error: null,
    });
  },

  selectElement: async (sessionGroupId, selection) => {
    const state = get();
    if (state.activeSessionGroupId !== sessionGroupId) return;
    if (state.saving) {
      if (state.target) {
        post(sessionGroupId, {
          type: "trace:design:select-element",
          elementId: state.target.elementId,
        });
      }
      return;
    }
    const existingDraft = state.drafts[targetKey(selection)];
    if (existingDraft) {
      set({ target: existingDraft, loading: false, error: null });
      return;
    }
    const requestId = selectionRequest + 1;
    selectionRequest = requestId;
    set({ target: null, loading: true, error: null });
    try {
      const [styleResult, textResult] = await Promise.all([
        client
          .query(
            DESIGN_ELEMENT_STYLE_SOURCE_QUERY,
            { sessionGroupId, elementId: selection.elementId },
            { requestPolicy: "network-only" },
          )
          .toPromise(),
        selection.editableText
          ? client
              .query(
                DESIGN_ELEMENT_TEXT_SOURCE_QUERY,
                {
                  sessionGroupId,
                  filePath: selection.filePath,
                  elementId: selection.elementId,
                },
                { requestPolicy: "network-only" },
              )
              .toPromise()
          : null,
      ]);
      if (selectionRequest !== requestId || get().activeSessionGroupId !== sessionGroupId) return;
      if (styleResult.error) throw new Error(styleResult.error.message);
      const styleSource = styleResult.data?.designElementStyleSource;
      if (!styleSource) throw new Error("This element could not be mapped to manual styles.");
      const textSource = textResult?.error ? null : textResult?.data?.designElementTextSource;
      const originalStyles = normalizeStyles(selection.styles);
      const sourceText = textSource?.text ?? selection.text;
      set({
        target: {
          filePath: selection.filePath,
          elementId: selection.elementId,
          elementName: selection.elementName,
          autoTarget: selection.autoTarget,
          editableText: !!textSource,
          originalText: sourceText,
          draftText: sourceText,
          textSourceHash: textSource?.sourceHash ?? null,
          originalStyles,
          draftStyles: originalStyles,
          manualStyles: manualStyles(styleSource.styles),
          styleSourceHash: styleSource.sourceHash,
        },
        loading: false,
        error: null,
      });
    } catch (cause) {
      if (selectionRequest !== requestId) return;
      set({
        loading: false,
        error: cause instanceof Error ? cause.message : "Failed to inspect this element.",
      });
    }
  },

  changeText: (value) => {
    const state = get();
    if (state.saving || !state.target || !state.activeSessionGroupId || !state.target.editableText)
      return;
    const target = { ...state.target, draftText: value };
    set({ target, drafts: { ...state.drafts, [targetKey(target)]: target }, error: null });
    post(state.activeSessionGroupId, {
      type: "trace:design:preview-text",
      elementId: target.elementId,
      text: value,
    });
  },

  changeStyle: (key, value) => {
    const state = get();
    if (state.saving || !state.target || !state.activeSessionGroupId) return;
    const target = {
      ...state.target,
      draftStyles: { ...state.target.draftStyles, [key]: value },
    };
    set({ target, drafts: { ...state.drafts, [targetKey(target)]: target }, error: null });
    post(state.activeSessionGroupId, {
      type: "trace:design:preview-styles",
      elementId: target.elementId,
      styles: { [key]: value },
    });
  },

  resetChanges: () => {
    const state = get();
    if (state.saving || !state.target || !state.activeSessionGroupId) return;
    restoreTarget(state.activeSessionGroupId, state.target);
    const drafts = { ...state.drafts };
    delete drafts[targetKey(state.target)];
    set({
      target: {
        ...state.target,
        draftText: state.target.originalText,
        draftStyles: state.target.originalStyles,
      },
      drafts,
      error: null,
    });
  },

  cancelSelection: () => {
    const state = get();
    if (state.saving || !state.activeSessionGroupId) return;
    selectionRequest += 1;
    post(state.activeSessionGroupId, { type: "trace:design:clear-selection" });
    set({ target: null, loading: false, error: null });
  },

  save: async () => {
    const state = get();
    const sessionGroupId = state.activeSessionGroupId;
    const targets = Object.values(state.drafts).filter(
      (target) => designEditorTextDirty(target) || designEditorStylesDirty(target),
    );
    if (!sessionGroupId || state.saving || targets.length === 0) return;
    const pendingSaveKeys = targets.map(targetKey);
    set({ saving: true, pendingSaveKeys, error: null });
    try {
      const result = await client
        .mutation(SAVE_MANUAL_ELEMENT_EDITS_MUTATION, {
          sessionGroupId,
          inputs: targets.map((target) => ({
            filePath: target.filePath,
            elementId: target.elementId,
            ...(designEditorTextDirty(target)
              ? { text: target.draftText, expectedTextSourceHash: target.textSourceHash }
              : {}),
            ...(designEditorStylesDirty(target)
              ? {
                  styles: stylesForSave(target),
                  expectedStyleSourceHash: target.styleSourceHash,
                }
              : {}),
          })),
        })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
    } catch (cause) {
      if (get().activeSessionGroupId !== sessionGroupId) return;
      set({
        saving: false,
        pendingSaveKeys: [],
        error: cause instanceof Error ? cause.message : "Failed to save this design element.",
      });
    }
  },
}));
