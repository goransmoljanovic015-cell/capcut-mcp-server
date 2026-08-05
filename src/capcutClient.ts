/**
 * Thin HTTP client for the local VectCutAPI / CapCut API backend.
 *
 * Every tool in this server ultimately POSTs a JSON body to
 * `${API_BASE_URL}/{endpoint}` and returns the JSON response. This module
 * centralizes that call plus consistent, actionable error handling so
 * individual tools stay focused on schema definition.
 */

import axios, { AxiosError } from "axios";
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "./constants.js";

export interface CapCutApiResponse<T = Record<string, unknown>> {
  success?: boolean;
  result?: T;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export async function callCapCutApi<T = Record<string, unknown>>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<CapCutApiResponse<T>> {
  const response = await axios.post<CapCutApiResponse<T>>(
    `${API_BASE_URL}/${endpoint}`,
    body,
    {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );
  return response.data;
}

/**
 * Convert any error thrown by callCapCutApi into a clear, actionable message
 * for the model — including the most common failure mode (the local
 * VectCutAPI backend isn't running).
 */
export function describeCapCutError(error: unknown, endpoint: string): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ error?: string; message?: string }>;

    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      return (
        `Error: Could not reach the CapCut API backend at ${API_BASE_URL} while calling '${endpoint}'. ` +
        `This MCP server only talks to CapCut through a local VectCutAPI HTTP server — start it first with ` +
        `'python capcut_server.py' (see README.md for setup), then retry.`
      );
    }

    if (err.code === "ECONNABORTED") {
      return (
        `Error: Request to '${endpoint}' timed out after ${REQUEST_TIMEOUT_MS / 1000}s. ` +
        `Large media files can take longer to probe/process — check the capcut_server.py console for progress, or retry.`
      );
    }

    if (err.response) {
      const data = err.response.data;
      const detail = data?.error || data?.message || JSON.stringify(data);
      return `Error: CapCut API backend returned HTTP ${err.response.status} for '${endpoint}': ${detail}`;
    }

    return `Error: Network error calling '${endpoint}': ${err.message}`;
  }

  return `Error: Unexpected error calling '${endpoint}': ${error instanceof Error ? error.message : String(error)}`;
}
