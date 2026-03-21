/**
 * Manual QA script for the Action Executor.
 *
 * Run with: npx tsx apps/server/src/agent/executor.test.ts
 *
 * This uses mock services — no DB or running server required.
 * It validates all 5 scenarios from ticket #07's "How to test" section.
 */

import {
  ActionExecutor,
  InMemoryIdempotencyStore,
  type ServiceContainer,
  type ExecutionResult,
} from "./executor.js";

// ---------------------------------------------------------------------------
// Mock services — record calls instead of hitting DB
// ---------------------------------------------------------------------------

const calls: { service: string; method: string; args: unknown[] }[] = [];

function mockFn(service: string, method: string) {
  return (...args: unknown[]) => {
    calls.push({ service, method, args });
    return Promise.resolve({ id: "mock-id", title: "mock" });
  };
}

const mockServices: ServiceContainer = {
  ticketService: {
    create: mockFn("ticketService", "create"),
    update: mockFn("ticketService", "update"),
    addComment: mockFn("ticketService", "addComment"),
    link: mockFn("ticketService", "link"),
  } as unknown as ServiceContainer["ticketService"],
  chatService: {
    sendMessage: mockFn("chatService", "sendMessage"),
  } as unknown as ServiceContainer["chatService"],
  sessionService: {
    start: mockFn("sessionService", "start"),
    pause: mockFn("sessionService", "pause"),
    resume: mockFn("sessionService", "resume"),
  } as unknown as ServiceContainer["sessionService"],
  inboxService: {
    createItem: mockFn("inboxService", "createItem"),
  } as unknown as ServiceContainer["inboxService"],
};

const ctx = {
  organizationId: "org-test-123",
  agentId: "agent-test-456",
  triggerEventId: "event-test-789",
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

async function test(name: string, fn: () => Promise<void>) {
  console.log(`\n📋 ${name}`);
  calls.length = 0;
  await fn();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  console.log("=== Action Executor QA ===\n");

  // ---- Test 1: ticket.create with valid args ----
  await test("1. Execute ticket.create with valid args", async () => {
    const executor = new ActionExecutor(mockServices);
    const result = await executor.execute(
      { actionType: "ticket.create", args: { title: "Bug: login broken" } },
      { ...ctx, triggerEventId: "evt-1" },
    );
    assert(result.status === "success", `status is "success" (got: ${result.status})`);
    assert(calls.length === 1, `one service call made (got: ${calls.length})`);
    assert(calls[0]?.service === "ticketService", `called ticketService`);
    assert(calls[0]?.method === "create", `called create method`);

    // Verify agent identity was injected
    const createArg = calls[0]?.args[0] as Record<string, unknown>;
    assert(createArg?.actorType === "agent", `actorType is "agent"`);
    assert(createArg?.actorId === "agent-test-456", `actorId is the agent's ID`);
    assert(createArg?.organizationId === "org-test-123", `organizationId injected`);
    assert(createArg?.title === "Bug: login broken", `title passed through`);
  });

  // ---- Test 2: Idempotency prevents duplicate ----
  await test("2. Same action + triggerEventId is idempotent", async () => {
    const executor = new ActionExecutor(mockServices);
    const sharedCtx = { ...ctx, triggerEventId: "evt-idem" };

    const r1 = await executor.execute(
      { actionType: "ticket.create", args: { title: "First" } },
      sharedCtx,
    );
    assert(r1.status === "success", `first call succeeds`);
    assert(calls.length === 1, `first call makes a service call`);

    calls.length = 0;
    const r2 = await executor.execute(
      { actionType: "ticket.create", args: { title: "First" } },
      sharedCtx,
    );
    assert(r2.status === "success", `second call returns success`);
    assert(
      typeof r2.result === "string" && r2.result.includes("duplicate"),
      `second call result indicates duplicate`,
    );
    assert(calls.length === 0, `no service call on duplicate (got: ${calls.length})`);
  });

  // ---- Test 3: no_op returns success with no side effects ----
  await test("3. no_op returns success, no service calls", async () => {
    const executor = new ActionExecutor(mockServices);
    const result = await executor.execute(
      { actionType: "no_op", args: {} },
      { ...ctx, triggerEventId: "evt-noop" },
    );
    assert(result.status === "success", `status is "success"`);
    assert(calls.length === 0, `no service calls made`);
  });

  // ---- Test 4: Unknown action returns error ----
  await test("4. Unknown action is rejected", async () => {
    const executor = new ActionExecutor(mockServices);
    const result = await executor.execute(
      { actionType: "foo.bar", args: {} },
      { ...ctx, triggerEventId: "evt-unknown" },
    );
    assert(result.status === "failed", `status is "failed"`);
    assert(result.error?.includes("Unknown action"), `error mentions unknown action`);
    assert(calls.length === 0, `no service calls made`);
  });

  // ---- Test 5: Invalid args returns failure ----
  await test("5. Invalid args (missing required field) returns failure", async () => {
    const executor = new ActionExecutor(mockServices);
    const result = await executor.execute(
      { actionType: "ticket.create", args: {} }, // missing required `title`
      { ...ctx, triggerEventId: "evt-invalid" },
    );
    assert(result.status === "failed", `status is "failed"`);
    assert(result.error?.includes("title"), `error mentions missing "title" field`);
    assert(calls.length === 0, `no service calls made`);
  });

  // ---- Test 6: Idempotency is instance-scoped ----
  await test("6. Two executor instances have independent idempotency", async () => {
    const exec1 = new ActionExecutor(mockServices);
    const exec2 = new ActionExecutor(mockServices);
    const sharedCtx = { ...ctx, triggerEventId: "evt-iso" };
    const action = { actionType: "ticket.create", args: { title: "Isolation test" } };

    await exec1.execute(action, sharedCtx);
    calls.length = 0;

    const r2 = await exec2.execute(action, sharedCtx);
    assert(r2.status === "success", `exec2 succeeds independently`);
    assert(calls.length === 1, `exec2 makes its own service call (not blocked by exec1)`);
  });

  // ---- Test 7: Custom idempotency store is injectable ----
  await test("7. Injectable idempotency store", async () => {
    const store = new InMemoryIdempotencyStore();
    const executor = new ActionExecutor(mockServices, store);
    const key = `agent:${ctx.agentId}:ticket.create:evt-inject`;

    const hasBefore = await store.has(key);
    assert(!hasBefore, `key not in store before execute`);

    await executor.execute(
      { actionType: "ticket.create", args: { title: "Injectable" } },
      { ...ctx, triggerEventId: "evt-inject" },
    );

    const hasAfter = await store.has(key);
    assert(hasAfter, `key is in store after execute`);
  });

  // ---- Test 8: All action types dispatch correctly ----
  await test("8. All action types dispatch to correct service methods", async () => {
    const executor = new ActionExecutor(mockServices);
    const actions = [
      { actionType: "ticket.update", args: { id: "t1", status: "closed" }, expect: ["ticketService", "update"] },
      { actionType: "ticket.addComment", args: { ticketId: "t1", text: "hi" }, expect: ["ticketService", "addComment"] },
      { actionType: "link.create", args: { ticketId: "t1", entityType: "session", entityId: "s1" }, expect: ["ticketService", "link"] },
      { actionType: "message.send", args: { chatId: "c1", text: "hello" }, expect: ["chatService", "sendMessage"] },
      { actionType: "session.pause", args: { id: "s1" }, expect: ["sessionService", "pause"] },
      { actionType: "session.resume", args: { id: "s1" }, expect: ["sessionService", "resume"] },
    ];

    for (const { actionType, args, expect: [svc, method] } of actions) {
      calls.length = 0;
      const result = await executor.execute(
        { actionType, args },
        { ...ctx, triggerEventId: `evt-${actionType}` },
      );
      assert(
        result.status === "success" && calls[0]?.service === svc && calls[0]?.method === method,
        `${actionType} → ${svc}.${method}`,
      );
    }
  });

  // ---- Test 9: Service errors are caught, not thrown ----
  await test("9. Service errors are caught and returned", async () => {
    const failingServices: ServiceContainer = {
      ...mockServices,
      ticketService: {
        create: () => Promise.reject(new Error("DB connection lost")),
      } as unknown as ServiceContainer["ticketService"],
    };
    const executor = new ActionExecutor(failingServices);
    const result = await executor.execute(
      { actionType: "ticket.create", args: { title: "Will fail" } },
      { ...ctx, triggerEventId: "evt-fail" },
    );
    assert(result.status === "failed", `status is "failed"`);
    assert(result.error === "DB connection lost", `error message preserved`);
  });

  // ---- Summary ----
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
