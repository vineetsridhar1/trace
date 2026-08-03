import { gzipSync } from "zlib";
import tar from "tar-stream";
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

async function planArchive(): Promise<Buffer> {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  pack.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    pack.on("end", () => resolve(gzipSync(Buffer.concat(chunks))));
    pack.on("error", reject);
  });
  pack.entry({ name: "plan.html" }, "<!doctype html><html><body>Plan</body></html>");
  pack.finalize();
  return finished;
}

const createInput = {
  organizationId: "org-1",
  sessionId: "session-1",
  invocationId: "invocation-1",
  type: "visual-plan",
  key: "primary",
  idempotencyKey: "invocation-1:visual-plan:primary",
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

  it("removes the uploaded bundle when the database transaction fails", async () => {
    asMock(prisma.artifact.create).mockRejectedValue(new Error("database unavailable"));

    await expect(
      artifactService.create({ ...createInput, archive: await planArchive() }),
    ).rejects.toThrow("database unavailable");

    const uploadedKey = asMock(storage.putObject).mock.calls[0]?.[0];
    expect(storage.deleteObject).toHaveBeenCalledWith(uploadedKey);
  });

  it("returns the winner of a concurrent idempotent create and removes its unused upload", async () => {
    const winner = {
      id: "artifact-winner",
      ...createInput,
      type: "trace.visual-plan.v1",
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

    const result = await artifactService.create({ ...createInput, archive: await planArchive() });

    expect(result.id).toBe("artifact-winner");
    const uploadedKey = asMock(storage.putObject).mock.calls[0]?.[0];
    expect(storage.deleteObject).toHaveBeenCalledWith(uploadedKey);
  });
});
