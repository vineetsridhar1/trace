import { vi } from "vitest";

type AnyFn = (...args: any[]) => any;

export function asMock<T extends AnyFn>(fn: T) {
  return fn as unknown as ReturnType<typeof vi.fn<T>>;
}

export function createRedisMock() {
  return {
    set: vi.fn(),
    del: vi.fn(),
    get: vi.fn(),
    scan: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    xadd: vi.fn(),
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

export function createPubsubMock() {
  return {
    publish: vi.fn(),
    asyncIterator: vi.fn(),
    init: vi.fn(),
  };
}

export function createPrismaMock() {
  const prisma = {
    $transaction: vi.fn(),
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    agentIdentity: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    apiToken: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    event: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    ticket: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    ticketAssignee: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    ticketLink: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    chat: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    chatMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    message: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
    participant: {
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    inboxItem: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    repo: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    sessionProject: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    channel: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    channelProject: {
      create: vi.fn(),
    },
    ticketProject: {
      create: vi.fn(),
    },
    agentExecutionLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    processedAgentEvent: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    agentCostTracker: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };

  prisma.$transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      return (input as (tx: typeof prisma) => unknown)(prisma);
    }
    return input;
  });

  return prisma;
}

export function makeDate(value: string): Date {
  return new Date(value);
}
