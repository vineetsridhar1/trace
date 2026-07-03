import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SERVER_URL,
  clearToken,
  configDir,
  configPath,
  credentialsPath,
  getConfigValue,
  getToken,
  removeConfigValue,
  resolveServerUrl,
  setConfigValue,
  setServerUrl,
  setToken,
} from "./config.js";

let testConfigHome: string;

beforeEach(() => {
  testConfigHome = mkdtempSync(join(tmpdir(), "trace-cli-test-"));
  process.env.XDG_CONFIG_HOME = testConfigHome;
  delete process.env.TRACE_SERVER;
  delete process.env.TRACE_TOKEN;
});

afterEach(() => {
  rmSync(testConfigHome, { recursive: true, force: true });
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.TRACE_SERVER;
  delete process.env.TRACE_TOKEN;
});

describe("configDir", () => {
  it("respects XDG_CONFIG_HOME", () => {
    expect(configDir()).toBe(join(testConfigHome, "trace"));
  });
});

describe("config values", () => {
  it("returns null for unset keys without creating files", () => {
    expect(getConfigValue("missing")).toBeNull();
    expect(existsSync(configPath())).toBe(false);
  });

  it("round-trips set, get, and remove", () => {
    setConfigValue("server_url", "https://example.com");
    expect(getConfigValue("server_url")).toBe("https://example.com");

    removeConfigValue("server_url");
    expect(getConfigValue("server_url")).toBeNull();
  });

  it("preserves other keys on write", () => {
    setConfigValue("a", "1");
    setConfigValue("b", "2");
    removeConfigValue("a");
    expect(getConfigValue("b")).toBe("2");
  });

  it("treats a corrupt config file as empty", () => {
    setConfigValue("a", "1");
    writeFileSync(configPath(), "not json");
    expect(getConfigValue("a")).toBeNull();
  });
});

describe("resolveServerUrl", () => {
  it("falls back to the default", () => {
    expect(resolveServerUrl()).toBe(DEFAULT_SERVER_URL);
  });

  it("reads the stored config value", () => {
    setServerUrl("https://stored.example.com");
    expect(resolveServerUrl()).toBe("https://stored.example.com");
  });

  it("prefers TRACE_SERVER over the stored value", () => {
    setServerUrl("https://stored.example.com");
    process.env.TRACE_SERVER = "https://env.example.com";
    expect(resolveServerUrl()).toBe("https://env.example.com");
  });

  it("prefers an explicit override over TRACE_SERVER", () => {
    process.env.TRACE_SERVER = "https://env.example.com";
    expect(resolveServerUrl("https://flag.example.com")).toBe("https://flag.example.com");
  });
});

describe("token storage", () => {
  it("returns null when no token is stored", () => {
    expect(getToken()).toBeNull();
    expect(existsSync(credentialsPath())).toBe(false);
  });

  it("stores the token with 0600 permissions", () => {
    setToken("secret");
    expect(getToken()).toBe("secret");
    expect(statSync(credentialsPath()).mode & 0o777).toBe(0o600);
  });

  it("re-applies 0600 permissions when overwriting an existing file", () => {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(credentialsPath(), "{}", { mode: 0o644 });
    setToken("secret");
    expect(statSync(credentialsPath()).mode & 0o777).toBe(0o600);
  });

  it("prefers TRACE_TOKEN over the stored token", () => {
    setToken("stored");
    process.env.TRACE_TOKEN = "from-env";
    expect(getToken()).toBe("from-env");
  });

  it("clears the stored token", () => {
    setToken("secret");
    clearToken();
    expect(getToken()).toBeNull();
    expect(existsSync(credentialsPath())).toBe(false);
  });

  it("is a no-op to clear when nothing is stored", () => {
    expect(() => clearToken()).not.toThrow();
  });
});
