import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExpireSuggestions = vi.fn().mockResolvedValue([]);
const mockCleanupOldRecords = vi.fn().mockResolvedValue(0);
const mockCleanupSuggestionRates = vi.fn();

vi.mock("../services/inbox.js", () => ({
  inboxService: {
    expireSuggestions: (...args: unknown[]) => mockExpireSuggestions(...args),
  },
}));

vi.mock("../services/processed-event.js", () => ({
  processedEventService: {
    cleanupOldRecords: (...args: unknown[]) => mockCleanupOldRecords(...args),
  },
}));

vi.mock("./policy-engine.js", () => ({
  cleanupSuggestionRates: (...args: unknown[]) => mockCleanupSuggestionRates(...args),
}));

import {
  startSuggestionExpiryWorker,
  stopSuggestionExpiryWorker,
} from "./suggestion-expiry.js";

describe("suggestion-expiry worker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopSuggestionExpiryWorker();
    vi.useRealTimers();
  });

  it("runs suggestion expiry and rate cleanup every minute", async () => {
    startSuggestionExpiryWorker();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockExpireSuggestions).toHaveBeenCalledOnce();
    expect(mockCleanupSuggestionRates).toHaveBeenCalledOnce();
    expect(mockCleanupOldRecords).not.toHaveBeenCalled();
  });

  it("runs processed-event cleanup every 15 cycles", async () => {
    startSuggestionExpiryWorker();

    await vi.advanceTimersByTimeAsync(15 * 60_000);

    expect(mockExpireSuggestions).toHaveBeenCalledTimes(15);
    expect(mockCleanupSuggestionRates).toHaveBeenCalledTimes(15);
    expect(mockCleanupOldRecords).toHaveBeenCalledOnce();
    expect(mockCleanupOldRecords).toHaveBeenCalledWith(7 * 24 * 60 * 60 * 1000);
  });
});
