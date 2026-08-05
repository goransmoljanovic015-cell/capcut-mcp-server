/**
 * Shared constants for the CapCut MCP server.
 */

// The CapCut MCP server does NOT talk to CapCut directly (CapCut has no public
// API). Instead it talks to a local HTTP backend provided by the open-source
// VectCutAPI project (https://github.com/sun-guannan/VectCutAPI), which must
// be running separately (`python capcut_server.py`, default port 9001) before
// any tool in this server will work. See README.md for setup instructions.
export const API_BASE_URL = process.env.CAPCUT_API_URL || "http://127.0.0.1:9001";

// Trim very large tool responses (e.g. draft JSON dumps) so we don't flood
// the model's context window.
export const CHARACTER_LIMIT = 25000;

// Timeout for calls to the local CapCut API backend. Draft creation and
// media processing (video/audio duration probing, effect rendering) can be
// slow on large files, so this is generous compared to a typical web API.
export const REQUEST_TIMEOUT_MS = 60_000;
