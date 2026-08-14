# Composer Issue

The server could accept messages, but the web composer relied on stale client-side metadata.

- Older cdx sessions could show a stale connection state or lack a cached agent status.
- The composer interpreted either case as read-only.
- The cdx CLI did not use that browser-side check, so messages sent through it still worked.

The fix makes the composer follow the server's rules. Stale connection or agent metadata no longer disables typing. Deleted worktrees and unauthorized bridges remain read-only.
