# Markdown Rendering for Better Notes Layout (Design)

Date: 2026-02-03

## Goal
Improve exported note layout by rendering Markdown to HTML before writing into Apple Notes, so headings, lists, quotes, code blocks, and tables display properly.

## Current State
- Extension extracts HTML and converts to Markdown via Turndown.
- Native host turns Markdown into simple HTML by escaping each line into `<div>`.
- Result: poor formatting in Notes (no real Markdown rendering).

## Proposed Approach (Recommended)
Render Markdown to HTML in the extension using `markdown-it`, then send `html` to the native host. The native host will:
- Replace image tokens with local `file://` images (existing logic)
- Write the resulting HTML to Notes via AppleScript

## Data Flow
1. Content script: HTML -> Markdown + image tokens (`[[[IMG:n]]]`).
2. Background: render Markdown -> HTML using `markdown-it` (GFM features enabled).
3. Send payload to native host containing both `markdown` and `html`.
4. Native host:
   - If `html` present: replace image tokens and write HTML into Notes.
   - If `html` missing: fall back to legacy Markdown-to-HTML path.

## Payload Change
Add `html` field while keeping `markdown` for debug and backward compatibility.

Example:
```json
{
  "action": "createNote",
  "title": "...",
  "sourceUrl": "...",
  "markdown": "...",
  "html": "...",
  "images": [ ... ],
  "folder": { ... }
}
```

## Error Handling
- If `markdown-it` fails: log and omit `html` to trigger fallback.
- If image download fails: replace token with original URL (existing behavior).

## Compatibility
- New extension works with old native host (html ignored).
- New native host works with old extension (no html provided -> fallback).

## Testing
- Manual: use a complex Markdown sample (headings, lists, quotes, code blocks, tables, images) and verify Notes layout.
- Basic unit: ensure Markdown -> HTML renders expected tags for key structures.

## Implementation Plan (High Level)
- Add `markdown-it` dependency in extension.
- Render HTML in `background.ts` before sending to native host.
- Update `native_host/notes_bridge.py` to prefer `html` if present.
- Keep existing fallback for safety.
