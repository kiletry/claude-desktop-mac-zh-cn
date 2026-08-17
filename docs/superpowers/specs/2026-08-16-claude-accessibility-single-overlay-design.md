# Claude Desktop Accessibility-Driven Chinese Overlay Design

## Status

Approved design. This document supersedes the OCR overlay design for the
standalone macOS companion. It does not modify, copy, or re-sign the official
`/Applications/Claude.app` bundle.

## Goal

Provide a stable and visually coherent Simplified Chinese interface for the
official Claude Desktop application on macOS. Static navigation and toolbar
controls should appear Chinese without clipped text, misplaced labels,
floating sticker styling, or partial OCR coverage.

## Non-Goals

- Do not translate chat messages, prompts, attachments, conversation titles,
  user names, or other user-generated content.
- Do not modify files inside `Claude.app`.
- Do not inject code into the Claude process.
- Do not send, persist, or log Claude window text.
- Do not provide a separate web wrapper or replace official desktop features.

## Architecture

### Accessibility-driven control discovery

The companion uses the macOS Accessibility API to read control roles, stable
titles, frames, enabled state, and window changes exposed by the official
Claude process. It does not use screen OCR for text discovery.

The traversal is fail-closed:

- only the leftmost 30% of the Claude window and the topmost 14% are eligible;
- editable fields, text areas, documents, message lists, attachments, and
  conversation content are rejected;
- only strings present in the packaged local translation dictionary are
  rendered;
- unknown or ambiguous elements remain English;
- user-generated sidebar titles remain untouched.

### One overlay surface per Claude window

The companion creates one transparent, borderless, non-activating `NSPanel`
for each eligible Claude window. A single custom view draws every translated
label. This replaces the current architecture that creates a separate panel
for every OCR result.

The overlay surface:

- remains visible when the companion application is inactive;
- ignores mouse events so all clicks reach the official Claude controls;
- joins all Spaces and supports full-screen auxiliary presentation;
- is ordered above the Claude window only while Claude is frontmost;
- is hidden as one unit whenever Claude is not frontmost, minimized, or absent;
- updates its frame whenever the Claude window moves or resizes.

### Native-looking text replacement

The custom view draws only the text replacement regions. Icons, hover effects,
selected-row backgrounds, separators, and other official Claude visuals remain
visible and interactive underneath.

For each accepted control:

1. Convert the Accessibility frame from global top-left coordinates to the
   correct AppKit screen coordinate system.
2. Derive a text patch within the control frame that avoids the icon and
   trailing affordances.
3. Cover the original English glyph area with a background matching the active
   light or dark appearance.
4. Draw the Chinese label using Claude-like font size, weight, color, line
   height, and left alignment.
5. Expand the text patch within the safe row area when Chinese requires more
   width; never compress, clip, or overlap adjacent controls.

If a safe patch cannot be calculated, that control stays English.

## Data Flow

```text
Official Claude window (unchanged)
        |
        | macOS Accessibility metadata only
        v
Eligibility and region policy
        |
        | accepted static control title + frame
        v
Local English-to-Chinese dictionary
        |
        | translated label model
        v
Single non-interactive overlay canvas
```

No text is transmitted to a network service. Screen Recording is no longer a
runtime dependency after the accessibility implementation replaces OCR.

## Refresh Model

The companion listens for Accessibility and workspace notifications covering
window focus, movement, resize, layout, title, value, menu, and selection
changes. Multiple notifications are merged through a short debounce before
the overlay model is rebuilt.

There is no continuous OCR timer. A low-frequency safety refresh may verify
window ownership and clean up stale overlays, but it must not traverse or draw
when Claude is not frontmost.

## Permissions and User Flow

1. Launch `Claude Chinese Companion.app`.
2. The companion checks `AXIsProcessTrusted()`.
3. If permission is missing, it opens the macOS Accessibility settings page and
   explains which application to enable.
4. After authorization and relaunch, the user selects `启用中文界面`.
5. The companion activates Claude and attaches the single overlay surface.
6. Disabling translation immediately removes the complete overlay surface.

The existing Screen Recording permission may remain in macOS settings, but the
new implementation neither requires nor uses it.

## Failure Handling

- Missing Accessibility permission: show guidance and render nothing.
- Claude not running or not frontmost: hide and clear the overlay surface.
- Unsupported element hierarchy or frame: leave the element English.
- Theme or placement uncertainty: fail closed and leave the element English.
- Companion crash or exit: all overlay windows disappear; Claude remains
  unaffected.
- Claude update: unknown controls remain English until dictionary and layout
  compatibility are verified.

## Verification

### Automated checks

- Region policy accepts sidebar and toolbar controls and rejects the central
  conversation and input regions.
- Accessibility traversal rejects editable and user-content elements.
- Dictionary lookup translates known static controls and leaves unknown values
  unchanged.
- Accessibility-to-AppKit coordinate conversion is correct across scaled and
  multiple displays.
- Text patch layout expands for Chinese without crossing the control bounds.
- The single overlay panel remains visible when the companion deactivates,
  ignores mouse events, and is hidden when Claude loses focus.
- Rendering one model creates one panel rather than one panel per label.

### Manual acceptance

- Sidebar items such as Home, Code, New, Projects, Artifacts, Customize, View
  all, Import memory, and other known static navigation controls display
  Chinese.
- Known static toolbar controls display Chinese.
- Labels are not clipped, drifting, overlapping, or styled as floating pills.
- Moving, resizing, changing pages, switching light/dark appearance, and
  entering full screen preserve alignment.
- Chat messages, prompt input, attachments, conversation titles, and user data
  remain unmodified.
- Disabling or quitting the companion restores the complete original English
  interface immediately.
- `codesign --verify --deep --strict /Applications/Claude.app` and Gatekeeper
  assessment continue to pass.
- CPU use is materially lower than the continuous Vision OCR implementation.

## Delivery Boundary

The implementation remains a separately signed local companion at
`/Applications/Claude Chinese Companion.app`. The build process uses a stable
local designated requirement so macOS permissions survive companion updates.
Distribution outside the local machine still requires an Apple Developer ID
and notarization, which is outside the current delivery scope.
