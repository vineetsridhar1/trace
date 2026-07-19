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

const UPDATE_DESIGN_ELEMENT_TEXT_MUTATION = gql`
  mutation UpdateDesignElementText(
    $sessionGroupId: ID!
    $filePath: String!
    $elementId: String!
    $text: String!
    $expectedSourceHash: String!
  ) {
    updateDesignElementText(
      sessionGroupId: $sessionGroupId
      filePath: $filePath
      elementId: $elementId
      text: $text
      expectedSourceHash: $expectedSourceHash
    ) {
      text
      sourceHash
    }
  }
`;

const UPDATE_DESIGN_ELEMENT_STYLES_MUTATION = gql`
  mutation UpdateDesignElementStyles(
    $sessionGroupId: ID!
    $elementId: String!
    $styles: DesignElementStylesInput!
    $expectedSourceHash: String!
  ) {
    updateDesignElementStyles(
      sessionGroupId: $sessionGroupId
      elementId: $elementId
      styles: $styles
      expectedSourceHash: $expectedSourceHash
    ) {
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
  editableText: boolean;
  styles: Partial<Record<keyof DesignEditorStyles, string | number>>;
};

export type DesignEditorTarget = {
  filePath: string;
  elementId: string;
  elementName: string;
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

function post(sessionGroupId: string, message: FrameMessage): void {
  frameSenders.get(sessionGroupId)?.(message);
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

type DesignEditorState = {
  activeSessionGroupId: string | null;
  target: DesignEditorTarget | null;
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
  loading: false,
  saving: false,
  error: null,

  start: (sessionGroupId) => {
    const state = get();
    if (state.activeSessionGroupId && state.activeSessionGroupId !== sessionGroupId) {
      restoreTarget(state.activeSessionGroupId, state.target);
      post(state.activeSessionGroupId, { type: "trace:design:edit-mode", enabled: false });
    }
    set({ activeSessionGroupId: sessionGroupId, target: null, error: null });
    post(sessionGroupId, { type: "trace:design:edit-mode", enabled: true });
  },

  stop: (sessionGroupId) => {
    const state = get();
    if (state.activeSessionGroupId !== sessionGroupId) return;
    selectionRequest += 1;
    restoreTarget(sessionGroupId, state.target);
    post(sessionGroupId, { type: "trace:design:edit-mode", enabled: false });
    set({ activeSessionGroupId: null, target: null, loading: false, saving: false, error: null });
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
    restoreTarget(sessionGroupId, state.target);
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
    set({ target, error: null });
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
    set({ target, error: null });
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
    set({
      target: {
        ...state.target,
        draftText: state.target.originalText,
        draftStyles: state.target.originalStyles,
      },
      error: null,
    });
  },

  cancelSelection: () => {
    const state = get();
    if (state.saving || !state.activeSessionGroupId) return;
    selectionRequest += 1;
    restoreTarget(state.activeSessionGroupId, state.target);
    post(state.activeSessionGroupId, { type: "trace:design:clear-selection" });
    set({ target: null, loading: false, error: null });
  },

  save: async () => {
    const state = get();
    const target = state.target;
    const sessionGroupId = state.activeSessionGroupId;
    if (!target || !sessionGroupId || state.saving) return;
    const saveText = designEditorTextDirty(target);
    const saveStyles = designEditorStylesDirty(target);
    if (!saveText && !saveStyles) return;
    set({ saving: true, error: null });
    try {
      const [textResult, styleResult] = await Promise.all([
        saveText
          ? client
              .mutation(UPDATE_DESIGN_ELEMENT_TEXT_MUTATION, {
                sessionGroupId,
                filePath: target.filePath,
                elementId: target.elementId,
                text: target.draftText,
                expectedSourceHash: target.textSourceHash,
              })
              .toPromise()
          : null,
        saveStyles
          ? client
              .mutation(UPDATE_DESIGN_ELEMENT_STYLES_MUTATION, {
                sessionGroupId,
                elementId: target.elementId,
                styles: stylesForSave(target),
                expectedSourceHash: target.styleSourceHash,
              })
              .toPromise()
          : null,
      ]);
      if (textResult?.error) throw new Error(textResult.error.message);
      if (styleResult?.error) throw new Error(styleResult.error.message);
      const updatedText = textResult?.data?.updateDesignElementText;
      const updatedStyles = styleResult?.data?.updateDesignElementStyles;
      if (
        get().activeSessionGroupId !== sessionGroupId ||
        get().target?.elementId !== target.elementId
      ) {
        return;
      }
      set({
        target: {
          ...target,
          originalText: updatedText?.text ?? target.draftText,
          draftText: updatedText?.text ?? target.draftText,
          textSourceHash: updatedText?.sourceHash ?? target.textSourceHash,
          originalStyles: target.draftStyles,
          manualStyles: updatedStyles ? manualStyles(updatedStyles.styles) : target.manualStyles,
          styleSourceHash: updatedStyles?.sourceHash ?? target.styleSourceHash,
        },
        saving: false,
      });
      toast.success("Design element saved to source");
    } catch (cause) {
      if (get().activeSessionGroupId !== sessionGroupId) return;
      set({
        saving: false,
        error: cause instanceof Error ? cause.message : "Failed to save this design element.",
      });
    }
  },
}));
