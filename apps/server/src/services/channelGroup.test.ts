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

vi.mock("./actor-auth.js", () => ({
  assertActorOrgAccess: vi.fn(),
}));

import { prisma } from "../lib/db.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { ChannelGroupService } from "./channelGroup.js";

const prismaMock = prisma as any;

describe("ChannelGroupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters included channels to channels visible to the viewer", async () => {
    prismaMock.channelGroup.findMany.mockResolvedValueOnce([]);

    const service = new ChannelGroupService();
    await service.list("org-1", "user-1");

    expect(prismaMock.channelGroup.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      orderBy: { position: "asc" },
      include: {
        channels: {
          where: {
            OR: [
              { visibility: "public" },
              { ownerId: "user-1" },
              { members: { some: { userId: "user-1", leftAt: null } } },
            ],
          },
          orderBy: { position: "asc" },
        },
      },
    });
  });

  it("rejects deleting a group that contains hidden private channels", async () => {
    prismaMock.channelGroup.findUniqueOrThrow.mockResolvedValueOnce({
      id: "group-1",
      organizationId: "org-1",
    });
    prismaMock.channel.count.mockResolvedValueOnce(1);

    const service = new ChannelGroupService();
    await expect(service.delete("group-1", "user", "user-1")).rejects.toThrow(
      "Not authorized for this channel group",
    );

    expect(assertActorOrgAccess).toHaveBeenCalledWith(prismaMock, "org-1", "user", "user-1");
    expect(prismaMock.channel.count).toHaveBeenCalledWith({
      where: {
        groupId: "group-1",
        NOT: {
          OR: [
            { visibility: "public" },
            { ownerId: "user-1" },
            { members: { some: { userId: "user-1", leftAt: null } } },
          ],
        },
      },
    });
    expect(prismaMock.channelGroup.delete).not.toHaveBeenCalled();
  });

  it("requires visibility to move a channel", async () => {
    prismaMock.channel.findFirstOrThrow.mockRejectedValueOnce(new Error("Not found"));

    const service = new ChannelGroupService();
    await expect(
      service.moveChannel(
        { channelId: "channel-1", groupId: "group-1", position: 0 },
        "user",
        "user-1",
      ),
    ).rejects.toThrow("Not found");

    expect(prismaMock.channel.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: "channel-1",
        OR: [
          { visibility: "public" },
          { ownerId: "user-1" },
          { members: { some: { userId: "user-1", leftAt: null } } },
        ],
      },
      select: { organizationId: true },
    });
    expect(assertActorOrgAccess).not.toHaveBeenCalled();
    expect(prismaMock.channel.update).not.toHaveBeenCalled();
  });

  it("requires all reordered channels to be visible", async () => {
    prismaMock.channel.findMany.mockResolvedValueOnce([
      { id: "channel-1", organizationId: "org-1" },
    ]);

    const service = new ChannelGroupService();
    await expect(
      service.reorderChannels(null, ["channel-1", "channel-2"], "user", "user-1"),
    ).rejects.toThrow("Channel not found");

    expect(prismaMock.channel.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["channel-1", "channel-2"] },
        OR: [
          { visibility: "public" },
          { ownerId: "user-1" },
          { members: { some: { userId: "user-1", leftAt: null } } },
        ],
      },
      select: { id: true, organizationId: true },
    });
    expect(assertActorOrgAccess).not.toHaveBeenCalled();
    expect(prismaMock.channel.update).not.toHaveBeenCalled();
  });
});
