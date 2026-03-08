import { z } from 'zod';

export const PreToolUseSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  workspace_id: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.literal('PreToolUse'),
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  tool_use_id: z.string().optional(),
  last_assistant_message: z.string().optional(),
}).passthrough();

export const PostToolUseSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  workspace_id: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.literal('PostToolUse'),
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  tool_response: z.unknown().optional(),
  tool_use_id: z.string().optional(),
  last_assistant_message: z.string().optional(),
}).passthrough();

export const UserPromptSubmitSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  workspace_id: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.literal('UserPromptSubmit'),
  prompt: z.string().optional(),
  text: z.string().optional(),
  message: z.string().optional(),
  user_prompt: z.string().optional(),
}).passthrough();

export const StopSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  workspace_id: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.literal('Stop'),
  stop_hook_active: z.boolean().optional(),
  last_assistant_message: z.string().optional(),
  // Pre-extracted enrichment data from Electron (avoids server reading local files)
  extracted_usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
  extracted_tool_name: z.enum(['AskUserQuestion', 'ExitPlanMode']).optional(),
  extracted_tool_input: z.unknown().optional(),
  branch_name: z.string().optional(),
}).passthrough();

export const HookEventSchema = z.discriminatedUnion('hook_event_name', [
  PreToolUseSchema,
  PostToolUseSchema,
  UserPromptSubmitSchema,
  StopSchema,
]);

export type HookEvent = z.infer<typeof HookEventSchema>;
export type PreToolUseEvent = z.infer<typeof PreToolUseSchema>;
export type PostToolUseEvent = z.infer<typeof PostToolUseSchema>;
export type UserPromptSubmitEvent = z.infer<typeof UserPromptSubmitSchema>;
export type StopEvent = z.infer<typeof StopSchema>;
