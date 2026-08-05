/**
 * Zod input schemas for every CapCut MCP tool.
 *
 * The underlying VectCutAPI HTTP backend accepts a fair number of optional,
 * loosely-documented fields per endpoint (transform/animation objects vary
 * by asset type, effect parameters vary by effect_type, etc). Rather than
 * guess at an exhaustive typed shape and silently drop fields the backend
 * actually supports, every schema below models the well-documented common
 * fields explicitly and exposes an `extra_params` escape hatch for anything
 * else — those are merged into the request body as-is.
 */

import { z } from "zod";

const extraParams = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Optional passthrough for advanced/undocumented VectCutAPI fields not modeled explicitly above " +
      "(e.g. nested transform/animation objects). Merged directly into the request body. " +
      "Check the VectCutAPI example.py / API docs if you need a field that isn't listed here."
  );

const draftId = z.string().min(1).describe("The draft_id returned by capcut_create_draft.");

export const CreateDraftSchema = z
  .object({
    width: z.number().int().positive().default(1080).describe("Canvas width in pixels (e.g. 1080 for portrait, 1920 for landscape)."),
    height: z.number().int().positive().default(1920).describe("Canvas height in pixels (e.g. 1920 for portrait, 1080 for landscape).")
  })
  .strict();

export const AddTextSchema = z
  .object({
    draft_id: draftId,
    text: z.string().min(1).describe("The text content to display."),
    start: z.number().min(0).default(0).describe("Start time in seconds within the timeline."),
    end: z.number().positive().describe("End time in seconds within the timeline."),
    font: z.string().optional().describe("Font family name (e.g. 'Source Han Sans')."),
    font_size: z.number().positive().optional().describe("Font size in points (default varies by backend, commonly ~48)."),
    font_color: z.string().optional().describe("Hex color for the text, e.g. '#FFFFFF'."),
    shadow_enabled: z.boolean().optional().describe("Whether to render a drop shadow behind the text."),
    shadow_color: z.string().optional().describe("Hex color for the shadow, e.g. '#000000'."),
    shadow_alpha: z.number().min(0).max(1).optional().describe("Shadow opacity, 0-1."),
    background_color: z.string().optional().describe("Hex color for a background panel behind the text."),
    background_alpha: z.number().min(0).max(1).optional().describe("Background panel opacity, 0-1."),
    background_round_radius: z.number().min(0).optional().describe("Corner radius (px) for the background panel."),
    transform_x: z.number().optional().describe("Horizontal position offset."),
    transform_y: z.number().optional().describe("Vertical position offset."),
    text_styles: z
      .array(
        z.object({
          start: z.number().min(0),
          end: z.number().positive(),
          font_color: z.string().optional()
        })
      )
      .optional()
      .describe("Per-segment style overrides for multi-color/multi-style text within the same text block."),
    extra_params: extraParams
  })
  .strict();

export const AddVideoSchema = z
  .object({
    draft_id: draftId,
    video_url: z.string().url().describe("Publicly reachable URL (or local file:// path supported by the backend) of the video to add."),
    start: z.number().min(0).default(0).describe("Start time in seconds within the timeline."),
    end: z.number().positive().describe("End time in seconds within the timeline."),
    volume: z.number().min(0).max(10).optional().describe("Playback volume multiplier (1.0 = original)."),
    transition: z.string().optional().describe("Named transition to apply, e.g. 'fade_in'."),
    transform_x: z.number().optional().describe("Horizontal position offset."),
    transform_y: z.number().optional().describe("Vertical position offset."),
    scale_x: z.number().positive().optional().describe("Horizontal scale factor (1.0 = original size)."),
    scale_y: z.number().positive().optional().describe("Vertical scale factor (1.0 = original size)."),
    extra_params: extraParams
  })
  .strict();

export const AddAudioSchema = z
  .object({
    draft_id: draftId,
    audio_url: z.string().url().describe("Publicly reachable URL (or local path supported by the backend) of the audio file to add."),
    start: z.number().min(0).default(0).describe("Start time in seconds within the timeline."),
    end: z.number().positive().optional().describe("End time in seconds within the timeline. Omit to use the full clip length."),
    volume: z.number().min(0).max(10).optional().describe("Playback volume multiplier (1.0 = original)."),
    speed: z.number().positive().optional().describe("Playback speed multiplier (1.0 = original)."),
    effects: z.array(z.string()).optional().describe("Named audio effects to apply, e.g. ['echo', 'denoise']."),
    extra_params: extraParams
  })
  .strict();

export const AddImageSchema = z
  .object({
    draft_id: draftId,
    image_url: z.string().url().describe("Publicly reachable URL (or local path supported by the backend) of the image to add."),
    start: z.number().min(0).default(0).describe("Start time in seconds within the timeline."),
    end: z.number().positive().describe("End time in seconds within the timeline."),
    transform_x: z.number().optional().describe("Horizontal position offset."),
    transform_y: z.number().optional().describe("Vertical position offset."),
    scale_x: z.number().positive().optional().describe("Horizontal scale factor (1.0 = original size)."),
    scale_y: z.number().positive().optional().describe("Vertical scale factor (1.0 = original size)."),
    animation: z.string().optional().describe("Named entrance/loop animation, e.g. 'zoom_in'."),
    transition: z.string().optional().describe("Named transition to apply, e.g. 'fade_in'."),
    extra_params: extraParams
  })
  .strict();

export const AddSubtitleSchema = z
  .object({
    draft_id: draftId,
    srt_path: z.string().min(1).describe("Path or URL to an SRT subtitle file."),
    font_style: z.string().optional().describe("Named font style preset for the subtitles."),
    position: z.string().optional().describe("Named position preset, e.g. 'bottom_center'."),
    extra_params: extraParams
  })
  .strict();

export const AddEffectSchema = z
  .object({
    draft_id: draftId,
    effect_type: z.string().min(1).describe("Name/ID of the effect to apply (e.g. a filter or visual effect identifier)."),
    start: z.number().min(0).default(0).describe("Start time in seconds within the timeline."),
    end: z.number().positive().optional().describe("End time in seconds within the timeline."),
    duration: z.number().positive().optional().describe("Effect duration in seconds, as an alternative to start/end."),
    params: z
      .array(z.number().nullable())
      .default([])
      .describe(
        "Effect-specific numeric parameters, in the order VectCutAPI's effect definition expects (varies by " +
          "effect_type). Use null for an item to fall back to its default value. Defaults to an empty array " +
          "(all defaults) rather than being omitted — the VectCutAPI backend crashes if this field is absent."
      ),
    extra_params: extraParams
  })
  .strict();

export const AddStickerSchema = z
  .object({
    draft_id: draftId,
    resource_id: z.string().min(1).describe("ID of the sticker resource to place."),
    start: z.number().min(0).default(0).describe("Start time in seconds within the timeline."),
    end: z.number().positive().optional().describe("End time in seconds within the timeline."),
    position_x: z.number().optional().describe("Horizontal position offset."),
    position_y: z.number().optional().describe("Vertical position offset."),
    scale: z.number().positive().optional().describe("Uniform scale factor (1.0 = original size)."),
    rotation: z.number().optional().describe("Rotation in degrees."),
    extra_params: extraParams
  })
  .strict();

export const AddVideoKeyframeSchema = z
  .object({
    draft_id: draftId,
    track_name: z.string().min(1).describe("Name of the track to animate (as returned/used when the clip was added)."),
    property_types: z
      .array(z.string())
      .min(1)
      .describe("Properties to animate, e.g. ['scale_x', 'scale_y', 'alpha', 'rotation', 'position_x', 'position_y']."),
    times: z.array(z.number().min(0)).min(1).describe("Keyframe timestamps in seconds. Must be the same length as each value list."),
    values: z.array(z.string()).min(1).describe("Keyframe values (as strings) matching each timestamp in `times`."),
    extra_params: extraParams
  })
  .strict();

export const SaveDraftSchema = z
  .object({
    draft_id: draftId
  })
  .strict();
