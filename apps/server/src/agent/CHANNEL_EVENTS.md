# Channel Message Events — Agent Integration Guide

When channel messages are implemented, they must emit events matching this schema for the agent pipeline to process them correctly.

## Required Event Shape

```typescript
{
  id: string;                    // unique event ID
  organizationId: string;        // org that owns the channel
  scopeType: "channel";          // must be "channel"
  scopeId: string;               // the channel ID
  eventType: string;             // see supported types below
  actorType: "user" | "agent";   // who sent the message
  actorId: string;               // user or agent ID
  payload: {
    text: string;                // message text content (matches existing event convention)
    html?: string;               // optional HTML-formatted content
    mentions?: Array<{           // @mentions in the message
      userId: string;
    }>;
    parentMessageId?: string;    // alternative to metadata.threadId for threading
                                 // (used by chat events — channels should prefer
                                 // metadata.threadId but both are supported)
  };
  metadata: {
    threadId?: string;           // thread ID for threaded messages
                                 // omit for top-level channel messages
  };
  timestamp: string;             // ISO 8601 timestamp
}
```

## Supported Event Types

| Event Type        | Routing   | Description                          |
| ----------------- | --------- | ------------------------------------ |
| `message_sent`    | aggregate | New message posted in channel        |
| `message_edited`  | aggregate | Existing message was edited          |
| `channel_created` | drop      | Channel was created (not actionable) |

## Threading

- Top-level messages: omit `metadata.threadId`
- Threaded replies: set `metadata.threadId` to the parent message ID
- The aggregator groups threaded messages into `channel:{channelId}:thread:{threadId}` scope keys
- Top-level messages aggregate under `channel:{channelId}`

## Agent Behavior

- **Autonomy mode**: defaults to org-level setting (channels are team-visible)
- **Rate limit**: max 2 unsolicited suggestions per thread per hour
- **@mentions**: `message_sent` with an @mention of the agent routes directly (bypasses aggregation)
- **Context**: the agent receives channel entity, members, projects, repo, and relevant ticket search results

## What Needs to Happen When Adding Channel Messages

1. Emit events with the shape above from the channel message service
2. The router already handles `message_sent` and `message_edited` for any scope type
3. The aggregator already builds `channel:*` scope keys with thread support
4. The context builder already fetches channel entities with members
5. The `message.sendToChannel` action is registered for the agent to reply in channels
6. No pipeline changes required
