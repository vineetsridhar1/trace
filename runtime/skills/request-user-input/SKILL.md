---
name: request-user-input
description: Ask users for information, decisions, confirmation, or references through Trace's structured question UI. Use before asking any user-facing question that should pause work for an answer, especially when requirements are ambiguous, options have meaningful tradeoffs, approval is required, or the user needs to attach or reference material.
---

# Request User Input

Use structured questions only when the answer materially changes the work or explicit approval is
required. Resolve safe, reversible details yourself. Do not re-ask facts the user already supplied.

## Ask through Trace

1. Prefer a provider-native structured question tool when one is available and supports the needed
   interaction. Trace normalizes supported native questions into the same UI.
2. Otherwise emit one or more `<trace:request-input>` blocks using the portable contract below.
3. Ask at most three related, high-value questions in one batch. Put the recommended option first
   when there is a sensible default and explain its consequence briefly.
4. After requesting input, stop. Do not continue the task until the answer arrives.

Do not wrap portable question blocks in Markdown fences. Do not put a prose version of the same
question before or after them. Use XML escaping for `&`, `<`, `>`, quotes, and apostrophes in values.

## Portable contract

Every question needs a stable, unique `id`, a supported `type`, and a `<question>`. The optional
`<header>` is a short label. The optional `<context>` explains why the decision matters.

```xml
<trace:request-input id="navigation" type="single-select">
  <header>Navigation</header>
  <question>Which navigation pattern should we use?</question>
  <context>This determines the information hierarchy and mobile behavior.</context>
  <option id="sidebar" description="Best for frequent switching between several areas.">Sidebar</option>
  <option id="tabs" description="Simpler when there are only a few peer sections.">Top tabs</option>
</trace:request-input>
```

The fence above documents syntax only. Actual requests must output raw XML.

Supported types:

- `single-select`: one option.
- `multi-select`: several options; optional integer `min` and `max` attributes.
- `select-with-other`: one option or custom text; use `other="true"` only when adding custom text
  to another selection type.
- `text`: freeform response; optional `maxlength` and `placeholder` attributes. Add short
  `<suggestion>` elements when examples help.
- `confirm`: confirmation. Omit options for the standard confirm/cancel choices, or provide custom
  options when the decision needs different labels.
- `ranking`: reorder the supplied options.
- `reference`: attach or reference supporting material; optional `accept` and `placeholder`
  attributes.

Use option IDs that remain meaningful when labels change. Keep labels short and put tradeoffs in
the `description` attribute. For example:

```xml
<trace:request-input id="launch-scope" type="multi-select" min="1" max="2">
  <header>Launch scope</header>
  <question>Which capabilities belong in the first release?</question>
  <option id="search" description="Makes existing content easier to retrieve.">Search</option>
  <option id="sharing" description="Adds collaboration but requires permission states.">Sharing</option>
  <option id="export" description="Supports handoff with a smaller product surface.">Export</option>
</trace:request-input>
```

The user's structured answers arrive as the next user message. Treat them as authoritative input,
including a “you decide” answer, and continue without asking for the same information again.
