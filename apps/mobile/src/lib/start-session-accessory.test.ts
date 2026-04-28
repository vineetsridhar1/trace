import { describe, expect, it } from "vitest";
import { getStartSessionAccessoryTarget } from "./start-session-accessory";

describe("getStartSessionAccessoryTarget", () => {
  it("detects the channel list route", () => {
    expect(getStartSessionAccessoryTarget("/channels")).toEqual({ kind: "channel_list" });
    expect(getStartSessionAccessoryTarget("/channels/")).toEqual({ kind: "channel_list" });
  });

  it("extracts a channel id from channel-scoped routes", () => {
    expect(getStartSessionAccessoryTarget("/channels/channel_1")).toEqual({
      kind: "channel",
      channelId: "channel_1",
    });
    expect(getStartSessionAccessoryTarget("/channels/channel%201/merged-archived")).toEqual({
      kind: "channel",
      channelId: "channel 1",
    });
  });

  it("treats non-channel routes as elsewhere", () => {
    expect(getStartSessionAccessoryTarget("/")).toEqual({ kind: "elsewhere" });
    expect(getStartSessionAccessoryTarget("/sessions/group_1/session_1")).toEqual({
      kind: "elsewhere",
    });
  });
});
