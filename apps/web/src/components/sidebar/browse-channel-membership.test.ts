import { describe, expect, it } from "vitest";
import { updateBrowseChannelMembership, type BrowseChannel } from "./browse-channel-membership";

const channels: BrowseChannel[] = [
  {
    id: "channel-1",
    name: "Platform",
    type: "coding",
    visibility: "public",
    memberCount: 3,
    viewerIsMember: false,
  },
  {
    id: "channel-2",
    name: "Design",
    type: "coding",
    visibility: "private",
    memberCount: 1,
    viewerIsMember: true,
  },
];

describe("updateBrowseChannelMembership", () => {
  it("updates only the affected channel when joining", () => {
    const updated = updateBrowseChannelMembership(channels, "channel-1", true);

    expect(updated).toEqual([
      { ...channels[0], viewerIsMember: true, memberCount: 4 },
      channels[1],
    ]);
  });

  it("updates only the affected channel when leaving without a negative member count", () => {
    const updated = updateBrowseChannelMembership(
      [{ ...channels[0], memberCount: 0, viewerIsMember: true }],
      "channel-1",
      false,
    );

    expect(updated).toEqual([{ ...channels[0], memberCount: 0, viewerIsMember: false }]);
  });
});
