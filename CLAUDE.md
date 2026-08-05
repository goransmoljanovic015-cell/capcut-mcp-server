# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local MCP (Model Context Protocol) stdio server, written in TypeScript, that exposes CapCut/Jianying
video-editing operations as tools. It does **not** talk to CapCut directly — CapCut has no public API.
Instead it's a thin HTTP client wrapper around [VectCutAPI](https://github.com/sun-guannan/VectCutAPI)'s
`capcut_server.py`, a separately-run Python backend that generates CapCut/Jianying draft folders.

```
Claude  <--stdio-->  this server (src/index.ts)  <--HTTP-->  VectCutAPI's capcut_server.py (127.0.0.1:9001)
```

The Python backend is an external prerequisite, not part of this repo — it must be cloned and run
separately (see README.md) before any tool call here will succeed.

## Commands

```bash
npm install
npm run build   # tsc compile src/ -> dist/ (dist/index.js is the stdio entry point)
npm run dev      # tsx watch src/index.ts -- rebuild/rerun on save
npm run clean    # rm -rf dist
npm start        # node dist/index.js (run the built server directly)
```

There is no test suite or lint script configured. `tsc` (via `npm run build`) is the only
correctness check — it runs with `strict: true`.

To actually exercise the server, the VectCutAPI Python backend must be running first
(`python capcut_server.py`, default `http://127.0.0.1:9001`), and this server needs to be wired
into an MCP client (Claude Desktop config, or `claude mcp add capcut -- node dist/index.js`).
Override the backend URL with the `CAPCUT_API_URL` env var.

## Architecture

Three files, one pattern:

- **`src/constants.ts`** — `API_BASE_URL` (from `CAPCUT_API_URL` env var, defaults to
  `http://127.0.0.1:9001`), `CHARACTER_LIMIT` (25000, truncates large tool responses),
  `REQUEST_TIMEOUT_MS` (60s, generous because media probing/processing is slow).

- **`src/schemas.ts`** — one Zod `.strict()` object schema per tool. The VectCutAPI backend accepts
  more optional/undocumented fields per endpoint than are worth hand-modeling, so every schema
  models the well-documented common fields explicitly and adds an `extra_params: z.record(...)`
  passthrough field for anything else. Adding a new field to a tool means adding it to the
  matching schema here — don't route new fields through `extra_params` if they're common enough
  to document.

- **`src/capcutClient.ts`** — `callCapCutApi(endpoint, body)` POSTs JSON to
  `${API_BASE_URL}/{endpoint}` and returns the parsed response. `describeCapCutError(error, endpoint)`
  turns axios errors into actionable messages for the model, special-casing connection-refused
  (backend not running) and timeout — this is the main UX seam when the backend isn't reachable.

- **`src/index.ts`** — registers one MCP tool per CapCut operation via `registerCapCutTool(name,
  endpoint, title, description, inputSchema, annotations)`, a shared helper that: validates via the
  Zod schema, calls `buildRequestBody()` to flatten `extra_params` into the top-level body and drop
  `undefined` keys, POSTs via `callCapCutApi`, and returns both `content` (truncated JSON text) and
  `structuredContent`. Adding a new CapCut tool means: add a schema in `schemas.ts`, then one
  `registerCapCutTool(...)` call in `index.ts` — the request/response/error handling is already
  shared.

### Tool set and workflow

`capcut_create_draft` → `draft_id`, then any number of `capcut_add_text` / `capcut_add_video` /
`capcut_add_audio` / `capcut_add_image` / `capcut_add_subtitle` / `capcut_add_effect` /
`capcut_add_sticker` / `capcut_add_video_keyframe` calls against that `draft_id`, then
`capcut_save_draft` to finalize (generates a `dfd_*` folder next to `capcut_server.py`, which the
user copies into their CapCut/Jianying drafts directory). `capcut_get_video_duration` is a read-only
helper for picking `start`/`end` values before adding a video clip.

Every tool's `annotations` mark it `openWorldHint: true` (talks to an external local service) and
`idempotentHint: false` except `capcut_get_video_duration` (read-only, idempotent) and
`capcut_save_draft` (idempotent — re-saving is safe).
