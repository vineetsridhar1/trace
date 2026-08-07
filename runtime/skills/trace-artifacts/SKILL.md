---
name: trace-artifacts
description: Publish complete files or directories as immutable Trace artifacts.
---

# Trace artifacts

The authenticated Trace CLI is available at `$TRACE_CLI`. Always invoke that absolute path; do
not call `trace`, which can resolve to an unrelated system command. Publish a completed output
with:

```bash
"$TRACE_CLI" artifact push <type> <file-or-directory> [--key <key>]
```

Each invocation creates a new immutable artifact. There are no draft, final, update, or status
commands. A directory is one artifact containing its complete file tree. Trace chooses how to
display and render artifacts according to their type.

Do not pass a session ID or credentials. They are supplied by the active Trace invocation.
Only publish after the complete artifact is valid and ready to show to the user.
