import { describe, expect, it } from "vitest";
import { reviewJson } from "./review.js";

describe("reviewJson", () => {
  it("serializes Prisma bigint fields for review event payloads", () => {
    expect(
      reviewJson({
        review: {
          attachedSession: {
            inputTokens: 12n,
            outputTokens: 34n,
          },
        },
      }),
    ).toEqual({
      review: {
        attachedSession: {
          inputTokens: 12,
          outputTokens: 34,
        },
      },
    });
  });
});
