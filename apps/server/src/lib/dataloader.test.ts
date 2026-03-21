import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "./db.js";
import { createUserLoader } from "./dataloader.js";

const prismaMock = prisma as any;

describe("createUserLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads users in input order and fills gaps with null", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u2", name: "Bob", avatarUrl: null },
      { id: "u1", name: "Alice", avatarUrl: "a.png" },
    ]);

    const loader = createUserLoader();

    await expect(loader.loadMany(["u1", "u3", "u2"])).resolves.toEqual([
      { id: "u1", name: "Alice", avatarUrl: "a.png" },
      null,
      { id: "u2", name: "Bob", avatarUrl: null },
    ]);
  });
});
