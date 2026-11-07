import { describe, expect, it } from "vitest";
import { toAuthFailure } from "@infrastructure/supabase/SupabaseAuthGateway";

describe("toAuthFailure", () => {
  it.each([
    [{ code: "invalid_credentials" }, "invalid_credentials"],
    [{ code: "user_already_exists" }, "email_taken"],
    [{ code: "email_exists" }, "email_taken"],
    [{ code: "weak_password" }, "weak_password"],
    [{ code: "over_email_send_rate_limit" }, "rate_limited"],
    [{ name: "AuthRetryableFetchError" }, "network"],
    [new TypeError("Failed to fetch"), "network"],
    [{ code: "something_new" }, "unknown"],
    [undefined, "unknown"],
  ])("maps %j to %s", (error, failure) => {
    expect(toAuthFailure(error)).toBe(failure);
  });
});
