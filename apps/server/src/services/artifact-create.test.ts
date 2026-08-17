import { gzipSync } from "zlib";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
    publishCreated: vi.fn(),
  },
}));

vi.mock("./session.js", () => ({ sessionService: {} }));

import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { asMock } from "../../test/helpers.js";
import { artifactService } from "./artifact.js";

function videoArchive(): Buffer {
  const body = Buffer.from("video");
  const header = Buffer.alloc(512);
  header.write("browser-proof.webm", 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = [...header].reduce((sum, value) => sum + value, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return gzipSync(Buffer.concat([header, body, Buffer.alloc(507), Buffer.alloc(1024)]));
}

const createInput = {
  organizationId: "org-1",
  sessionId: "session-1",
  invocationId: "invocation-1",
  type: "video",
  key: "browser-proof",
  idempotencyKey: "invocation-1:video:browser-proof",
};

describe("ArtifactService.create storage lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(prisma.artifact.findUnique).mockResolvedValue(null);
    asMock(prisma.session.findFirst).mockResolvedValue({
      id: "session-1",
      name: "Plan session",
      createdById: "user-1",
      sessionGroupId: "group-1",
    } as never);
  });

  it("stores a validated browser video and emits its artifact event", async () => {
    const created = {
      id: "artifact-video",
      ...createInput,
      type: "trace.video.v1",
      manifest: {
        schemaVersion: 1,
        files: [{ path: "browser-proof.webm", mediaType: "video/webm", size: 5 }],
      },
    };
    asMock(prisma.artifact.create).mockResolvedValue(created as never);

    const result = await artifactService.create({ ...createInput, archive: videoArchive() });

    expect(result.id).toBe("artifact-video");
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringContaining("artifacts/org-1/"),
      expect.any(Buffer),
      "application/gzip",
      { ifAbsent: true },
    );
    const { eventService } = await import("./event.js");
    expect(eventService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "artifact_created",
        payload: expect.objectContaining({ artifact: created }),
      }),
      prisma,
    );
    expect(eventService.publishCreated).toHaveBeenCalled();
  });

  it("removes the uploaded bundle when the database transaction fails", async () => {
    asMock(prisma.artifact.create).mockRejectedValue(new Error("database unavailable"));

    await expect(
      artifactService.create({ ...createInput, archive: videoArchive() }),
    ).rejects.toThrow("database unavailable");

    const uploadedKey = asMock(storage.putObject).mock.calls[0]?.[0];
    expect(storage.deleteObject).toHaveBeenCalledWith(uploadedKey);
  });

  it("returns the winner of a concurrent idempotent create and removes its unused upload", async () => {
    const winner = {
      id: "artifact-winner",
      ...createInput,
      type: "trace.video.v1",
    };
    asMock(prisma.artifact.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "6.19.2",
      }),
    );
    asMock(prisma.artifact.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner as never);

    const result = await artifactService.create({ ...createInput, archive: videoArchive() });

    expect(result.id).toBe("artifact-winner");
    const uploadedKey = asMock(storage.putObject).mock.calls[0]?.[0];
    expect(storage.deleteObject).toHaveBeenCalledWith(uploadedKey);
  });

  it("does not replay an artifact after its invocation is no longer active", async () => {
    asMock(prisma.session.findFirst).mockResolvedValueOnce(null);
    asMock(prisma.artifact.findUnique).mockResolvedValueOnce({
      id: "artifact-1",
      ...createInput,
      type: "trace.video.v1",
    } as never);

    await expect(
      artifactService.create({ ...createInput, archive: videoArchive() }),
    ).rejects.toThrow("invocation is no longer active");
    expect(prisma.artifact.findUnique).not.toHaveBeenCalled();
  });
});
