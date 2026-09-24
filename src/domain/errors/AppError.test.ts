import { describe, it, expect } from "vitest";
import { AppError, toAppError } from "@domain/errors/AppError";

describe("toAppError", () => {
  it("passes an existing AppError through unchanged", () => {
    const original = new AppError("network", "Can't reach the server.");
    expect(toAppError(original)).toBe(original);
  });

  it("recognizes a fetch TypeError as a network error with a clear message", () => {
    const err = new TypeError("Failed to fetch");
    const result = toAppError(err);
    expect(result.code).toBe("network");
    expect(result.message).toMatch(/internet connection/i);
  });

  it("wraps a plain Error, keeping its message", () => {
    const err = new Error("Unexpected token in JSON");
    const result = toAppError(err);
    expect(result.code).toBe("unknown");
    expect(result.message).toBe("Unexpected token in JSON");
  });

  it("falls back to the default message for a non-Error thrown value", () => {
    const result = toAppError("just a string", "Fallback message.");
    expect(result.code).toBe("unknown");
    expect(result.message).toBe("Fallback message.");
  });

  it("falls back to the default message when an Error has no message", () => {
    const result = toAppError(new Error(""), "Fallback message.");
    expect(result.message).toBe("Fallback message.");
  });
});
