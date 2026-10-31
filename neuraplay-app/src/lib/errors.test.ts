import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

const axiosErrorWith = (data: unknown, status = 400): AxiosError => {
  const response = { data, status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } } as AxiosResponse;
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, response);
};

describe("getErrorMessage", () => {
  it("uses DRF's detail message", () => {
    expect(getErrorMessage(axiosErrorWith({ detail: "No active account found" }, 401))).toBe("No active account found");
  });

  it("joins field errors with readable field names", () => {
    const message = getErrorMessage(axiosErrorWith({
      email: ["An account with this email already exists."],
      password_confirm: "Passwords do not match.",
    }));
    expect(message).toBe("email: An account with this email already exists.\npassword confirm: Passwords do not match.");
  });

  it("shows non_field_errors without a prefix", () => {
    expect(getErrorMessage(axiosErrorWith({ non_field_errors: ["Bad credentials"] }))).toBe("Bad credentials");
  });

  it("falls back for HTML error pages and non-Axios errors", () => {
    expect(getErrorMessage(axiosErrorWith("<html>500</html>", 500), "fallback")).toBe("fallback");
    expect(getErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
