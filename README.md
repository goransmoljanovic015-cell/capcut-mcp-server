# capcut-mcp-server

[![GitHub repo](https://img.shields.io/badge/GitHub-capcut--mcp--server-181717?logo=github)](https://github.com/goransmoljanovic015-cell/capcut-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A local MCP (Model Context Protocol) server that lets Claude drive CapCut/Jianying
video editing — create a draft, add text/video/audio/image tracks, subtitles,
effects, stickers, and keyframe animations, then save a draft file CapCut can open.

## How this actually works (read this first)

**CapCut has no public API.** This server does not talk to the CapCut app directly.
It's a thin wrapper around the local HTTP backend from the open-source
[VectCutAPI](https://github.com/sun-guannan/VectCutAPI) project, which generates
CapCut/Jianying draft files that you then copy into CapCut's drafts folder.

That means there are two things running for this to work:

```
Claude  <--stdio-->  capcut-mcp-server (this project)  <--HTTP-->  VectCutAPI's capcut_server.py
```

You must set up and run VectCutAPI's Python backend yourself — this project does
not include or install it.

## 1. Set up the VectCutAPI backend (prerequisite)

```bash
git clone https://github.com/sun-guannan/VectCutAPI.git
cd VectCutAPI
python -m venv venv-capcut
source venv-capcut/bin/activate      # Windows: venv-capcut\Scripts\activate
pip install -r requirements.txt
cp config.json.example config.json   # edit if needed

python capcut_server.py              # starts the HTTP API on http://127.0.0.1:9001
```

Leave this running in its own terminal. Requirements: Python 3.10+, FFmpeg, and
CapCut or Jianying installed (international CapCut works; the desktop app itself
is only needed to *open* the drafts this produces, not to generate them).

## 2. Build this server

```bash
npm install
npm run build
```

This produces `dist/index.js`, the stdio entry point.

## 3. Point it at your VectCutAPI backend

By default the server calls `http://127.0.0.1:9001`. Override with an env var if
you changed the port:

```bash
CAPCUT_API_URL=http://127.0.0.1:9001
```

## 4. Wire it into a client

**This is a local stdio server**, not a remote connector — it runs as a subprocess
of whatever client launches it, so it's added differently depending on where you
want to use it:

### Claude Desktop
Edit your `claude_desktop_config.json` (Settings → Developer → Edit Config) and add:

```json
{
  "mcpServers": {
    "capcut": {
      "command": "node",
      "args": ["/absolute/path/to/capcut-mcp-server/dist/index.js"],
      "env": { "CAPCUT_API_URL": "http://127.0.0.1:9001" }
    }
  }
}
```

Restart Claude Desktop afterward.

### Claude Code
```bash
claude mcp add capcut -- node /absolute/path/to/capcut-mcp-server/dist/index.js
```

### Cowork
Cowork's "Add custom connector" flow (Settings → Customize → Connectors) expects a
**remote** MCP server URL reachable from Anthropic's cloud — it can't launch a local
stdio subprocess on your machine. To use this server from Cowork you'd need to
deploy it (and the VectCutAPI backend) somewhere with a public HTTPS endpoint and
switch this server's transport to streamable HTTP. For local-only use, Claude
Desktop or Claude Code (above) are the supported paths.

## Available tools

| Tool | What it does |
|---|---|
| `capcut_create_draft` | Create a new draft (project). Call this first. |
| `capcut_add_text` | Add a text/title/caption element, with shadow, background panel, multi-style segments. |
| `capcut_add_video` | Add a video clip to the timeline. |
| `capcut_add_audio` | Add an audio clip (music, voiceover, SFX). |
| `capcut_add_image` | Add a static image asset. |
| `capcut_add_subtitle` | Import an SRT subtitle file. |
| `capcut_add_effect` | Apply a visual effect/filter over a time range. |
| `capcut_add_sticker` | Place a sticker asset. |
| `capcut_add_video_keyframe` | Add property keyframes (scale/position/rotation/alpha) for animation. |
| `capcut_get_video_duration` | Probe a video's duration (read-only). |
| `capcut_save_draft` | Save/finalize the draft. Call this last. |

Every `add_*` tool accepts an `extra_params` object as an escape hatch for any
VectCutAPI field not modeled explicitly in the typed schema — the underlying API
has more optional fields (nested transform/animation objects, etc.) than are fully
documented, so `extra_params` is merged directly into the request body.

## Typical workflow

1. `capcut_create_draft` → get `draft_id`
2. One or more `capcut_add_video` / `capcut_add_image` / `capcut_add_audio` /
   `capcut_add_text` / `capcut_add_subtitle` / `capcut_add_effect` /
   `capcut_add_sticker` / `capcut_add_video_keyframe` calls against that `draft_id`
3. `capcut_save_draft` → generates a `dfd_*` folder next to `capcut_server.py`
4. Copy that folder into your CapCut/Jianying drafts directory to open it in the app

## Troubleshooting

- **"Could not reach the CapCut API backend"** — `capcut_server.py` isn't running,
  or is running on a different port than `CAPCUT_API_URL` points to.
- **CapCut doesn't show the draft** — make sure you copied the generated `dfd_*`
  folder into CapCut's actual drafts directory (not just left it next to
  `capcut_server.py`).
- **A field you need isn't in the schema** — pass it via `extra_params`; check
  VectCutAPI's `example.py` for the exact field name the backend expects.

## Development

```bash
npm run dev     # tsx watch — rebuild/rerun on save
npm run build   # tsc compile to dist/
npm run clean   # remove dist/
```
