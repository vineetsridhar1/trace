import { z } from 'zod';

export const PostToolUseSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.literal('PostToolUse'),
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  tool_response: z.unknown().optional(),
  tool_use_id: z.string().optional(),
}).passthrough();

export const UserPromptSubmitSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
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
  permission_mode: z.string().optional(),
  hook_event_name: z.literal('Stop'),
  stop_hook_active: z.boolean().optional(),
  last_assistant_message: z.string().optional(),
}).passthrough();

export const HookEventSchema = z.discriminatedUnion('hook_event_name', [
  PostToolUseSchema,
  UserPromptSubmitSchema,
  StopSchema,
]);

export type HookEvent = z.infer<typeof HookEventSchema>;
export type PostToolUseEvent = z.infer<typeof PostToolUseSchema>;
export type UserPromptSubmitEvent = z.infer<typeof UserPromptSubmitSchema>;
export type StopEvent = z.infer<typeof StopSchema>;
