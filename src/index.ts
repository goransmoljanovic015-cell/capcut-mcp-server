#!/usr/bin/env node
/**
 * capcut-mcp-server
 *
 * MCP server that lets Claude drive CapCut/Jianying video editing — creating
 * drafts, adding text/video/audio/image/subtitle tracks, effects, stickers,
 * and keyframe animations, then saving a draft CapCut can open.
 *
 * IMPORTANT: CapCut itself has no public API. This server is a thin MCP
 * wrapper around the local HTTP backend provided by the open-source
 * VectCutAPI project (https://github.com/sun-guannan/VectCutAPI). That
 * backend (`capcut_server.py`) must be running locally — see README.md.
 *
 * Transport: stdio (local integration only).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { callCapCutApi, describeCapCutError } from "./capcutClient.js";
import { CHARACTER_LIMIT, API_BASE_URL } from "./constants.js";
import {
  CreateDraftSchema,
  AddTextSchema,
  AddVideoSchema,
  AddAudioSchema,
  AddImageSchema,
  AddSubtitleSchema,
  AddEffectSchema,
  AddStickerSchema,
  AddVideoKeyframeSchema,
  GetVideoDurationSchema,
  SaveDraftSchema
} from "./schemas.js";

const server = new McpServer({
  name: "capcut-mcp-server",
  version: "1.0.0"
});

/**
 * Turn a Zod-validated params object into the flat JSON body the VectCutAPI
 * HTTP backend expects: drop undefined fields, and splice `extra_params`
 * (our passthrough escape hatch) into the top level.
 */
function buildRequestBody(params: Record<string, unknown>): Record<string, unknown> {
  const { extra_params, ...rest } = params as { extra_params?: Record<string, unknown> } & Record<string, unknown>;
  const body: Record<string, unknown> = { ...rest, ...(extra_params ?? {}) };
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }
  return body;
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n[Response truncated at ${CHARACTER_LIMIT} characters. Ask a more specific follow-up if you need the rest.]`
  );
}

/**
 * Shared registration helper: every CapCut tool follows the same pattern
 * (validate -> POST to VectCutAPI endpoint -> return JSON + structuredContent),
 * so tool-specific code only needs to supply the schema, description, and
 * annotations.
 */
function registerCapCutTool(
  name: string,
  endpoint: string,
  title: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  }
) {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: (inputSchema as any).shape ?? inputSchema,
      annotations
    },
    async (params: Record<string, unknown>) => {
      try {
        const body = buildRequestBody(params);
        const data = await callCapCutApi(endpoint, body);

        if (data?.success === false) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error: CapCut API backend reported failure for '${name}': ${data.error ?? data.message ?? JSON.stringify(data)}`
              }
            ]
          };
        }

        const text = truncate(JSON.stringify(data, null, 2));
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: data as Record<string, unknown>
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: describeCapCutError(error, endpoint) }]
        };
      }
    }
  );
}

registerCapCutTool(
  "capcut_create_draft",
  "create_draft",
  "Create CapCut Draft",
  `Create a new CapCut/Jianying video draft (project). This must be called first — every other capcut_* tool needs the draft_id it returns.

Args:
  - width (number): Canvas width in pixels. Default 1080.
  - height (number): Canvas height in pixels. Default 1920 (portrait). Use 1920x1080 for landscape.

Returns: JSON including result.draft_id (string) — pass this to all subsequent add_*/save_draft calls.

Example: Use when starting any new video project, e.g. "make a 9:16 short" -> width=1080, height=1920.`,
  CreateDraftSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_add_text",
  "add_text",
  "Add Text to CapCut Draft",
  `Add a text element (title, caption, lower-third, etc.) to an existing draft's timeline.

Args:
  - draft_id (string, required): From capcut_create_draft.
  - text (string, required): The text content.
  - start/end (number, seconds): Time range the text is visible.
  - font, font_size, font_color: Basic styling.
  - shadow_enabled/shadow_color/shadow_alpha: Drop shadow.
  - background_color/background_alpha/background_round_radius: Background panel behind the text.
  - text_styles: Array of {start, end, font_color} for multi-color segments within the same text block.
  - extra_params: Any additional VectCutAPI field not modeled above.

Returns: JSON confirming the text element was added, including which optional features were used.

Don't use when: you need burned-in subtitles from an SRT file — use capcut_add_subtitle instead.`,
  AddTextSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_add_video",
  "add_video",
  "Add Video Track to CapCut Draft",
  `Add a video clip to an existing draft's timeline (e.g. as background footage or B-roll).

Args:
  - draft_id (string, required): From capcut_create_draft.
  - video_url (string, required): URL or local path (as supported by the backend) of the source video.
  - start/end (number, seconds): Placement on the timeline.
  - volume (number): Playback volume multiplier, 1.0 = original.
  - transition (string): Named transition, e.g. 'fade_in'.
  - transform_x/transform_y, scale_x/scale_y: Position and scale.
  - extra_params: Any additional VectCutAPI field not modeled above.

Returns: JSON confirming the video clip was added to the timeline.`,
  AddVideoSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_add_audio",
  "add_audio",
  "Add Audio Track to CapCut Draft",
  `Add an audio clip (music, voiceover, sound effect) to an existing draft's timeline.

Args:
  - draft_id (string, required): From capcut_create_draft.
  - audio_url (string, required): URL or local path of the source audio.
  - start (number, seconds): Placement on the timeline. end is optional (defaults to full clip length).
  - volume (number): Playback volume multiplier, 1.0 = original.
  - speed (number): Playback speed multiplier, 1.0 = original.
  - effects (string[]): Named audio effects, e.g. ['echo', 'denoise'].
  - extra_params: Any additional VectCutAPI field not modeled above.

Returns: JSON confirming the audio clip was added to the timeline.`,
  AddAudioSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_add_image",
  "add_image",
  "Add Image Asset to CapCut Draft",
  `Add a static image (photo, graphic, generated art) to an existing draft's timeline.

Args:
  - draft_id (string, required): From capcut_create_draft.
  - image_url (string, required): URL or local path of the source image.
  - start/end (number, seconds): Placement on the timeline.
  - transform_x/transform_y, scale_x/scale_y: Position and scale.
  - animation (string): Named entrance/loop animation, e.g. 'zoom_in'.
  - transition (string): Named transition, e.g. 'fade_in'.
  - extra_params: Any additional VectCutAPI field not modeled above.

Returns: JSON confirming the image asset was added to the timeline.`,
  AddImageSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_add_subtitle",
  "add_subtitle",
  "Add SRT Subtitles to CapCut Draft",
  `Import an SRT subtitle file into an existing draft, applying consistent styling and timing.

Args:
  - draft_id (string, required): From capcut_create_draft.
  - srt_path (string, required): Path or URL to the .srt file.
  - font_style (string): Named font style preset.
  - position (string): Named position preset, e.g. 'bottom_center'.
  - extra_params: Any additional VectCutAPI field not modeled above.

Returns: JSON confirming the subtitle track was added.

Don't use when: you only need a single one-off text overlay — use capcut_add_text instead.`,
  AddSubtitleSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_add_effect",
  "add_effect",
  "Add Visual Effect to CapCut Draft",
  `Apply a visual effect or filter to an existing draft over a given time range.

Args:
  - draft_id (string, required): From capcut_create_draft.
  - effect_type (string, required): Effect/filter identifier.
  - start (number, seconds), end or duration: Time range the effect is active.
  - parameters (object): Effect-specific parameters (varies by effect_type).
  - extra_params: Any additional VectCutAPI field not modeled above.

Returns: JSON confirming the effect was added.`,
  AddEffectSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_add_sticker",
  "add_sticker",
  "Add Sticker to CapCut Draft",
  `Place a sticker asset on an existing draft's timeline.

Args:
  - draft_id (string, required): From capcut_create_draft.
  - resource_id (string, required): ID of the sticker resource.
  - start (number, seconds), end (optional): Time range the sticker is visible.
  - position_x/position_y, scale, rotation: Placement and transform.
  - extra_params: Any additional VectCutAPI field not modeled above.

Returns: JSON confirming the sticker was added.`,
  AddStickerSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_add_video_keyframe",
  "add_video_keyframe",
  "Add Keyframe Animation to CapCut Draft",
  `Add property keyframes (scale, position, rotation, opacity, ...) to an existing track for animation.

Args:
  - draft_id (string, required): From capcut_create_draft.
  - track_name (string, required): Name of the track to animate.
  - property_types (string[], required): Properties to animate, e.g. ['scale_x', 'scale_y', 'alpha'].
  - times (number[], required): Keyframe timestamps in seconds — same length as values.
  - values (string[], required): Keyframe values matching each timestamp.
  - extra_params: Any additional VectCutAPI field not modeled above.

Returns: JSON confirming the keyframes were added.

Example: animate a zoom-in — property_types=['scale_x','scale_y'], times=[0,2], values=['1.0','1.5'].`,
  AddVideoKeyframeSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
);

registerCapCutTool(
  "capcut_get_video_duration",
  "get_video_duration",
  "Get Video Duration",
  `Probe a video file/URL and return its duration in seconds, without modifying any draft. Useful before calling capcut_add_video to pick sensible start/end values.

Args:
  - video_url (string, required): URL or local path of the video to inspect.

Returns: JSON including the duration in seconds.`,
  GetVideoDurationSchema,
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
);

registerCapCutTool(
  "capcut_save_draft",
  "save_draft",
  "Save CapCut Draft",
  `Save/finalize a draft so it can be opened in CapCut/Jianying. Call this last, after adding all desired tracks/effects.

Args:
  - draft_id (string, required): From capcut_create_draft.

Returns: JSON including result.draft_url and/or the local draft folder path. Per VectCutAPI docs, saving generates a folder starting with 'dfd_' next to capcut_server.py — copy it into your CapCut/Jianying drafts directory to open it in the app.

Note: safe to call multiple times on the same draft_id (re-saves with current state).`,
  SaveDraftSchema,
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`capcut-mcp-server running via stdio (backend: ${API_BASE_URL})`);
}

main().catch((error) => {
  console.error("Fatal error starting capcut-mcp-server:", error);
  process.exit(1);
});
