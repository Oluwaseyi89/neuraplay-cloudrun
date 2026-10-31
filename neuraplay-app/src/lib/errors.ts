import axios from "axios";

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

/** Turn a DRF error response into a readable message */
export const getErrorMessage = (error: unknown, fallback = DEFAULT_MESSAGE): string => {
  if (!axios.isAxiosError(error)) return fallback;

  const data = error.response?.data;
  if (!data) return error.message || fallback;
  if (typeof data !== "object") return fallback;
  if (data.detail) return String(data.detail);
  if (data.error) return String(data.error);

  const messages = Object.entries(data).map(([field, value]) => {
    const text = Array.isArray(value) ? value.join(" ") : String(value);
    return field === "non_field_errors" ? text : `${field.replace(/_/g, " ")}: ${text}`;
  });
  return messages.length ? messages.join("\n") : fallback;
};
