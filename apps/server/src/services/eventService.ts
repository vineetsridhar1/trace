import prisma from "../lib/prisma";
import { HookEvent } from "../types/hookEvents";
import { pubsub, TOPICS } from "./pubsub";
import {
  getWorkspaceByIdForFeed,
  getWorkspaceByIdWithSessions,
  updateWorkspacePreviewAndImportance,
  updateWorkspaceStatus,
  updateWorkspaceSummaryAndBranch,
} from "./workspaceService";
import {
  updateTicketFromEvent,
  syncTicketWithWorkspaceStatus,
  refreshTicketBroadcast,
  checkAndTriggerDependents,
  triggerReviewIfAutonomous,
} from "./ticketService";

function extractWorkspaceIdFromWorktreePath(
  worktreePath: string | undefined,
): string | null {
  if (!worktreePath) {
    return null;
  }

  // Normalize path separators to handle both unix and windows-style paths
  const segments = worktreePath.replace(/\\/g, "/").split("/").filter(Boolean);
  // Look for the "worktrees" marker (supports both old .trace-worktrees and new app-data location)
  let markerIndex = segments.lastIndexOf("worktrees");
  if (markerIndex === -1) {
    markerIndex = segments.lastIndexOf(".trace-worktrees");
  }

  if (markerIndex === -1 || markerIndex + 1 >= segments.length) {
    return null;
  }

  return segments[markerIndex + 1] ?? null;
}

function stripTraceInternal(text: string): string {
  return text.replace(/<trace-internal>[\s\S]*?<\/trace-internal>\s*/g, "");
}

function extractPromptFromPayload(payload: HookEvent): string | null {
  const raw = payload as unknown as Record<string, unknown>;
  const candidates = ["prompt", "text", "message", "user_prompt"];

  for (const key of candidates) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function extractPromptFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") {
    return null;
  }

  const raw = rawPayload as Record<string, unknown>;
  const candidates = ["prompt", "text", "message", "user_prompt"];

  for (const key of candidates) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

/**
 * Run auto-complete logic when a Stop event arrives without a toolName
 * (Claude is NOT waiting on user input). Transitions in_progress/needs_input → completed.
 *
 * Also handles `needs_input` because a late-arriving Stop from a previous
 * process (killed for ExitPlanMode/AskUserQuestion) can race with the new
 * process and reset the status to `needs_input` after it was already recovered.
 *
 * Safe to call multiple times — checks current DB status and only acts when
 * the workspace is still `in_progress` or `needs_input`.
 */
async function runAutoCompleteIfNeeded(
  workspaceId: string,
  channelId: string,
  cliSessionId: string,
  sessionId: string,
  toolName: string | null | undefined,
): Promise<void> {
  if (toolName) return; // Claude is waiting on user input

  // Re-read current status from DB to avoid stale data from earlier in the request
  const freshMessage = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { status: true },
  });
  const currentStatus = freshMessage?.status ?? "pending";

  if (currentStatus === "in_progress" || currentStatus === "needs_input") {
    // Find the start of the current turn (most recent user prompt) so we only
    // consider writes from THIS interaction, not older turns in a resumed session.
    const lastPrompt = await prisma.event.findFirst({
      where: {
        session: { workspaceId },
        cliSessionId,
        hookEventName: "UserPromptSubmit",
      },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });

    await updateWorkspaceStatus(workspaceId, "completed");
    void syncTicketWithWorkspaceStatus(workspaceId, channelId, "completed");
    void checkAndTriggerDependents(workspaceId, channelId);
    void triggerReviewIfAutonomous(workspaceId, channelId);
  }
}

export async function ingestEvent(payload: HookEvent) {
  // Resolve target message from worktree path. If the session wasn't spawned
  // by the app (no worktree path), silently drop the event so external CLI
  // sessions don't pollute #general.
  const workspaceIdFromCwd = extractWorkspaceIdFromWorktreePath(payload.cwd);
  const workspaceIdFromTranscript = extractWorkspaceIdFromWorktreePath(
    payload.transcript_path,
  );
  const resolvedWorkspaceId =
    workspaceIdFromCwd ?? workspaceIdFromTranscript ?? payload.workspace_id;
  const workspace = resolvedWorkspaceId
    ? await getWorkspaceByIdWithSessions(resolvedWorkspaceId)
    : null;
  if (!workspace) {
    return null;
  }

  // Upsert CLI session
  const cliSession = await prisma.cliSession.upsert({
    where: { sessionId: payload.session_id },
    create: {
      sessionId: payload.session_id,
      transcriptPath: payload.transcript_path,
      cwd: payload.cwd,
      permissionMode: payload.permission_mode,
      status: "active",
    },
    update: {
      lastSeenAt: new Date(),
      status: payload.hook_event_name === "Stop" ? "stopped" : "active",
      ...(payload.transcript_path
        ? { transcriptPath: payload.transcript_path }
        : {}),
      ...(payload.cwd ? { cwd: payload.cwd } : {}),
      ...(payload.permission_mode
        ? { permissionMode: payload.permission_mode }
        : {}),
    },
  });
  // Save agent session ID on the workspace for conversation continuity.
  // Only update agentSessionId (used for --resume) with real agent session
  // IDs. trace-local-* fallbacks are synthetic IDs generated when the agent exits
  // before streaming a session ID — saving them would cause --resume to fail
  // on the next message, creating an infinite error loop.
  // cliSessionId is always updated for session matching / auto-complete checks.
  if (payload.session_id !== "user-manual-input") {
    const isRealAgentSession = !payload.session_id.startsWith("trace-local-");
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(isRealAgentSession ? { agentSessionId: payload.session_id } : {}),
        cliSessionId: payload.session_id,
        ...((payload as Record<string, unknown>).agent_type
          ? {
              agentType: (payload as Record<string, unknown>)
                .agent_type as string,
            }
          : {}),
      },
    });
  }

  const channelId = workspace.channelId;
  let currentStatus = workspace.status;
  const session =
    workspace.sessions[workspace.sessions.length - 1] ??
    (await prisma.session.create({
      data: { workspaceId: workspace.id },
    }));

  // De-duplicate hook prompt events when we've already persisted the exact
  // prompt from the UI before spawning Claude.
  if (payload.hook_event_name === "UserPromptSubmit") {
    const rawIncoming = extractPromptFromPayload(payload)?.trim() ?? null;
    // Strip <trace-internal> blocks so the injected system instructions
    // don't prevent dedup against the clean prompt already persisted by the UI.
    const incomingPrompt = rawIncoming
      ? stripTraceInternal(rawIncoming).trim()
      : null;
    if (incomingPrompt) {
      const existingPromptEvent = await prisma.event.findFirst({
        where: {
          sessionId: session.id,
          hookEventName: "UserPromptSubmit",
          timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
        orderBy: { timestamp: "desc" },
      });

      const existingPrompt = existingPromptEvent
        ? extractPromptFromRawPayload(existingPromptEvent.rawPayload)
        : null;

      if (
        existingPromptEvent &&
        existingPrompt &&
        existingPrompt === incomingPrompt
      ) {
        return { id: existingPromptEvent.id, session_id: cliSession.sessionId };
      }
    }
  }

  // Auto-transition pending -> in_progress on first non-UserPromptSubmit event.
  if (
    currentStatus === "pending" &&
    payload.hook_event_name !== "UserPromptSubmit"
  ) {
    await updateWorkspaceStatus(workspace.id, "in_progress");
    void syncTicketWithWorkspaceStatus(workspace.id, channelId, "in_progress");
    currentStatus = "in_progress";
  }

  // Auto-transition completed -> in_progress only when a NEW prompt was submitted
  // after the last Stop in this thread. This prevents stale late-arriving hook
  // events from reopening a message that was already completed.
  if (
    currentStatus === "completed" &&
    payload.hook_event_name !== "UserPromptSubmit" &&
    payload.hook_event_name !== "Stop"
  ) {
    const [latestPrompt, latestStop] = await Promise.all([
      prisma.event.findFirst({
        where: {
          sessionId: session.id,
          hookEventName: "UserPromptSubmit",
        },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      }),
      prisma.event.findFirst({
        where: {
          sessionId: session.id,
          hookEventName: "Stop",
        },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      }),
    ]);

    const hasNewPromptSinceLastStop =
      !!latestPrompt &&
      (!latestStop || latestPrompt.timestamp > latestStop.timestamp);
    if (hasNewPromptSinceLastStop) {
      await updateWorkspaceStatus(workspace.id, "in_progress");
      void syncTicketWithWorkspaceStatus(
        workspace.id,
        channelId,
        "in_progress",
      );
      currentStatus = "in_progress";
    }
  }

  // Auto-transition needs_input -> in_progress when user responds or Claude continues.
  // UserPromptSubmit is the expected trigger, but any non-input-requesting event also
  // means the user already responded and Claude is working again.
  if (currentStatus === "needs_input" && payload.hook_event_name !== "Stop") {
    await updateWorkspaceStatus(workspace.id, "in_progress");
    void syncTicketWithWorkspaceStatus(workspace.id, channelId, "in_progress");
    currentStatus = "in_progress";
  }

  // Compute importance
  const importance =
    payload.hook_event_name === "UserPromptSubmit" ||
    payload.hook_event_name === "Stop"
      ? "important"
      : "non-important";

  // Build event data
  const rawPayload = JSON.parse(JSON.stringify(payload));

  const incomingAgentType = (payload as Record<string, unknown>).agent_type as
    | string
    | undefined;

  const eventData: Parameters<typeof prisma.event.create>[0]["data"] = {
    cliSessionId: payload.session_id,
    hookEventName: payload.hook_event_name,
    rawPayload,
    sessionId: session.id,
    importance,
    ...(incomingAgentType ? { agentType: incomingAgentType } : {}),
  };

  // Use pre-extracted data from Electron for Stop events.
  // All enrichment fields (usage, tool name, branch) are read from a single cast.
  let stopBranchName: string | null = null;
  if (payload.hook_event_name === "Stop") {
    const stopPayload = payload as Record<string, unknown>;
    eventData.stopHookActive = payload.stop_hook_active;
    eventData.lastAssistantMessage = payload.last_assistant_message;

    const extractedUsage = stopPayload.extracted_usage as
      | { input_tokens: number; output_tokens: number }
      | undefined;
    if (extractedUsage) {
      rawPayload.usage = extractedUsage;
    }

    const extractedToolName = stopPayload.extracted_tool_name as
      | string
      | undefined;
    const extractedToolInput = stopPayload.extracted_tool_input;

    if (extractedToolName === "AskUserQuestion" && extractedToolInput) {
      eventData.toolName = "AskUserQuestion";
      eventData.toolInput = JSON.parse(JSON.stringify(extractedToolInput));
    } else if (extractedToolName === "ExitPlanMode") {
      eventData.toolName = "ExitPlanMode";
    }

    stopBranchName = (stopPayload.branch_name as string | undefined) ?? null;

    // De-duplicate Stop events: if a Stop event from the SAME session was
    // already created very recently, merge into it instead of creating a
    // duplicate. This guards against edge cases where multiple Stop signals
    // arrive for one run. The sessionId filter ensures a new Claude run on
    // the same message isn't incorrectly deduped against the previous run.
    // Scope dedupe to the current turn. Claude session IDs are reused across
    // turns, so a plain session+time window can accidentally match the
    // previous turn's Stop when runs happen close together.
    const latestPrompt = await prisma.event.findFirst({
      where: {
        sessionId: session.id,
        hookEventName: "UserPromptSubmit",
      },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });

    const dedupeWindowStart = new Date(Date.now() - 60_000);
    const turnWindowStart =
      latestPrompt && latestPrompt.timestamp > dedupeWindowStart
        ? latestPrompt.timestamp
        : dedupeWindowStart;

    const recentStop = await prisma.event.findFirst({
      where: {
        sessionId: session.id,
        cliSessionId: payload.session_id,
        hookEventName: "Stop",
        timestamp: { gte: turnWindowStart },
      },
      orderBy: { timestamp: "desc" },
    });

    if (recentStop) {
      const updates: Record<string, unknown> = {};
      // Prefer newer enriched Stop text from the close handler.
      if (
        typeof eventData.lastAssistantMessage === "string" &&
        eventData.lastAssistantMessage.trim().length > 0 &&
        eventData.lastAssistantMessage !== recentStop.lastAssistantMessage
      ) {
        updates.lastAssistantMessage = eventData.lastAssistantMessage;
      }
      if (eventData.toolName && !recentStop.toolName) {
        updates.toolName = eventData.toolName;
        if (eventData.toolInput) updates.toolInput = eventData.toolInput;
      }
      // Merge rawPayload (enrichment data like usage, branch)
      const mergedRaw = {
        ...((recentStop.rawPayload as Record<string, unknown>) ?? {}),
        ...rawPayload,
      };
      updates.rawPayload = mergedRaw;

      if (Object.keys(updates).length > 0) {
        await prisma.event.update({
          where: { id: recentStop.id },
          data: updates,
        });
      }

      // Broadcast the updated event so the UI picks up merged data
      pubsub.publish(TOPICS.SESSION_EVENT_UPDATED(channelId), {
        sessionEventUpdated: {
          channelId,
          workspaceId: workspace.id,
          sessionId: session.id,
          event: { ...recentStop, ...updates },
        },
      });

      // Update summary/branch from the enriched Stop data (the first Stop from
      // hooks typically lacks branch_name and last_assistant_message).
      if (stopBranchName || eventData.lastAssistantMessage) {
        const summaryText =
          typeof eventData.lastAssistantMessage === "string"
            ? eventData.lastAssistantMessage.slice(0, 500)
            : null;
        await updateWorkspaceSummaryAndBranch(
          workspace.id,
          summaryText,
          stopBranchName,
        );
        if (stopBranchName) {
          void refreshTicketBroadcast(workspace.id, channelId);
        }
      }

      // Run auto-complete even on the deduped Stop. The first Stop (from hooks)
      // may have arrived before all PostToolUse events were persisted. This
      // second Stop (from the close handler, after waitForPendingPosts) has all
      // data available. runAutoCompleteIfNeeded re-reads status from DB and is
      // a no-op if the first Stop already transitioned the status.
      //
      // Use the INCOMING event's toolName for auto-complete, not the merged one.
      // When a replacement process's Stop dedupes with a stale Stop from a
      // previous process (e.g. one killed for ExitPlanMode), the recentStop may
      // carry a stale toolName that would incorrectly block auto-complete.
      await runAutoCompleteIfNeeded(
        workspace.id,
        channelId,
        payload.session_id,
        session.id,
        eventData.toolName as string | null | undefined,
      );

      // Always re-broadcast the hydrated message on deduped Stop so the UI
      // receives final session/status/summary updates even when status is
      // unchanged (e.g. duplicate Stop after completion).
      const hydratedWorkspace = await getWorkspaceByIdForFeed(workspace.id);
      if (hydratedWorkspace) {
        pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
          workspaceUpserted: hydratedWorkspace,
        });
      }

      return { id: recentStop.id, session_id: cliSession.sessionId };
    }
  }

  if (payload.hook_event_name === "PreToolUse") {
    eventData.toolName = payload.tool_name;
    eventData.toolInput = payload.tool_input
      ? JSON.parse(JSON.stringify(payload.tool_input))
      : undefined;
    eventData.toolUseId = payload.tool_use_id;
    eventData.lastAssistantMessage = payload.last_assistant_message;
  }

  if (payload.hook_event_name === "PostToolUse") {
    eventData.toolName = payload.tool_name;
    eventData.toolInput = payload.tool_input
      ? JSON.parse(JSON.stringify(payload.tool_input))
      : undefined;
    eventData.toolResponse = payload.tool_response
      ? JSON.parse(JSON.stringify(payload.tool_response))
      : undefined;
    eventData.toolUseId = payload.tool_use_id;
    eventData.lastAssistantMessage = payload.last_assistant_message;
  }

  const event = await prisma.event.create({ data: eventData });

  // Auto-transition in_progress -> needs_input when AskUserQuestion or ExitPlanMode is detected
  if (
    (eventData.toolName === "AskUserQuestion" ||
      eventData.toolName === "ExitPlanMode") &&
    currentStatus === "in_progress"
  ) {
    await updateWorkspaceStatus(workspace.id, "needs_input");
    void syncTicketWithWorkspaceStatus(workspace.id, channelId, "needs_input");
    currentStatus = "needs_input";
  }

  // Update message preview and importance
  const preview =
    payload.hook_event_name === "Stop" && payload.last_assistant_message
      ? payload.last_assistant_message.slice(0, 200)
      : payload.hook_event_name === "UserPromptSubmit"
        ? (() => {
            const p = extractPromptFromPayload(payload);
            return p ? stripTraceInternal(p).slice(0, 200) : null;
          })()
        : null;

  // Only set the preview once (first message), so the thread preview shows the
  // initial prompt rather than the latest assistant response.
  const shouldSetPreview = preview && !workspace.preview;

  if (shouldSetPreview || importance === "important") {
    await updateWorkspacePreviewAndImportance(
      workspace.id,
      shouldSetPreview ? preview : null,
      importance === "important" ? "important" : workspace.importance,
    );
  }

  // Update summary and branch.
  const summaryText =
    payload.hook_event_name === "Stop" && payload.last_assistant_message
      ? payload.last_assistant_message.slice(0, 500)
      : null;
  const branchName = stopBranchName;

  if (summaryText || branchName) {
    await updateWorkspaceSummaryAndBranch(
      workspace.id,
      summaryText,
      branchName,
    );
  }

  // Re-broadcast the ticket immediately so the board view picks up the
  // updated message.branch without waiting for the AI-powered ticket update.
  if (branchName) {
    void refreshTicketBroadcast(workspace.id, channelId);
  }

  // Update kanban ticket on Stop events with enriched context
  if (payload.hook_event_name === "Stop" && payload.last_assistant_message) {
    // Gather file changes from Write/Edit events in this session for semantic context
    void (async () => {
      try {
        const writeEvents = await prisma.event.findMany({
          where: {
            session: { workspaceId: workspace.id },
            cliSessionId: payload.session_id,
            hookEventName: "PostToolUse",
            toolName: {
              in: [
                "Write",
                "Edit",
                "MultiEdit",
                "NotebookEdit",
                "write",
                "edit",
                "multiedit",
                "notebookedit",
              ],
            },
          },
          select: { toolName: true, toolInput: true },
          orderBy: { timestamp: "asc" },
        });

        const fileChanges = writeEvents
          .map((e: { toolName: string | null; toolInput: unknown }) => {
            const input = (e.toolInput ?? {}) as Record<string, unknown>;
            const filePath = (
              (input.file_path ?? input.path ?? input.filepath ?? "") as string
            ).replace(/.*\/worktrees\/[^/]+\//, ""); // strip worktree prefix for readability
            if (!filePath || filePath.includes("/.claude/")) return null;
            return { file: filePath, operation: e.toolName ?? "modified" };
          })
          .filter(
            (
              f: { file: string; operation: string } | null,
            ): f is { file: string; operation: string } => f !== null,
          );

        // Deduplicate files, keeping the last operation
        const fileMap = new Map<string, string>();
        for (const f of fileChanges) fileMap.set(f.file, f.operation);
        const dedupedChanges = [...fileMap.entries()].map(
          ([file, operation]) => ({ file, operation }),
        );

        await updateTicketFromEvent(
          workspace.id,
          channelId,
          payload.last_assistant_message!.slice(0, 2000),
          summaryText ?? "",
          dedupedChanges,
        );
      } catch (err) {
        console.error("[eventService] enriched ticket update failed:", err);
      }
    })();
  }

  // Auto-complete before broadcast: determine the final workspace status when
  // Claude stops without requesting user input, so the first broadcast already
  // carries the correct (completed) status.
  if (payload.hook_event_name === "Stop") {
    await runAutoCompleteIfNeeded(
      workspace.id,
      channelId,
      payload.session_id,
      session.id,
      eventData.toolName,
    );
  }

  const hydratedWorkspace = await getWorkspaceByIdForFeed(workspace.id);

  // Broadcast via GraphQL subscriptions
  pubsub.publish(TOPICS.SESSION_EVENT_CREATED(channelId), {
    sessionEventCreated: {
      channelId,
      workspaceId: workspace.id,
      sessionId: session.id,
      event,
    },
  });
  if (hydratedWorkspace) {
    pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
      workspaceUpserted: hydratedWorkspace,
    });
  }

  return { id: event.id, session_id: cliSession.sessionId };
}

export async function getEventById(id: string) {
  return prisma.event.findUnique({ where: { id } });
}

export async function getEventsBySession(
  sessionId: string,
  options: {
    hookEventName?: string;
    toolName?: string;
    limit?: number;
    offset?: number;
    after?: string;
  } = {},
) {
  const { hookEventName, toolName, limit = 50, offset = 0, after } = options;

  const where: Record<string, unknown> = { sessionId };
  if (hookEventName) where.hookEventName = hookEventName;
  if (toolName) where.toolName = toolName;
  if (after) where.timestamp = { gt: new Date(after) };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { timestamp: "asc" },
      skip: offset,
      take: limit,
    }),
    prisma.event.count({ where }),
  ]);

  return {
    events,
    total,
    limit,
    offset,
  };
}
