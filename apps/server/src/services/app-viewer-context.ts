import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "../lib/jwt-secret.js";

const JWT_SECRET = resolveJwtSecret();
const TOKEN_TTL_SECONDS = 60;
export const APP_VIEWER_CONTEXT_HEADER = "x-trace-app-viewer-context";

export type AppViewerContext = {
  tokenType: "app_viewer_context";
  userId: string;
  organizationId: string;
  sessionGroupId: string;
  endpointId: string;
};

export function createAppViewerContextToken(context: AppViewerContext): string {
  return jwt.sign(context, JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function verifyAppViewerContextToken(token: string): AppViewerContext | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as unknown as Partial<AppViewerContext>;
    return payload.tokenType === "app_viewer_context" &&
      typeof payload.userId === "string" &&
      typeof payload.organizationId === "string" &&
      typeof payload.sessionGroupId === "string" &&
      typeof payload.endpointId === "string"
      ? (payload as AppViewerContext)
      : null;
  } catch {
    return null;
  }
}
