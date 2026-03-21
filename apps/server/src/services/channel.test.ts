import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { ChannelService } from "./channel.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;

describe("ChannelService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates channels and emits channel events", async () => {
    prismaMock.channel.create.mockResolvedValueOnce({
      id: "channel-1",
      name: "general",
      type: "default",
    });

    const service = new ChannelService();
    const channel = await service.create(
      {
        organizationId: "org-1",
        name: "general",
        projectIds: ["project-1"],
      } as any,
      "user",
      "user-1",
    );

    expect(channel).toEqual({ id: "channel-1", name: "general", type: "default" });
    expect(prismaMock.channel.create).toHaveBeenCalledWith({
      data: {
        name: "general",
        type: "default",
        organizationId: "org-1",
        projects: { create: [{ projectId: "project-1" }] },
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalled();
  });

  it("sends channel messages via event creation", async () => {
    prismaMock.channel.findUniqueOrThrow.mockResolvedValueOnce({ organizationId: "org-1" });

    const service = new ChannelService();
    await service.sendMessage("channel-1", "hello", null, "user", "user-1");

    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "message_sent",
      payload: { text: "hello" },
      actorType: "user",
      actorId: "user-1",
      parentId: undefined,
    });
  });
});
