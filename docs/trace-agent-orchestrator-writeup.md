# Trace: The Agent Orchestrator Built for Real Software Teams

Trace is the control plane for the next era of software development: a world where human engineers, AI agents, local machines, cloud runtimes, project plans, tickets, terminals, branches, files, approvals, and reviews all need to move together.

The old workflow was built around a person sitting in front of one editor, one terminal, and one task. That model is breaking. Teams now run multiple AI coding sessions in parallel. A single engineer might have Codex working on a backend migration, Claude Code exploring a frontend bug, another session writing tests, and a fourth session waiting for approval on a risky change. Multiply that by a team, and suddenly the real problem is no longer whether an agent can write code. The real problem is orchestration.

Trace exists because agentic development needs more than a chat box. It needs durable state. It needs session lifecycle. It needs human review. It needs permission boundaries. It needs runtime routing. It needs project memory. It needs event history. It needs a shared surface where everyone can see what is happening and decide what should happen next.

That is what Trace is.

Trace is an AI-native platform that collapses project management, team communication, and AI-assisted development into one shared system. It treats every meaningful action as an event, every agent as a first-class actor, and every coding run as a durable object that can be started, inspected, paused, resumed, forked, archived, reviewed, and continued from anywhere.

It is not just a wrapper around an AI coding tool. It is the operating layer around the work.

## The Big Idea: Everything Is an Event

Trace starts with a simple thesis: the separation between chat, project management, and coding sessions is artificial.

A message is an event. A ticket update is an event. A session starting is an event. A terminal command is an event. A runtime connecting is an event. A file changing is an event. A checkpoint being created is an event. A human approving access is an event. An agent asking for review is an event.

Once all of those actions live in the same event model, the entire product becomes simpler and more powerful.

Instead of splitting team communication into one system, project tracking into another, agent execution into a terminal, branch state into Git, logs into a different pane, and approval decisions into ad hoc comments, Trace gives the work one durable event stream. The UI, API, agent runtime, service layer, subscriptions, and client stores all operate from that shared reality.

That means a coding session is not a disposable terminal tab. It has a history. It has context. It has status. It has files. It has terminal output. It has a branch. It has checkpoints. It has runtime state. It has permissions. It has an audit trail. It can be handed off. It can be reviewed. It can be resumed later. It can be monitored from mobile. It can be part of a larger project run.

This is what makes Trace feel fundamentally different from a pile of agent processes. Trace is not just starting agents. Trace is remembering the work.

## Agents Are First-Class Citizens

Most systems treat agents as something bolted on after the product already exists. There is a user workflow, and then somewhere off to the side there is an "agent mode" with a different path, a different set of assumptions, and a different security model.

Trace does not do that.

In Trace, agents and humans operate through the same service layer. They are both actors in the same system. The distinction is captured explicitly through actor metadata, not through a separate product universe.

That matters because it means capabilities compound.

If humans can create projects, agents can participate in projects through the same underlying service contracts. If humans can append messages, agents can generate messages through the same event-producing paths. If humans can work with sessions, agents can be orchestrated through the same session lifecycle. If the product adds a new service capability, that capability becomes available to both client surfaces and agent runtimes without duplicating business logic.

This is the right abstraction for AI-native work. Agents should not be magical sidecars that bypass the product. They should be accountable participants inside the product.

Trace gives them that role.

## The Service Layer Is the Product

Trace is designed around a clean architectural principle: actions go in, events come out.

Clients do not create events directly. Agents do not create events directly. GraphQL does not contain the business logic. The service layer validates the action, checks authorization, performs the state transition, appends the event, and broadcasts it.

That sounds like an implementation detail, but it is actually one of Trace's biggest product advantages.

It means the same business rules apply everywhere. Web, mobile, desktop, and agents all converge on the same core behavior. GraphQL becomes a thin external interface instead of a second product implementation. The agent runtime can call services directly without going through GraphQL, but it still goes through the same validation, permissions, and event generation path.

This is how Trace avoids becoming a mess as it grows. It is not one codepath for the web app, another for mobile, another for the desktop bridge, and another for agents. The service layer is the source of truth.

For an orchestrator, that is essential. Orchestration is all about trust. When an agent starts a session, when a runtime connects, when a human approves access, when a ticket moves forward, when a project run launches work, everyone needs to know that the same rules are being applied consistently.

Trace's architecture makes that consistency the default.

## Sessions Are Durable Workspaces, Not Terminal Tabs

The most immediate value of Trace is session control.

A modern engineer does not run one AI coding session. They run many. One session might be investigating a flaky test. Another might be implementing a ticket. Another might be refactoring a component. Another might be waiting for a model response. Another might be done and ready for review.

Without Trace, those sessions become scattered across terminal tabs, local folders, half-remembered branches, screenshots, Slack updates, and mental notes. It is easy to lose track of what each agent did, what it touched, whether it is still running, whether it needs help, and whether its output is safe to merge.

Trace turns each session into a durable workspace.

A session has lifecycle. It can be started, paused, resumed, terminated, archived, forked, and inspected. A session has visible state. You can see terminal output, file changes, branch state, runtime access, checkpoints, and history. A session can be shared with a team. Someone else can follow along, review the work, or continue from the same context.

That is a major shift.

The unit of work is no longer "whatever is happening in my terminal." The unit of work is a Trace session: a structured, inspectable, collaborative container for an agentic coding run.

That makes AI coding practical at team scale.

## One Control Plane for Local and Cloud Runtimes

Trace is built for both local and cloud execution.

Local sessions run through the Electron desktop bridge. That bridge gives Trace controlled access to local repositories, worktrees, terminals, files, and branch state. It lets a team use local development environments without pretending local filesystem access is the same as cloud execution.

Cloud sessions run through provisioned runtimes and container-backed bridges. They can be started by launcher infrastructure, connect back through Trace's runtime bridge protocol, and participate in the same session lifecycle as local runs.

The important part is that Trace does not turn local and cloud into separate products. The user-facing model stays unified. A session is a session. Runtime details live behind adapters and environment configuration.

That gives teams flexibility without fragmenting the workflow.

Use local sessions when work needs access to a developer machine, a local checkout, a special toolchain, or a branch that is already on disk. Use provisioned environments when work should run in the cloud, inside containers, or on infrastructure managed by the organization. Trace can route both through the same control plane.

That is why Trace is an orchestrator rather than just a launcher. It does not only start compute. It coordinates the lifecycle around the compute.

## Agent Environments Make Runtime Strategy Explicit

Trace's agent environment model is one of its strongest foundations.

Instead of hardcoding a single cloud provider or assuming every organization wants the same runtime shape, Trace models runtime execution as an org-scoped environment. Local and provisioned environments are both first-class. A local environment preserves the desktop bridge path. A provisioned environment lets an organization configure authenticated lifecycle endpoints for start, stop, and status.

That means the platform can support many infrastructure strategies without making the core system vendor-specific.

An organization can have a local desktop setup. It can have a provisioned cloud setup. It can have a default environment. It can select a specific environment when creating a session. It can manage launcher secrets. It can configure metadata for provider-specific needs without baking those provider assumptions into Trace core.

This is exactly the kind of boundary an agent orchestrator needs.

Agent execution infrastructure is going to vary. Some teams will want local machines. Some will want AWS. Some will want Fly. Some will want Kubernetes. Some will want secure internal runners. Some will want ephemeral containers. Some will want strict quota and admission policies.

Trace keeps the product stable while allowing the execution layer to evolve.

## Pluggable Adapters Keep Trace Vendor-Neutral

Trace is built around adapter boundaries instead of vendor lock-in.

There are three important adapter ideas:

- Session adapters decide where a session runs.
- Coding tool adapters decide what coding tool runs.
- LLM adapters decide what model powers AI features.

This gives Trace a clean answer to a problem every AI platform faces: the best tools change fast.

Claude Code, Codex, Cursor-like tools, hosted runtimes, local bridges, model providers, infrastructure providers, and deployment strategies will keep evolving. A durable orchestration layer cannot be welded permanently to one vendor's implementation.

Trace's answer is to make those integrations replaceable.

The core system owns sessions, events, permissions, service contracts, project state, runtime lifecycle, and collaborative visibility. Provider-specific work belongs behind adapters or external launchers. That keeps Trace's center of gravity stable even as the ecosystem changes around it.

For teams, that means adopting Trace does not mean betting the entire workflow on one model vendor, one coding tool, or one cloud provider. Trace is the coordination layer above them.

## Multiplayer Review Is Built Into the Product

AI coding work becomes dramatically more useful when it is visible.

If an agent is working in a private terminal, the rest of the team cannot tell what it is doing unless someone narrates it manually. If it makes a mistake, the context is scattered. If it needs approval, the request might happen in a different tool. If a teammate wants to help, they need to reconstruct the state from scratch.

Trace makes sessions multiplayer.

The same session surface can be viewed by multiple people. Teammates can follow progress, inspect terminal output, review touched files, understand branch state, look at checkpoints, and decide whether to continue, pause, terminate, archive, or hand off the work.

This is not just a nice UI feature. It changes the operating model of a team.

AI coding stops being a private activity happening on individual laptops and starts becoming shared, inspectable team work. A lead can monitor several sessions without screen sharing. A reviewer can understand how a change was produced. A teammate can pick up where someone else left off. A manager can see real progress rather than asking for status. An engineer can check in from mobile while away from the desk.

Trace makes agent work legible.

## Mobile Is Not an Afterthought

Trace includes a mobile client because real orchestration does not only happen at a desk.

Agents can run for minutes or hours. They can finish while someone is in a meeting. They can get blocked while someone is away. They can need approval, review, or a quick decision at inconvenient times. If the only control surface is a desktop terminal, the workflow stalls.

Trace's mobile surface lets people monitor activity, inspect session state, and keep work moving away from the laptop.

That matters for agent orchestration because the value of agents is parallelism. Parallelism only helps if someone can supervise it without becoming trapped in front of every process. Mobile visibility lets the team stay connected to the work as it moves.

## Runtime Access Controls Are Explicit

Agent orchestration needs power, but it also needs boundaries.

Trace treats runtime access as something to be modeled, approved, and scoped. Local filesystem and terminal access go through the desktop bridge. Runtime capabilities are attached to sessions. Access decisions can be represented as product state instead of informal trust.

That is the right posture for AI coding.

Agents are powerful enough to modify files, run commands, inspect repositories, start processes, and prepare branches. Teams need those capabilities, but they also need visibility and control. Trace's bridge and runtime architecture make access part of the orchestrated workflow rather than an invisible side effect of running a CLI tool.

The result is a system that can support serious work without pretending that all environments are equally safe or all actions are equally low risk.

## Project Orchestration Turns Goals Into Executable Work

Trace's roadmap goes beyond individual sessions. The larger vision is project orchestration.

Project orchestration starts with a simple product idea: a user should be able to create a project from a goal, have the AI interview them for missing context, generate a durable plan, turn that plan into tickets, and then coordinate execution through sessions and session groups.

This is where Trace becomes much more than session monitoring.

The project layer gives agentic work a durable planning surface. Instead of asking an agent to solve a vague problem in one long prompt, Trace can help break the work down. The AI can ask questions, record decisions, identify risks, maintain a plan summary, generate tickets with acceptance criteria and test plans, and link execution sessions back to project intent.

From there, orchestration can become progressively more autonomous.

Manual execution links let humans start sessions from project tickets while keeping the work connected. Controller runs can observe progress and summarize outcomes. A sequential orchestrator can launch one ready worker at a time. Human gates can pause for approval when risk is high. Integration and final QA can bring approved branches together. A parallel DAG scheduler can eventually run independent work in parallel while keeping integration serialized.

That is the shape of a serious agent orchestrator.

It is not "ask one AI to do everything." It is plan, decompose, schedule, execute, observe, review, integrate, and learn through a shared event model.

## Human Gates Make Autonomy Practical

Fully autonomous execution sounds exciting until it touches production code, customer data, infrastructure, migrations, security boundaries, or ambiguous product decisions.

Trace's orchestration model recognizes that human judgment is still part of the system.

Human gates and guardrails are not a weakness. They are what make stronger automation usable. A project run can request review. Risky steps can require approval. Duplicate requests can be deduped. Cooldowns can prevent loops. Pause and resume controls can keep work from running away. Inbox-backed approvals can put decisions where humans can actually respond to them.

This makes Trace powerful in a pragmatic way.

The goal is not to remove humans from software development. The goal is to let humans supervise more work, make higher-leverage decisions, and spend less time manually coordinating every intermediate step.

Trace gives agents room to work while keeping humans in control of the moments that matter.

## The Client Architecture Is Designed for Real-Time Work

Trace's frontend architecture is built around the reality that agent orchestration is real-time, state-heavy, and collaborative.

The web app uses React, Vite, urql, Zustand, Tailwind, shadcn/ui, and framer-motion. But the important design decision is not the specific libraries. It is the state model.

urql is transport. Zustand is state. Events arrive through subscriptions. Results are normalized into the client store. Components select fine-grained fields by entity ID. Event lists are partitioned by scope. Lists are virtualized. Subscriptions are viewport-driven.

That architecture matters because Trace has to handle many active entities without turning the UI into a re-render storm.

Sessions, projects, tickets, messages, runtime events, terminal output, notifications, channels, and approvals all need to update live. The UI needs to stay responsive while showing high-volume activity. Teams need to trust that what they are seeing is current.

Trace's client model supports that. It treats real-time state as a first-class product requirement rather than an afterthought.

## GraphQL Is an Interface, Not the Brain

Trace uses GraphQL where it is valuable: as the external interface for clients.

But GraphQL is not where the product logic lives.

The schema is the source of truth for the external contract. Codegen produces shared types and server resolver types. Resolvers are thin wrappers that parse input, call services, and format output. The service layer owns validation, authorization, mutation behavior, event creation, and broadcasting.

This separation is especially important for agent orchestration.

Agents may need to call services directly. Runtime systems may need to participate through bridge protocols. Internal orchestrators may need service access without pretending to be a web client. If all logic lived in GraphQL resolvers, the system would either duplicate logic or force internal automation through the wrong interface.

Trace avoids that by making services the product core.

## Trace Keeps State Where It Belongs

A lot of agent tooling blurs boundaries. Mutation results are used to patch client state. Events are treated as logs rather than source-of-truth state transitions. Agent outputs become the only durable record. Clients make assumptions that should belong to the server. Runtime logic leaks into UI code.

Trace is stricter.

Events are the source of truth for state changes. Mutations fire actions. The resulting events hydrate stores. Event payloads carry enough data to upsert entities without refetching. Lists derive from the entity store. Events are scoped and partitioned. Clients do not directly create event rows. Agents do not bypass services.

This rigor is what lets a system support many users, many agents, many sessions, and many surfaces without collapsing under inconsistent state.

For an orchestrator, correctness is a feature. It is not enough to launch work. The platform has to know what happened.

## Trace Makes Parallel Agent Work Manageable

The real promise of AI coding is not that one agent can help one developer. The real promise is that a team can safely supervise many useful agents at once.

That requires a control plane.

Trace gives each session a visible status. It connects sessions to repositories and branches. It preserves terminal output and file changes. It exposes runtime state. It supports local and cloud execution. It lets people inspect and review work. It lays the foundation for project-level scheduling and dependency-aware parallel execution.

That is what makes parallelism manageable.

Without a system like Trace, parallel agent work becomes chaos. With Trace, it becomes a set of durable, inspectable workstreams. Each workstream has context, ownership, state, and history. The team can see the whole board instead of guessing from terminal tabs.

## Trace Is Built for Teams, Not Demos

Many AI coding demos look impressive because they show a single model doing a single task in a controlled environment.

Real teams need more.

They need local development and cloud execution. They need self-hosting. They need mobile monitoring. They need thin API boundaries. They need branch and runtime visibility. They need service-layer authorization. They need durable events. They need adapter boundaries. They need project planning. They need human gates. They need review. They need integration. They need a path from one impressive session to a reliable operating model.

Trace is built for that operating model.

It is source-available and self-hostable. It can run locally with a database, API server, web app, and Electron bridge. It has production deployment paths with PostgreSQL, Redis, object storage, and Docker. It includes web, mobile, desktop, server, shared GraphQL packages, client-core state handling, and container bridge runtime pieces.

This is not a toy architecture. It is the foundation for serious agentic software work.

## Why Trace Is the Best Agent Orchestrator

Trace is the best agent orchestrator because it understands that orchestration is not a button.

Orchestration is the whole lifecycle around the button.

It is where the work starts. It is where context is captured. It is how the right runtime is selected. It is how the agent gets access. It is how the session becomes visible. It is how outputs are recorded. It is how teammates review progress. It is how approvals happen. It is how branches are tracked. It is how projects are planned. It is how tickets connect to execution. It is how humans stay in control. It is how many sessions become one coordinated workflow.

Trace is built around those realities from the ground up.

Its event model gives the platform memory. Its service layer gives the platform consistency. Its agent model gives agents first-class citizenship. Its adapter architecture gives teams flexibility. Its session model gives coding runs durable shape. Its runtime bridge gives local and cloud work a shared lifecycle. Its frontend state model gives the UI real-time clarity. Its project orchestration roadmap gives teams a path from prompt to plan to tickets to execution to integration.

That combination is what makes Trace powerful.

It does not just ask, "Can an agent write code?"

It asks the more important questions:

- Can the team see what the agent is doing?
- Can the work be resumed later?
- Can the same system support local and cloud execution?
- Can agents and humans use the same business logic?
- Can runtime access be controlled?
- Can the project plan become durable state?
- Can execution be linked back to tickets?
- Can risky steps require human judgment?
- Can many sessions run without losing track?
- Can the platform adapt as tools and models change?

Trace is designed so the answer is yes.

## The Future Trace Points Toward

The future of software work will not be one human chatting with one model in one tab.

It will be teams supervising fleets of specialized agents. It will be projects that start from goals and become plans. It will be agents that ask clarifying questions before coding. It will be tickets generated from durable decisions. It will be sessions launched into the right environment automatically. It will be humans approving important transitions. It will be branches integrated through controlled workflows. It will be mobile notifications for blocked work. It will be live session surfaces where teammates can see what is happening. It will be event streams that preserve the history of how work happened.

Trace is built for that future.

It brings the pieces together: project management, communication, runtime orchestration, agent execution, review, and event-sourced collaboration. It gives software teams a shared cockpit for AI coding work. It makes agents inspectable, accountable, and useful inside the same system humans already use to coordinate.

That is why Trace is not just another AI coding interface.

Trace is the orchestrator.

It is the place where agent work becomes team work.

It is the layer that turns scattered AI sessions into a coherent software delivery system.

It is how teams move from experimenting with agents to actually operating with them.

And that is why Trace is the best foundation for the next generation of AI-native software development.
