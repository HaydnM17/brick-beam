# Handoff: Brick & Beam Coffee Co — scroll-film landing page

## Overview

A single-page marketing site for Brick & Beam Coffee Co (4979 King St, Beamsville, ON). Its
defining feature is a **scroll-scrubbed background film**: one espresso-pour video is fixed behind
the entire page and its playhead is driven by scroll position rather than by time. The pour plays
across the hero, the stream holds behind the content sections, and the cup fills as the visitor
reaches the footer. Everything else — copy bands, marquees, reveals, parallax — is layered on top
of that single continuous shot.

## About the Design Files

The files in this bundle are **design references created in HTML**. They are prototypes that show
the intended look and behaviour — they are not production code to lift directly.

The task is to **recreate these designs in the target codebase's existing environment** (React,
Vue, Astro, SwiftUI, native, whatever is already in place) using its established patterns,
component library, and styling approach. If no environment exists yet, pick the framework best
suited to the project and implement there.

`film-engine.js` is the one exception worth reading closely rather than re-deriving: the
scroll→playhead mapping, the seek-coalescing gate, and the WebGL upscaler encode real behaviour
that is easy to get subtly wrong. Port its *logic*; don't necessarily port its DOM plumbing.

Notes on the prototype's own scaffolding, so you can ignore it:

- `Brick & Beam v3.dc.html` is a "Design Component" — a template plus a small logic class, wired by
  `support.js`. Treat `support.js` as prototype-only glue. It is not part of the design.
- The prototype uses **inline styles exclusively** (a constraint of the prototyping environment).
  Do not carry this over. Use the target codebase's normal styling layer — CSS modules, Tailwind,
  styled-components, etc. The Design Tokens section below gives you the values.
- The template's `{{ … }}` holes, `<sc-if>`, and `<sc-for>` tags are prototype template syntax.
  Map them to ordinary conditionals and loops.

## Fidelity

**High-fidelity.** Colours, typography, spacing, motion timings, and copy are final. Recreate the
UI pixel-perfectly. All copy in this document is the exact approved text — do not rewrite it.

---

## The scroll film (the core mechanic)

This is the part to get right first; everything else is a conventional marketing page.

There are **two films**, not one. A portrait cut plays on portrait phones and portrait tablets, and
the landscape cut plays everywhere else. One media query picks between them and the engine loads only
the one the viewport asks for. See "Which film plays" below for the rule and the swap.

### Source: the landscape film

- `assets/hero-film.mp4` — H.264, **1920×1080** (16:9), **16.3 s**, 391 frames at 24 fps,
  5,545,328 bytes (~5.54 MB), keyframe every 8 frames, no audio.
- `assets/film-poster.jpg` — first-frame still, shown while the video loads.
- `assets/film-end.jpg` — last frame, the moment the last drop lands, used as the footer's static
  fallback.
- `assets/film-still.jpg` — mid-pour still (12.3 s, stream landing in the cup). Kept as an approved
  frame; the static hero now uses the poster instead, so nothing in the page references it.

### Source: the portrait film

- `assets/hero-film-portrait.mp4` is H.264, **1072×1920** (9:16), **17.04 s**, 409 frames at 24 fps,
  4,104,064 bytes (~4.10 MB), keyframe every 8 frames, no audio.
- `assets/film-poster-portrait.jpg` is the first-frame still, shown while the video loads and used as
  the static hero's background on portrait phones and tablets.
- `assets/film-end-portrait.jpg` is the last frame, the full cup with steam, used as the footer's
  static fallback there.
- `assets/film-still-portrait.jpg` is a mid-fall still at 6.0 s. Kept as an approved frame; nothing
  in the page references it.

Its content by output time: drops falling from a chrome basket and thickening into a stream
(0 → 2.0 s); the stream continuous and the basket leaving the top of frame (about 2.0 s); a pure
falling stream against darkness with no cup (2.0 → about 8.0 s); the cup rim creeping in at the very
bottom edge (from about 8.0 s); the stream clearly pouring into the cup and the level rising (from
about 12.8 s); the stream stopping and the last drops landing (about 15.5 s); and a still full
espresso cup on a saucer with steam (15.5 → 17.04 s). It is framed to fill a tall screen, so it needs
none of the top-band fitting the landscape film needs there.

The landscape clip's content over its duration: a drip forming on the underside of a bottomless portafilter
basket, side-on (0 → ~0.142), the drip becoming a stream while the camera begins a slow tilt down
(~0.142 → ~0.227), an eased slowdown baked into the footage as the tilt continues, the source easing
from 1x down to a third speed on a smoothstep (raw 3.7 → 4.5 s, 0.8 s of footage stretched into 1.6 s
of output) (~0.227 → ~0.325), the basket sliding out of the top of frame in slow motion (~0.325 →
0.576), the falling stream alone against darkness (~0.576 → 0.637), an espresso cup rising into frame
from the bottom (~0.637 → 0.751), the stream landing and the cup filling (~0.751 → 0.894), and the
last drops with the camera settling onto the full cup (~0.894 → 1.0). The clip ends on the frame where
the last drop lands. The eased ramp and the basket-exit, stream-alone and cup-entry sections (the ramp easing
continuously from 1x to a third speed, the other three slowed three, six and three times) are all
part of one piecewise time remap applied to the whole clip in a single motion-interpolation pass, so
there are no joins between them and the fall reads long under scroll; nothing else is time-stretched.

The take ran just under 4 s longer; the tail after the last drop was trimmed because the surface in
the cup kept rising for several seconds after the pour had visibly stopped, which read as a mistake
at the very bottom of the page. The kept 16.3 s use the original frames outside the eased ramp and the
three motion-interpolated sections described above.

### Structure

```
<div data-bb="film">            position: fixed; inset: 0; z-index: 0;   ← never scrolls
  <div data-bb="poster">        background-image, cover, inset -5%       ← pre-load + parallax
  <video data-bb="video">       object-fit: cover; opacity 0             ← decode source; no-WebGL fallback
  <canvas data-bb="canvas">     WebGL upscale target; opacity 0          ← what the user actually sees
  <div data-bb="band-fade">     56.25vw tall; landscape film in portrait ← softens the bottom of the film band
  <div>                         radial vignette
  <div data-bb="dim">           flat scrim, opacity driven by scroll
</div>
<main style="position:relative; z-index:1">   ← all content rides above the film
```

The `<video>` is never played. It is a decode surface: the engine writes `currentTime` and reads
frames out of it. The canvas is what is composited on screen. If WebGL is unavailable the film root
gets `.bb-no-gl` and the raw `<video>` element is faded in instead.

### Which film plays

One query decides, and nothing else:

```
(orientation: portrait) and (max-width: 1024px)
```

Match and the portrait film plays. Miss and the landscape film plays. That covers portrait phones and
portrait tablets on one side, and landscape phones, landscape tablets, portrait windows wider than
1024px, and every desktop on the other. The string lives in `PORTRAIT_Q` in `film-engine.js` and in
two `@media` blocks in the page's `<style>`. Keep all three byte-identical, the same discipline the
static-hero `GATES` list needs.

The engine tracks two flags. `usePortrait` is what the viewport asks for. `filmIsPortrait` is what is
actually loaded or loading. They differ only inside the swap debounce, which is exactly when the
mapping still has to describe the film that is still on screen. Every downstream read (the blob
fetch, the poster, `videoBytes` for the progress ring, the zones, the start, the intro end, the zoom)
goes through one accessor that reads from `filmIsPortrait`, so there is one load path and one scrub
path, never a portrait copy of either. The engine also writes `.bb-film-portrait` or
`.bb-film-landscape` on the page root so the stylesheet can key off the same decision.

**Swapping live.** When the query flips, the engine debounces 220 ms (so dragging a window edge
across the boundary does not start several fetches), then tears the current film down and loads the
other from scratch. Teardown aborts any in-flight fetch, bumps a load generation so every awaiting
continuation of the old load bails at its next resumption, detaches the `canplay`/`error` pair
waiting on the old source, ends any running intro, resets the seek gate and its pending time, clears
the ready flag and the `.bb-video-ready` class, removes the `src` attribute (removing it rather than
setting it empty, so the element empties without firing a spurious `error`), and revokes the old
object URL. The new load then re-measures and re-seeks to the current scroll position, so the frame
on screen is right immediately rather than after the next scroll. `liveStart`, which is a progress
value on the film that has just left, is re-homed into the new film's hand-off range. Both the
`matchmedia` `change` event and the `resize` handler call the same entry point, which is a no-op when
the answer has not changed.

### Scroll → playhead mapping

Three zones, defined in `filmTime(y)` in `film-engine.js`. The shape is the same for both films; only
the numbers differ.

**Landscape film** (`assets/hero-film.mp4`, 16.3 s):

| Zone | Scroll range | Film progress | Seconds | What the viewer sees |
|---|---|---|---|---|
| Pour | `0 → zoneA` (end of the 360vh hero) | `start → zones[0]` | 0 → 9.4 | The drip becomes a stream and the basket slides out of the top of frame |
| Stream | `zoneA → zoneB` (top of the footer, minus 50vh) | `zones[0] → zones[1]` | 9.4 → 11.5 | The falling stream alone, near-held behind the content; the cup rim begins to show at the end |
| Cup | `zoneB → maxScroll` | `zones[1] → 1.0` | 11.5 → 16.3 | The cup rises into frame, the stream lands, the cup fills and settles |

**Portrait film** (`assets/hero-film-portrait.mp4`, 17.04 s):

| Zone | Scroll range | Film progress | Seconds | What the viewer sees |
|---|---|---|---|---|
| Pour | `0 → zoneA` (end of the 360vh hero) | `portraitStart → portraitZones[0]` | 0 → 4.94 | Drops fall from the basket and thicken into a continuous stream, the basket leaves the top of frame, and the fall continues |
| Stream | `zoneA → zoneB` (top of the footer, minus 50vh) | `portraitZones[0] → portraitZones[1]` | 4.94 → 12.8 | The falling stream alone against darkness; the cup rim creeps in at the bottom edge from about 8 s |
| Cup | `zoneB → maxScroll` | `portraitZones[1] → 1.0` | 12.8 → 17.04 | The stream pours into the cup, the level rises, the last drops land, the full cup settles with steam |

Current values, passed at init:

```js
{ videoSrc: 'assets/hero-film.mp4', posterSrc: 'assets/film-poster.jpg', videoBytes: 5545328,
  start: 0, zones: [0.576, 0.704], zoom: 1.08, introEnd: 0.343,

  portraitVideoSrc: 'assets/hero-film-portrait.mp4', portraitPosterSrc: 'assets/film-poster-portrait.jpg',
  portraitVideoBytes: 4104064,
  portraitStart: 0, portraitZones: [0.29, 0.751], portraitZoom: 1, portraitIntroEnd: 0.16,

  heroVh: 360, sharpen: 0.7, contrast: 1.05, dim: 0.72,
  intro: true, introEase: 0.35 }
```

New engine options and their defaults, all of them the portrait half of an existing landscape option:

| Option | Default | What it is |
|---|---|---|
| `portraitVideoSrc` | `'assets/hero-film-portrait.mp4'` | The portrait film. Falsy disables the swap entirely and the landscape film plays everywhere |
| `portraitPosterSrc` | `'assets/film-poster-portrait.jpg'` | Painted on the poster layer while the portrait film loads |
| `portraitVideoBytes` | `4104064` | Fallback total for the progress ring when the response has no `Content-Length` |
| `portraitZones` | `[0.29, 0.751]` | Pour end and stream end, as a fraction of the portrait film |
| `portraitStart` | `0` | Where the mapping begins, as a fraction of the portrait film |
| `portraitIntroEnd` | `0.16` | Where the intro hands the playhead to scroll, as a fraction of the portrait film |
| `portraitZoom` | `1` | UV pull-back for the portrait film. 1.0, because it already fills a tall screen |

`start: 0` is deliberate for both clips: the poster is the first frame and there is movement from
frame one, so the film responds to the visitor's first scroll with no dead stretch.
If either source clip is ever re-cut, re-derive its `start` and both its zones. Sample frames and find
where visible change begins, where the basket leaves the top of frame, and where the cup rim
enters. The mapping is scroll-driven, so the stream section's length in seconds only sets how
many frames the content scroll has to move through.

`filmTime` holds each zone end at or after the one before it. That matters because the intro can hand
the playhead over past the pour mark if `introEnd` is set beyond `zones[0]`, and the scrub must only
ever run forwards. Keep an `introEnd` below its film's `zones[0]` anyway, or the hero has nothing left
to scrub through. `portraitIntroEnd: 0.16` (~2.73 s) lands safely past the drip becoming a continuous
stream at ~2.0 s and stays comfortably below `portraitZones[0]` (`0.29`, ~4.94 s), so the intro always
hands off inside footage the hero still has left to scrub. `portraitZones[0]` was widened from `0.117`
to `0.29` for the same reason from the other direction: at `0.117` the hero's whole scroll runway
mapped to just the first 2.0 s of film, cutting the intro's hand-off point off before the drip had
even become a stream.

`zoom: 1.08` scales the sampled UV window, pulling the camera back slightly. Because the texture uses `CLAMP_TO_EDGE`, sampling past the frame
edge smears the outermost pixel row — this is intentional and invisible under the vignette, but it
sets a practical ceiling of roughly 1.3 before the smear reads. In the non-WebGL path the same
effect is a `scale(1 / zoom)` transform on the `<video>`, which letterboxes instead.

### Playback and scrubbing

The engine does **not** write `currentTime` on every scroll event. That thrashes the decoder and
produces visible stalls. Instead:

- **Smoothing.** Raw `scrollY` is the `target`. A rAF loop eases a `shown` value toward it
  (exponential smoothing), and the playhead follows `shown`, not `target`. The loop stops when
  `|target − shown| < 0.3px`. Never run a permanent rAF loop.
- **Seek gate.** `requestSeek(t)` refuses to write `currentTime` while a seek is in flight. Newer
  targets overwrite a single `pendingTime` slot; on `seeked`, the pending target is issued. This
  coalescing is what keeps the scrub smooth — without it the video queues dozens of stale seeks.
- **Paint on `seeked`, not on rAF.** A new frame is only available after the seek resolves.
- **Lazy load.** `preload="none"`. The video is fetched as a blob (so load progress can drive a
  loading cue) and only then attached. Until it is ready the poster is what shows.
- **Failure path.** Any `error` on the video adds `.bb-film-failed`, which swaps in the static
  stills. The page must be fully legible with no video at all.

### The intro, and handing the playhead to scroll

The film plays itself once on load. As soon as the blob is attached and the video is ready, and only
if the visitor has not scrolled yet (`scrollY` under 40px) and reduced motion is off, the video plays
forward in real time from `start` to a new option `introEnd` (0.343 of the duration, about 5.6s):
the drip stretching into a pouring stream, the camera tilting down through the eased slowdown baked
into the footage, and on through a short beat of the basket sliding out of frame before it stops.
Frames are painted into the WebGL canvas from `video.requestVideoFrameCallback` where it exists, and
from a rAF loop calling `draw()` where it does not. In the no-WebGL path the `<video>` is already the
thing on screen, so playing it is all that is needed.

Most of the slowdown now lives in the footage itself rather than in `playbackRate`: the source is
smoothstepped in the encode from 1x down to a third speed across raw 3.7 to 4.5 s (0.8 s of source),
producing 1.6 s of output built from interpolated frames, so the pour is already gliding to a crawl
before any rate change happens. The intro's `playbackRate` ramp is now only a short final softening
on top of that. Over the last `introEase` seconds of the intro (0.35 s by default) the pour eases the
rest of the way to a halt: on every painted frame the engine takes `remaining = introEnd · duration −
currentTime` and sets `playbackRate` to `0.5 + 0.5 · s²(3 − 2s)`, where `s = clamp(remaining /
introEase, 0, 1)`. The rate is exactly 1 until the ramp window opens, and the floor is 0.5, higher
than it needed to be before because the baked-in ramp now carries most of the slowdown.
The source is still 24 fps, so a much lower rate would still read as stutter rather than a smooth
glide, which is why the floor is kept high and the ramp window short instead of letting the rate sink
toward Chrome's own minimum of 0.0625.
When `remaining` falls to one frame (0.045 s) the video pauses and the hand-off below runs unchanged.
`playbackRate` is set back to 1 in the hand-off however the intro ended, so the scrub never runs at
anything but 1, and a browser that refuses a rate change (Safari clamps) is caught and the intro
simply keeps its old hard stop.

The hand-off is the part to get right. On the first real scroll intent, meaning a `scroll` event that
actually moved, a `wheel`, a `touchmove`, or a scrolling key, or when playback reaches `introEnd`,
the engine pauses the video and sets the live mapping start to the frame that is on screen:
`start = video.currentTime / video.duration`, capped at `introEnd`. The scrub then continues from
exactly that frame, so there is no jump, and scrolling back to the top returns to that same frame
rather than to frame zero. The `filmStart` prop stays the base start that the intro plays from.

The rules around it:

- If the visitor has already scrolled when the video becomes ready, the intro is skipped entirely.
- `visibilitychange` to hidden pauses it, and it does not resume.
- Reduced motion turning on mid-intro stops it.
- `requestSeek` refuses to write `currentTime` for as long as the intro is playing, so the intro and
  the scrub never fight over the playhead. Gated seeking resumes the moment it pauses.
- The band-1 load ramp (`loadK`) is unaffected and keeps running through the intro.
- A `timeupdate` listener stops the intro at `introEnd` as well, so a starved frame callback cannot
  leave it running past the mark.
- A scroll intent during the ramp hands off from the frame that is on screen, exactly as it does
  before the ramp; the slowed rate changes nothing about the hand-off.

Whichever film is loaded runs its own intro against its own numbers: the intro starts at that film's
start and stops at that film's intro end, and the hand-off writes a progress on that film's timeline.

The prototype exposes all three as editor props in the Film section: `intro` (boolean, default true),
`introEnd` (range, default 0.343, 0 to 0.6, step 0.005) and `introEase` (range, default 0.35 s, 0 to 4,
step 0.1; 0 restores the hard stop). `intro` and `introEase` are shared. The portrait film gets its own
`portraitIntroEnd` (range, default 0.16, 0 to 0.6, step 0.005) alongside `portraitVideoSrc` (text),
`portraitStart` (range, default 0) and `portraitZoom` (range, default 1). Both films' zones stay
hardcoded at init rather than exposed, which is how the landscape zones have always been handled.

### Upscaling

The landscape source is 1920×1080 and the portrait source is 1072×1920, both shown full-viewport, so
each is upscaled on larger and high-DPI displays. The WebGL
pass runs a **9-tap Catmull-Rom** resample plus a 4-tap **unsharp mask** (`sharpen: 0.7`) and a
gentle contrast lift (`contrast: 1.05`). Plain `object-fit: cover` on the `<video>` looks
noticeably softer. If your target platform gives you a better upscaler, use it — this is a means,
not a requirement.

### When the film is switched off entirely

The film and the scrolling hero are replaced by a static hero (`[data-bb="static-hero"]`) under two
conditions, and only these two:

- `(prefers-reduced-motion: reduce)`
- `(orientation: landscape) and (pointer: coarse) and (max-height: 560px)`

Those two strings exist twice: as the `GATES` array in `film-engine.js` and as the `@media` list in
the page's `<style>`. Keep them byte-identical. If they drift, the engine and the stylesheet disagree
about which hero is on screen.

Phones get the real scrub. Portrait phones and portrait tablets run the portrait film, cover-cropped
full-bleed like the landscape film is on desktop. The static hero is still the fallback for the two
gates above, and its stills follow whichever film the viewport would load: `assets/film-poster.jpg`
and `assets/film-end.jpg` normally, `assets/film-poster-portrait.jpg` and
`assets/film-end-portrait.jpg` under the same
`(orientation: portrait) and (max-width: 1024px)` query the film swap uses, both sized to cover. That
query is written out character for character in the stylesheet rather than derived, so the CSS and the
engine can never disagree. `.bb-film-failed` continues to swap the footer to the end still; the poster
layer keeps the hero legible with no video at all.

### Top-band framing (landscape film on a tall screen only)

This used to apply to every portrait viewport, because a 16:9 frame cannot cover a tall screen. With
the portrait film it is obsolete on phones and tablets, and it is now **only the fallback for the
landscape film in a portrait viewport**: a portrait window wider than 1024px, or any build where
`portraitVideoSrc` is empty. It is gated on the `.bb-film-landscape` class the engine writes, so the
portrait film never touches it.

Where it does apply, the film is not cover-cropped. It is fitted to the full viewport
width with its top edge anchored to the top of the viewport, at zoom 1.0 (the 1.08 pull-back is
dropped), and the rest of the fixed film layer is `#0B0908`. For this 16:9 source the band is
therefore `56.25vw` tall. A gradient over the bottom 18% of the band fades it into the ink so the
edge never reads as a hard line. All three layers have to agree:

- **WebGL.** `render()` clears the drawing buffer to `#0B0908` and draws the whole frame into a
  top-band `gl.viewport`. Restricting the viewport, rather than only the uv window, is what keeps the
  `CLAMP_TO_EDGE` smear off the screen below the frame. The band height is floored so it can never
  exceed the CSS fade band and leave a bright hairline. The branch is guarded on the active film being
  the landscape one, so a tall canvas alone no longer triggers it.
- **No-WebGL `<video>`.** `object-fit: contain`, `object-position: center top`, background `#0B0908`,
  and no `scale(1 / zoom)` transform.
- **Poster.** `background-size: 100% auto`, `background-position: center top`, and no parallax
  offset, so it lines up with the two above while it is still the thing on screen.
- **`[data-bb="band-fade"]`.** Shown. It is hidden whenever the portrait film is the active one.

Landscape viewports keep the cover-crop and the 1.08 zoom exactly as they were. The portrait film
takes the same cover-crop path with its own `portraitZoom` of 1.0.

### Phone layout for the copy bands

With the portrait film full-bleed, the copy sits over the film the way it does on desktop rather than
below a band. Under `(orientation: portrait), (max-width: 720px)`:

- The three hero bands go full width minus a 20px inset, with the headline stepping down to
  `clamp(40px, 11vw, 72px)`. They still cross-fade on their existing `data-band` ranges. The shared
  rule bottom-anchors them (`bottom: 44px`); the portrait film overrides that to centre them instead
  (see below).
- The `.bb-glide` counter-drift inside a band is damped from 90px to 28px, so a band cannot push its
  last line off the bottom of the screen.
- The footer band goes full width.

The vertical position then depends on which film is loaded:

| | Portrait film | Landscape film in a portrait viewport |
|---|---|---|
| Hero bands | `top: calc(50% - safe-area/2); transform: translateY(-50%)`, centred on the viewport as on desktop, clear of the nozzle above and the cue below | `bottom: 44px`, in the ink under the band |
| Load cue | `bottom: 28px`, its desktop position at the bottom edge | `top: calc(56.25vw + 14px)`, directly under the band |
| Footer band | `top: clamp(84px, 12vh, 140px)`, its desktop position | `top: calc(56.25vw + 22px)`, under the cup rather than over it |

Measured at 390×844 with the portrait film: all three hero bands centre at 50% of the viewport height,
matching the desktop composition. Band 1, the patch, is the shortest at 128px tall (y 358 to 486).
Band 3 is now the tallest at 219px (y 312 to 532); the cue sits at y 770, a 238px gap below it, and
the fixed header's bottom edge sits at y 86, a 226px gap above it, clear of both. Checked the same way
at 360×780, band 3 spans y 283 to 497 (214px tall) with 209px to the cue and 197px to the header, so
the centred position still needs no per-size adjustment. The wordmark in band 1 holds its floor size,
`52px`, at both widths and stays on one line. The existing band text shadow and the
`.bb-band::before` radial scrim carry the legibility over the film.

Touch targets stay at 48px on coarse pointers, and none of the accessibility behaviour changes.

---

## Screens / Views

The page is one continuous scroll. Sections in order:

### 1. Header (fixed)

- **Purpose:** Persistent wordmark, section nav, and a scroll-progress indicator.
- **Layout:** `position: fixed`, full width, `z-index: 50`. Flex row, space-between, `gap: 16px`,
  padding `14px clamp(20px, 5vw, 96px)`. Starts transparent over a top-down gradient scrim; past a
  scroll threshold it gains `.bb-solid` — `rgba(11,9,8,.82)`, `backdrop-filter: blur(14px)`, and a
  1px `rgba(233,227,211,.06)` bottom hairline.
- **Wordmark:** "BRICK & BEAM" — Big Shoulders Display 900, 24px, `letter-spacing: .03em`, colour
  `#C9A54E`. The ampersand is the brand's own artwork (`assets/amp-haydn-brass.png`), sized to
  `.8125em` (the font's measured cap-height ratio) with a `.0756em` `border-bottom` rule `.042em`
  below it — sized and baseline-aligned so the glyph reads at the same overall height and line as
  the capital letters either side (verified with `getBoundingClientRect` against a canvas-measured
  cap-height, not just the CSS box). See "Wordmark treatment" under Typography.
- **Progress line:** a 1px rule pinned to the header's bottom edge, `transform: scaleX(scroll
  progress)`, `transform-origin: left`, colour `#C9A54E`.
- **Nav:** section anchors, What we pour, The room and Find us, plus an Instagram link. At 760px and
  below the header wraps into two rows and these four move to a scrolling rail under the wordmark.
  See "Phones and small screens".

### 2. Hero — "the pour"

- **Purpose:** The opening statement, delivered over the pour. Band 1 opens on the brand patch,
  band 2 carries the opening hours, band 3 closes on the address and the call to action.
- **Layout:** `height: 360vh` with a `position: sticky; top: 0; height: 100vh` stage inside. The
  tall section is scroll runway; the stage is what is seen.
- **Content:** three copy bands, each absolutely positioned and vertically centred. Band 1 is a
  centred patch, `width: min(92vw, 700px)`; bands 2 and 3 alternate right / left, width
  `min(46vw, 680px)` (band 2 `min(44vw, 620px)`), inset `clamp(24px, 6vw, 110px)`.

  | Band | Active range (`data-band`) | Entrance | Content |
  |---|---|---|---|
  | 1 | `0 → 0.42` | `rise`, the footer patch's own entrance, reused as-is | The brand patch: "Proudly Brewed" in Mr Dafoe, the Brick & Beam wordmark, "EST. · Coffee Co · 2026", "Beamsville, Ontario" |
  | 2 | `0.33 → 0.72` | `drift`, words fall in from above | "Open at seven. Every day" headline, the live Open now / Closed pill, the hours and address sub-paragraph |
  | 3 | `0.63 → 1.0` | `depth`, words scale up from 0.84 | "The corner of King and everything" headline, sub-paragraph, "Find us on King" CTA |

  The ranges **overlap by ~0.09**. This is deliberate: the next band begins entering before the
  previous has left, so the hero never shows empty. Do not tidy these into abutting ranges.

  Band 1 is the footer's centred patch (see "11. Footer, the cup" below), reused as the hero's
  opening band: the same markup, the same `bb-e-rise` entrance and per-word `--th` stagger on the
  wordmark, centred the same way, just a smaller wordmark, `clamp(52px, 8vw, 120px)` against the
  footer's `clamp(64px, 10vw, 164px)`, so it sits clear of the fixed header instead of crowding it.
  It carries no heading of its own, a `div` with an `aria-label`, matching the footer, so the
  page's one hero `<h1>` stays on band 2. Band 2 also drops the "EST. 2026 · Beamsville, Ontario"
  chip that used to sit beside its status pill: the patch directly above it now says the same
  thing, and repeating it read as padding. The patch appears twice now, opening the hero and
  closing the footer, and is unchanged everywhere else.

  On narrow and portrait viewports the bands are re-laid-out under the film band; see "Phone layout
  for the copy bands" above.

- **Within a band**, elements stage in sequence off the band's own progress `k`: eyebrow chip or
  script line at `k·2.2`, headline per-word/char at `(k − threshold)·2.6–3`, sub-paragraph from
  `k = 0.62`, CTA from `k = 0.76`.
- **Legibility:** bands carry a three-layer text shadow —
  `0 1px 2px rgba(6,4,3,.95), 0 3px 12px rgba(6,4,3,.78), 0 10px 44px rgba(6,4,3,.8)`. Buttons
  inside a band reset it to `none`.
- **Headline type:** Big Shoulders Display 900, `clamp(52px, 6vw, 96px)`, `line-height: .88`,
  uppercase.
- **CTA:** pill, `min-height: 48px`, `padding: 0 28px`, `border-radius: 999px`, background
  `#C9A54E`, ink `#15110E`.

### 3. Static hero (fallback)

Same copy as hero band 3, laid over the poster still of whichever film the viewport would load:
`assets/film-poster-portrait.jpg` cover under
`(orientation: portrait) and (max-width: 1024px)`, `assets/film-poster.jpg` width-fitted and
top-anchored in a wider portrait window, and `assets/film-poster.jpg` cover everywhere else. Over it a
top-to-bottom scrim
(`rgba(11,9,8,.55)` → `rgba(11,9,8,.1)` at 35% → `rgba(11,9,8,.82)` at 72% → `#0B0908`).
`min-height: 100svh`, content bottom-aligned, `padding: 120px clamp(20px,5vw,96px) 44px`, and
`box-sizing: border-box` so that min-height is one viewport rather than one viewport plus the
padding. It is re-composed for short landscape screens; see "Phones and small screens".

### 4. "The shop" (`#shop`)

Two-column at wide sizes: a text column (`flex: 3 1 min(100%, 320px)`, `max-width: 640px`) and a
facts column. Section padding `clamp(96px,12vw,180px) clamp(20px,5vw,96px) clamp(72px,9vw,140px)`,
inner `max-width: 1320px`. Body copy `clamp(18px,1.4vw,22px)/1.55` in `#E9E3D3`; secondary
`clamp(16px,1.15vw,18px)/1.6` in `#B5AB9C`. A fact row sits above a `1px solid #3A322D` top border.

### 5. Marquee band

Full-bleed, `1px solid #2E2723` top and bottom, `padding: 26px 0`, background `rgba(11,9,8,…)`.
Two motions compose: a CSS `translate3d(0 → −50%)` loop (`bbMarquee`, 64s linear) on a duplicated
track, plus a scroll-linked `--mx` offset at `data-rate="0.35"`. The result drifts on its own and
also responds to scrolling. A second band later runs `data-rate="-0.3"` with the animation reversed
at 80s, so the two travel in opposite directions.

### 6. "What we pour" (`#pour`)

Background `rgba(11,9,8,.5)`. Two columns: a **sticky** left column (`top: 96px`, `flex: 4 1
min(100%,300px)`) holding the auto-pour, and a menu list on the right.

- **Auto-pour:** the oversized ampersand fills itself the first time the section comes into view.
  An IntersectionObserver at `threshold: 0.35` starts a rAF that runs `--h` from 0 to 1 over 1.1s on
  an ease-out (`1 − (1 − t)³`); `--h` drives the `clip-path: inset()` on the filled copy of the
  glyph, so the colour rises through it like a cup filling. It runs once — the observer unobserves
  on first entry and the fill never replays.
- On completion the section gets `.bb-done`, which lights the menu rows (`opacity .55 → 1` over
  0.55s, staggered `--i · 35ms`), draws their rules (`scaleX(0 → 1)` over 0.7s, staggered
  `--i · 120ms`), reveals the `[data-when="after"]` caption and fades in the steam layer over 1s.
  Under reduced motion (or `.bb-pinned`) the finished state is applied outright and the steam stays
  hidden.
- Nothing here is pressed, held, hovered or clicked. There is no control, no `aria-pressed` and no
  keyboard affordance: it is decoration that plays on arrival, and the menu it lights is real text
  that is legible before it does.

### 7. "The room" (`#room`)

Centred column, `max-width: 1320px`, `gap: clamp(40px,5vw,72px)`, padding
`clamp(96px,12vw,180px) clamp(20px,5vw,96px)`.

### 8. "Run & Walk Club" (`#club`)

Background `rgba(42,26,21,.55)` — the one warm-brown band on the page. Flex row, wraps, space-
between, `padding: clamp(80px,10vw,150px) clamp(20px,5vw,96px)`.

### 9. Reviews (`#reviews`)

Centred intro, then a third marquee (`data-rate="0.18"`, 84s) carrying review cards.
`animation-play-state: paused` on hover. Links out to Google Maps for the business.

**Placeholder content.** The quotes, the "4.5" rating, and the "from your reviews on Google" line
are sample text for this mockup, not real Google reviews — the business doesn't have its live
Google listing linked up yet. A small annotation directly under the "Reviews" eyebrow says so
(`Sample text for this mockup. Real Google reviews go here.`, 11px uppercase, letter-spaced,
`#B5AB9C`), and each quote's `<footer>` reads "Placeholder review" rather than "Google review
highlight". Swap in the real rating, review count, and quotes once the Google listing is live, and
remove the annotation and footer wording at the same time.

### 10. "Find us" (`#find`)

Background `rgba(11,9,8,.5)`. Address, hours, an **Open now / Closed** pill computed live against
`America/Toronto` (re-evaluated every 30s), a contact form, and a Leaflet map.

- **Map:** dark-tuned Leaflet. Attribution control restyled to `rgba(21,17,14,.85)` /`#B5AB9C`
  /11px; tooltips `#15110E` on `1px solid #3A322D`, uppercase 12px, `letter-spacing: .08em`.
- **Form states:** `empty` → `error` → `sent`. Per-field validation; name, email, message required;
  email format-checked. The prototype exposes a `formPreview` switch to force each state — that is
  a prototyping affordance, not a feature.

### 11. Footer — "the cup"

`height: 240vh` with a `sticky; top: 0; height: 100vh` panel. This is the runway that drives the
cup-fill zone of the film. Over it: a centred band ("Proudly Brewed" in Mr Dafoe,
`clamp(34px,3.6vw,54px)`, `#C9A54E`) plus closing details, entering with the `rise` effect across
`data-band="0,1"` with `data-ramp="0.55"`. In portrait the block drops below the film band so it
reads over the ink rather than over the cup. A gradient guards legibility top and bottom:
`rgba(11,9,8,.5) 0%` → transparent `22%` → transparent `70%` → `rgba(11,9,8,.72) 100%`.

The same patch now also opens the page, as hero band 1, at a smaller wordmark size; see
"2. Hero, the pour" above.

---

## Phones and small screens

There is no separate mobile layout. It is the same markup with the columns stacked, the type stepped
down and the touch details added. All of it lives in the page's `<style>` block, after the other
responsive rules and before the `.bb-pinned` and reduced-motion blocks, so the freeze still wins over
it. The phone rules set positions and sizes and never transforms, so a frozen band keeps its phone
position (left 20px, bottom 44px) instead of being pushed off screen.

### Breakpoints

| Query | What it does |
|---|---|
| `(max-width: 760px)` | Two-row header: wordmark, then the nav rail. 760px is where the one-row header stops fitting: the wordmark at 221px plus the nav at 402px plus a gap needs 639px, and the content width is 90% of the viewport. |
| `(max-width: 900px)` | The badge column in "What we pour" goes static (this rule already existed); the hero stage and the footer panel move from `100vh` to `100svh`. |
| `(max-width: 700px)` | Badge centred in the shop, map height, full-width Send button, review cards and their mask sized to the screen. |
| `(max-width: 420px)` | The static hero's headline and script line step down again. |
| `(orientation: portrait)`, `(max-width: 720px)` | The film band and the copy bands under it, unchanged from "Portrait framing" and "Phone layout for the copy bands" above. |
| `(orientation: landscape) and (max-height: 560px)` | Composition for the static hero on a landscape phone. It is inert everywhere else, because the static hero is only shown by the two gates. This is deliberately *not* a copy of the gate string: the gate list stays the pair of strings named above. |
| `(pointer: coarse)` | 48px targets, safe-area padding. |
| `(pointer: coarse) and (max-width: 900px)` | The two performance drops below. |

### The phone navigation

Below 640px two of the four nav links were hidden with nothing in their place, so What we pour and
The room could not be reached from a phone at all, and at 360px the wordmark wrapped onto two lines.

The header now wraps into two 48px rows at 760px and below: the wordmark on the first row, all four
links on the second as a horizontally scrolling rail. Labels drop to 11px with `letter-spacing:
.14em` and each sits in a 48px row. The rail hides its scrollbar, contains `overscroll-behavior-x` so
a swipe cannot turn into a page gesture, and fades out at 88% with a mask so it reads as scrollable
(the four labels measure 388px, so on a 360px screen the last one is off the edge until you swipe).
The labels carry the same three-layer text shadow as the copy bands, because the second row sits
below the header's gradient scrim and over the film. The scroll-progress hairline is unchanged and
stays pinned to the header's bottom edge, now at 96px. Sections carry `scroll-margin-top: 104px` so
an anchor jump lands below the header rather than under it.

A single "Find us" pill on the right was the other option. The rail won because it keeps all four
destinations reachable, and because the header is transparent over the film until it goes solid, so
the second row costs nothing but height.

### Per-section stacking

| Section | At narrow widths |
|---|---|
| Hero | As "Phone layout for the copy bands" above. Bands full width under the film band, bottom-aligned. |
| Static hero | `box-sizing: border-box`. Under 420px the headline steps to `clamp(44px, 14.5vw, 104px)` and the script line to `clamp(28px, 8.6vw, 44px)`. In short landscape the top padding drops to 64px, the gaps to 8px, the headline to `clamp(40px, 13vh, 104px)`, the script line to `clamp(24px, 8vh, 44px)`, the paragraph to 15px at 46ch and the chips to 10px, which fits the whole block inside 390px of height. |
| The shop | Text column and badge stack. The badge centres on its own row instead of sitting against the left margin. |
| What we pour | The badge column is static below 900px, so it stacks above the menu and never sticks over it. The three menu columns fall to one per row under about 560px on their own basis. |
| The room, Run & Walk Club | Already single column through wrapping. Unchanged. |
| Reviews | Cards go to `min(86vw, 600px)` with a 14px gap and a 34px `&`, which gives the quote 275px of text column at 360px instead of 232px. The band's mask fade drops from 8% to 4% a side so it stops eating into a card. |
| Find us | Address card, map and form stack. The map is `clamp(240px, 45vh, 400px)` tall rather than a fixed 460px (353px on a 360x780 screen). Inputs are 16px, so iOS does not zoom on focus. The Send button goes full width. |
| Footer | Already full width in portrait. The bottom row clears the home indicator. |

### Touch and iOS

- 48px minimum on every control on coarse pointers: the header links, the skip link, both Find us
  links, the "Send another" button, the reviews link and the two footer links. Above 760px the header
  keeps its one row, so its links take the height from padding and give it back with a negative
  margin, which leaves the 58px header exactly as it was. The one control still under 48px is
  Leaflet's own attribution link inside the map.
- `-webkit-tap-highlight-color: transparent` on every link and button.
- `env(safe-area-inset-*)` on the fixed header's side padding, the hero bands' vertical position, the
  static hero's bottom padding and the footer's bottom row. Most of these wrap it in `max()` so the
  existing value is the floor; the portrait-film hero band instead folds it into the `top: calc(50% -
  safe-area/2)` centring so a notched phone's home indicator still cannot clip the band.
- `100svh` for the hero stage and the footer panel below 900px, so the bottom of a band is not left
  under the iOS toolbar. The film layer itself is `position: fixed; inset: 0` and already covers the
  viewport whatever the toolbar does, and the band fade is measured in `vw`, so neither needed a
  change.
- `overflow-x: clip` with `hidden` declared first, on `html`, `body` and the root wrapper. `clip` is
  what keeps `position: sticky` working; the `hidden` in front of it is only the fallback.

### Performance trade-offs

- The grain is a full-screen fixed layer with `mix-blend-mode: overlay`. On `(pointer: coarse) and
  (max-width: 900px)` it is `display: none`. It runs at 0.075 opacity, so a phone loses almost
  nothing, and it saves a viewport-sized blend on every composited frame while the film is scrubbing.
- The chips' `backdrop-filter: blur(10px)` and the solid header's `blur(14px)` come off in the same
  query. Both sit over the film, so each scrubbed frame would otherwise force a backdrop readback.
  The colours are untouched: the chips keep `rgba(12,9,8,.55)` over the band's own radial scrim, and
  the header keeps `rgba(11,9,8,.82)`, which only appears past the hero where the dim scrim is
  already at 0.72.
- The engine's DPR cap (`Math.min(1.5, devicePixelRatio)`) and the marquee `will-change` hints are
  untouched.

---

## Interactions & Behaviour

### Scroll-driven (all off one shared rAF loop)

| Effect | Attribute | Behaviour |
|---|---|---|
| Film playhead | — | See the scroll film section above |
| Band entrances | `data-band="a,b"` | Element progress `k` mapped from a scroll window; `data-fade` sets the crossfade tail |
| Parallax | `data-parallax` | Translate proportional to viewport-relative position |
| Glide | `.bb-glide` | `translate3d(0, (0.5 − --pb) · 90px, 0)` — a subtler counter-drift; 28px inside a band on narrow viewports |
| Velocity skew | `data-kinetic` | `skewY(--vel · −2.4deg)`; `--vel` is smoothed scroll velocity, decaying to 0 at rest |
| Marquee offset | `data-bb="mq"` + `data-rate` | Scroll-linked `--mx` on top of the CSS loop |
| Header solidity | — | `.bb-solid` past a threshold |
| Dim scrim | `data-bb="dim"` | Opacity rises to `dim` (0.72) as content sections come over the film |

### Viewport-driven

`.bb-reveal` sections use an IntersectionObserver. On entry the section gains `.in`: children
marked `[data-part]` transition `opacity 0→1` and `translate3d(0,26px,0)→none` over 0.9s
`cubic-bezier(.22,1,.36,1)`, staggered `--i · 90ms`; `[data-rule]` elements draw with
`scaleX(0→1)` over 1.2s `cubic-bezier(.65,0,.35,1)` after 0.15s; `.bb-mask > span` elements slide
up from `112%` over 1.1s, staggered `--i · 60ms`. Once settled the section also gains `.settled`,
which zeroes the delays so later re-entry does not re-stagger.

The auto-pour in `#pour` runs off its own IntersectionObserver at `threshold: 0.35`, separate from
the reveal one; see section 6 above.

### Motion timings

| Purpose | Duration | Easing |
|---|---|---|
| Reveal (opacity + translate) | 0.9s | `cubic-bezier(.22, 1, .36, 1)` |
| Mask slide-up | 1.1s | `cubic-bezier(.22, 1, .36, 1)` |
| Rule draw | 1.2s (0.15s delay) | `cubic-bezier(.65, 0, .35, 1)` |
| Film / canvas crossfade | 0.9s | `cubic-bezier(.22, 1, .36, 1)` |
| Auto-pour fill (`--h`) | 1.1s | ease-out, `1 − (1 − t)³` |
| Steam fade-in | 1s | `ease` |
| Page-in | 0.9s | `ease-out` |
| Marquee loops | 64s / 80s / 84s | `linear`, infinite |

### Accessibility

- Skip link, `#main` target, `:focus-visible` outline `2px solid #C9A54E` at `3px` offset.
- The film is `aria-hidden` and `pointer-events: none`. All content is real text over it.
- Decorative marquees are `aria-hidden`; the reviews marquee keeps an `aria-label`.
- `prefers-reduced-motion: reduce` disables every animation and transition, forces all revealed
  states to their end values, zeroes all transforms, hides steam, and wraps the marquee tracks into
  static centred rows. There is also a `.bb-pinned` class that applies the same freeze on demand.
- Touch targets are at least 48px on coarse pointers.

## State Management

| State | Where | Notes |
|---|---|---|
| `scrollY` target / smoothed `shown` | Film engine | The single source for every scroll effect |
| `videoReady`, `loadK`, `objectUrl` | Film engine | Load progress and readiness |
| `loadGen`, `fetchCtrl`, `waitAbort` | Film engine | Load identity and the two handles a film swap has to release |
| `usePortrait`, `filmIsPortrait` | Film engine | What the viewport asks for, and which film is actually loaded |
| `seekBusy`, `pendingTime` | Film engine | The seek gate |
| `introPlaying`, `introDone`, `userScrolled` | Film engine | The intro and its hand-off |
| Live mapping start | Film engine | The active film's start until the intro hands over, the paused frame after |
| `glOk` | Film engine | WebGL availability; falls back to the `<video>` |
| Form `{name, email, message}` | Page | Controlled inputs |
| Form `status` | Page | `empty` / `error` / `sent` |
| Form `errors` | Page | Per-field messages |
| Open/closed | Page | Derived from `America/Toronto` time; re-evaluated every 30s |
| Pour fill `--h` | Film engine | 0 → 1 over 1.1s when `#pour` first enters view; latches `.bb-done` at 1, never replays |

No data fetching beyond the video, the web fonts, and Leaflet map tiles.

## Design Tokens

### Colour

| Token | Hex | Use |
|---|---|---|
| Ink (page ground) | `#0B0908` | Body background, film letterbox |
| Panel | `#15110E` | Raised surfaces, tooltip ground, button ink |
| Warm brown | `#2A1A15` | Club band, at `.55` alpha |
| Hairline dark | `#2E2723` | Marquee band borders |
| Hairline | `#3A322D` | Rules, borders, tooltip border |
| Muted text | `#B5AB9C` | Secondary copy, attribution |
| Cream (body text) | `#E9E3D3` | Primary copy |
| Brass (accent) | `#C9A54E` | Wordmark, CTAs, rules, focus ring, script type |

Common alpha uses: `rgba(11,9,8,.5)` section grounds, `rgba(11,9,8,.82)` solid header,
`rgba(42,26,21,.55)` club band, `rgba(233,227,211,.06)` header hairline,
`rgba(6,4,3,.78–.95)` text shadows.

### Typography

| Family | Weight | Role |
|---|---|---|
| Big Shoulders Display | 900 | Wordmark, all display headlines — uppercase, tight `line-height` (.88), `letter-spacing` .02–.03em |
| Libre Franklin | 400 / 500 | Body copy, nav, buttons, labels, eyebrows (uppercase 12px, `letter-spacing` .08–.14em) |
| Mr Dafoe | 400 | One accent phrase in the footer only |

Scale: display `clamp(52px, 6vw, 96px)` · lead `clamp(18px, 1.4vw, 22px)` · body
`clamp(16px, 1.15vw, 18px)` · small/UI 12–14px. Line-heights: .88 display, 1.55 lead, 1.6 body.

**Wordmark treatment.** The reference logo (`assets/full text logo.png`) sets the ampersand
smaller and raised above the baseline with an underline beneath it, and sets "CO" smaller and
raised too, with one underline running under both letters as a pair, never under each letter on
its own. That composition is reproduced everywhere the brand name is set as display type. A prior
pass rendered every ampersand as **live type** (the web font's own "&") after finding that an
earlier raster crop out of the 582×52 reference logo was too low-resolution (~29×35 real pixels)
to enlarge cleanly. The client has since supplied the brand's real ampersand artwork —
`assets/amp_haydn.png`, a decorative brass glyph, 1080×1080, with a wide margin and a subtly
speckled brass texture — and asked for it in place of the live-type glyph from now on. The seven
brand-name instances (header wordmark, the hero patch band's "Brick & Beam" line, the four marquee
inline "BRICK & BEAM" repeats, and the footer endmark) and the "What we pour" auto-pour badge now
use this artwork; the free-standing
marquee "&" separators, the review-quote "&" marks, the "CO" pairs and body/meta copy are
**unchanged** and still set as plain live type, since those were never the brief.

*Preparing the artwork.* In the Higgsfield sandbox (ImageMagick + Pillow), `amp_haydn.png` turned
out to already carry a clean alpha channel — the "white background" is only how a transparent PNG
previews when composited over white; inspecting the pixels showed a binary (0/255) alpha mask with
no semi-transparent fringe pixels to key out, so no `-fuzz`/`-transparent` pass was needed. The
glyph was trimmed to its ink bounding box (`-trim +repage`, 1080×1080 → 366×452) to make a
transparent master, then recoloured into `assets/amp-haydn-brass.png` (`#C9A54E`) and
`assets/amp-haydn-cream.png` (`#E9E3D3`) by mapping the glyph's own grayscale luminance onto each
flat colour (an Overlay blend, base = flat colour, top = the glyph's levelled grayscale) rather
than flattening to solid colour — this **keeps** the brass's speckled texture, tinted instead of
discarded. Rendered side-by-side at 20/40/80/160/350px, the texture is imperceptible at the small
sizes (indistinguishable from a flat fill once downsampled) and reads as a pleasing worn-brass
grain at the large ones, so a single textured asset serves every size with no separate "flat"
variant needed. `potrace` (via the `potracer` Python package; the `potrace` CLI itself was not
available in the sandbox) traced the trimmed alpha to `assets/amp-haydn.svg` — a clean 2-path
vector (outer silhouette + the ampersand's one enclosed counter) — used for the pour badge, where
its infinite sharpness suits the badge's large rendered size better than the raster's fixed
1080px source.

*Sizing and placement.* The seven brand-name instances swap the old live-type `<span>` for a small
wrapper around an `<img>`: `<span data-bb="amp" style="display:inline-block;line-height:1;
vertical-align:baseline;margin:0 .04em"><img src="assets/amp-haydn-{brass|cream}.png"
style="height:.8125em;width:auto"></span>`: brass where the surrounding type is brass (header,
hero patch band, footer endmark), cream where it is cream (all four marquee copies). `.8125em` is
the measured cap-height-to-font-size ratio of Big Shoulders Display 900's "B" (canvas
`measureText` `actualBoundingBoxAscent`, checked at several sizes down to a stable 0.8125
constant), so the glyph's rendered height tracks the surrounding capitals at any viewport width
without recalculation. `vertical-align:baseline` on the wrapper (the CSS default, written out for clarity, and confirmed
by measurement rather than assumed) leaves the image's bottom edge exactly on the true
capital-letter baseline: the wrapper is an inline-block whose only child is a block-level replaced
element, so its own baseline is its bottom margin edge by spec, and with no padding or border on
the wrapper that edge already coincides with the parent's text baseline. Measured with
`getBoundingClientRect` against the true baseline (located with a zero-size baseline-aligned
marker span) and the cap line (canvas `measureText` `actualBoundingBoxAscent` on the surrounding
run's own computed font), the image lands within a fraction of a pixel of both at desktop and
390px mobile widths, across all seven instances. See "The underline, restored" below for how the
rule under the glyph is kept out of this box geometry so it cannot move the baseline again. The
"What we pour" badge keeps its two-layer ghost/fill mechanic exactly, but
both layers are now `mask-image: url(assets/amp-haydn.svg)` (`mask-size: contain`,
`mask-position: center`) painted with the same faint-cream and espresso-gradient backgrounds as
before, instead of `background-clip: text` on a live glyph; the badge's outer box aspect-ratio was
changed from `539/820` (tuned to the old live glyph's ink bounds) to `366/452` (this artwork's own
bounding-box ratio) so the mask fills the box edge to edge with no letterboxing or clipping. The
existing `clip-path: inset(calc((1 - var(--h,0))*100%) …)` fill-reveal rule was not touched and
drives the new mask layer exactly as it drove the old text layer. The free-standing marquee
separators, the review-quote marks and body copy keep the original plain `&` characters at the
run's own font-size; the bare glyph reads as correct, normal ampersand overshoot there and was
never in scope for this change. The "CO" pairs also keep their own plain live type; their vertical
position is covered separately below.

*The underline, restored.* The wrapper originally carried a `border-bottom:.0756em solid
currentColor;padding-bottom:.042em` rule under the glyph (the reference logo's `.09em`/`.05em`
pair-underline, scaled down by the same `.84` the old live-type span used to shrink its own
font-size, so the rule's thickness and gap were pixel-identical to before the glyph swap). A later
pass removed it: on review it suited this glyph less well than it suited the live type, since this
artwork is a decorative, fully-enclosed brass shape whose own lower-right flourish already reads as
a visually finished base, and a straight rule underneath doubled up on that sense of closure rather
than anchoring the glyph the way an underline anchors a plain letterform.

Removing the border and padding did more than drop the rule, it also moved the glyph. An
inline-block whose only child is a block-level replaced element takes its own baseline from its
bottom margin edge, and the removed padding and border used to sit between the image and that
edge. The wrapper's `vertical-align:-.1em` existed to compensate for the height that pair added;
with the pair gone the compensation went unopposed and the glyph hung visibly low. Measured before
any fix, with a zero-size baseline-aligned probe span, the image's bottom edge sat about 0.1em
below the true text baseline at every instance: 2.39px of 24px at the header, 10.23px of 102.4px at
the hero patch band, 6.39px of 64px at each of the four marquee copies, 12.80px of 128px at the
footer patch, all within a hundredth of an em of exactly 0.1em.

The owner has since asked for the rule back, but not as a border: any padding or border on the
wrapper moves its baseline again, which is exactly what broke the position the first time. The rule
is now drawn by a `::after` pseudo-element on `[data-bb="amp"]`, added to the global stylesheet
rather than the wrapper's inline style, positioned absolutely (`position:relative` on the wrapper,
`position:absolute;left:0;right:0;top:100%` on the pseudo-element) so it paints just under the
glyph without taking part in the wrapper's own box geometry at all. `margin-top:.05em` sets the gap
and `height:.075em` sets the thickness, both in `em` so they scale with each instance's own
font-size, and `background:currentColor` so the rule inherits brass at the header and the two
patches and cream at the four marquee copies. With the rule's height back in the picture only as a
paint layer and never as box geometry, `vertical-align` on the wrapper reverts to `baseline` (the
CSS default), confirmed by measurement rather than assumed: the image's bottom edge now lands
exactly on the text baseline, 0px offset, at both desktop and 390px mobile widths across all seven
instances, and its top lands within a pixel of the surrounding capitals' cap line.

The "What we pour" badge's ampersand is not one of the seven: it is two stacked `mask-image` layers
(a faint ghost and an espresso-gradient fill) revealed by the `clip-path` in `.bb-hold [data-fill]`,
driven by `--h`. Its underline is a third `<span>` inside the same aspect-ratio-locked container, a
sibling of the two masked layers rather than a masked layer itself, so it carries no `data-fill`
attribute and never enters the `clip-path` calculation or the espresso fill. It sits at `top:100%`
of the container, the same placement the seven use, since the container bounds the glyph edge to
edge with no letterboxing. Its size is `margin-top:7.6%;height:9.23%` of the container, chosen so
the gap and thickness land at the same fraction of the badge's own height as `.05em`/`.075em` do of
the seven text instances' cap height (the extra factor on the margin corrects a CSS quirk where
percentage margins on an absolutely positioned box resolve against the containing block's width,
not its height, while percentage `height` does resolve against height, and the badge's container
is not square). It paints `rgba(233,227,211,.14)`, the same faint colour as the unfilled ghost
layer, so it sits there permanently in the ghost tone and never fills with the pour.

*The "CO" pairs.* Wherever the wordmark sets "Coffee Co", the "Co" is a small raised span with its
own underline running under the pair (never under each letter): the header's small "Coffee Co" tag
beside the main wordmark, and the "EST. · Coffee Co · 2026" row in both the hero patch band and the
footer patch. The owner's requirement: the small "Co"'s cap-ink top should meet the neighbouring
word's cap line, and the rule beneath it should meet the neighbouring word's baseline, so the small
pair and its rule together span exactly the same top-to-bottom as "Coffee" next to it, without
scaling "Co" up to match. With the neighbour's font-size `P` and the "Co"'s own font-size `C`, the
cap tops meet when the "Co"'s baseline sits `ascentRatio × (P − C)` above the neighbour's baseline,
where `ascentRatio` is that font's own cap-height-to-font-size ratio: 0.8125 for Big Shoulders
Display 900 (confirmed with canvas `measureText` at a large synthetic size, 600px, to keep
small-size hinting from lying, and consistent with a 0.0156em round-letter overshoot below the
baseline on "C"/"O"), 0.765625 for Libre Franklin 500, measured the same way. `vertical-align` and
`padding-bottom` on an inline element both resolve against that element's own font-size, so this
ratio converts straight into em units that hold at every size the surrounding `clamp()` produces.
Two cases exist on the page: the header's "COFFEE CO" tag (Big Shoulders Display 900, "CO" set at
`.62em` of a fixed 24px parent) needed `vertical-align:.4973em; padding-bottom:.3726em`; the hero
patch band's and footer patch's "Coffee Co" (Libre Franklin 500, "Co" set at `.7em` of a
`clamp(11px,1vw,14px)` parent, both rows share the same markup and so the same values) needed
`vertical-align:.3279em; padding-bottom:.1113em`. Both were checked against the live DOM rather
than trusted from the formula alone, using zero-size baseline-aligned probe spans (a
`display:inline-block` of zero width and height with `vertical-align:baseline` reports a line's
exact baseline through `getBoundingClientRect`): at 1280×800 the header tag's cap-ink-top error is
0.02px and its rule sits 0.02px from the neighbour's baseline, and the hero and footer rows measure
0.002px and 0px. On phones the header tag stays visible: below 760px the wordmark takes a full-width
row of its own, so "Coffee Co" fits beside it with room left over, measured at 360px wide with the
wordmark row ending 86px short of its container and no wrap. The hero and footer rows there measure
0.01px and 0.03px, with the footer patch's row rendering at 11px and its "Co" at 7.7px, as measured.
Nothing wraps or overflows at either width.

**Current implementation — everything above is superseded.** The raster/`potrace`/`data-bb="amp"`
system described in this whole "Wordmark treatment" section was the state through several passes,
but the page now renders the wordmark from two traced vectors instead: `assets/wordmark-full.svg`
(viewBox `0 0 1683 128`, the full "BRICK & BEAM COFFEE CO" mark, used in the header only) and
`assets/wordmark-brickbeam.svg` (viewBox `0 0 1023 128`, the "BRICK & BEAM" patch, used in the hero
band, all four marquee copies, and the footer endmark). Both are applied as CSS masks through a
single `.bb-wm` class (`-webkit-mask-image`/`mask-image`, `background-color: currentColor`), so each
instance inherits brass or cream from its surrounding context and stays pixel-sharp at any size with
no separate brass/cream raster pair to keep in sync. All former `data-bb="amp"` wrapper spans and
their underline `::after` CSS are gone — there is no separate ampersand glyph, underline rule, or
baseline-compensation math left in the page; the wordmark vectors carry the full lockup, ampersand
included, as one shape per instance. Treat the whole narrative above as historical record of how the
design got here, not as a description of the current markup.

### Spacing

Section padding `clamp(88px, 11vw, 176px)` vertical (the shop opens wider at
`clamp(96px, 12vw, 180px)`), `clamp(20px, 5vw, 96px)` horizontal. Content `max-width: 1320px`,
centred. Inner gaps `clamp(32px, 4vw, 72px)` between columns, `clamp(40px, 5vw, 72px)` between
stacked blocks, 22–26px within a block, 10–16px between tight items. Hero band inset
`clamp(24px, 6vw, 110px)`.

### Radius, borders, shadow

`999px` on every pill (buttons, chips, the status pill). Hairlines are always `1px solid` in
`#3A322D` or `#2E2723`. No box-shadows anywhere — depth comes from the text shadow over the film
and from the vignette. The header's only shadow is a 1px hairline.

## Assets

| File | Origin | Notes |
|---|---|---|
| `assets/hero-film.mp4` | AI-generated on Higgsfield (Kling 3.0 pro, image-to-video from an approved Nano Banana Pro still), an eased ramp and the stream section motion-interpolated, then re-encoded for scrubbing (x264 crf 21, keyframe every 8 frames, faststart) and trimmed to end on the last drop | 1920×1080, 16.3s, 5,545,328 bytes, silent |
| `assets/film-poster.jpg` | Frame 0 of the above | Pre-load poster, the film's approved opening still, and the static hero's background |
| `assets/film-end.jpg` | Final frame of the above, the moment the last drop lands | Footer static fallback |
| `assets/film-still.jpg` | Frame at 12.3s (stream landing in the cup) | Approved still, no longer referenced by the page |
| `assets/hero-film-portrait.mp4` | The portrait cut of the same pour, generated and encoded the same way | 1072×1920, 17.04s, 409 frames at 24fps, 4,104,064 bytes, keyframe every 8 frames, silent |
| `assets/film-poster-portrait.jpg` | Frame 0 of the portrait film | Pre-load poster and the static hero's background on portrait phones and tablets |
| `assets/film-end-portrait.jpg` | Final frame of the portrait film, the full cup with steam | Footer static fallback on portrait phones and tablets |
| `assets/film-still-portrait.jpg` | Frame at 6.0s of the portrait film | Approved still, no longer referenced by the page |
| `assets/full text logo.png` | Client-supplied reference | The official text logo, "BRICK & BEAM COFFEE CO" in Big Shoulders Display 900, 582×52, cream background. Source for every wordmark asset below. |
| `assets/wordmark-full.svg` | Traced from the reference logo above | Vector, viewBox `0 0 1683 128`, the full "BRICK & BEAM COFFEE CO" lockup. Applied as a CSS mask (`.bb-wm`, `background-color: currentColor`) in the header only, so it renders in brass there and can take any colour elsewhere without a separate raster per colour. **Current wordmark asset — supersedes the raster/`amp-haydn` system described in "Wordmark treatment" under Typography.** |
| `assets/wordmark-brickbeam.svg` | Traced the same way, the "BRICK & BEAM" patch only | Vector, viewBox `0 0 1023 128`. Same `.bb-wm` mask technique, used in the hero patch band, all four marquee copies, and the footer endmark. |
| `assets/wordmark-brass.png` | Cut from the reference above (Higgsfield sandbox, ImageMagick: 3x Lanczos upscale, `-fuzz 12% -transparent` keyed on the cream background, then recoloured) | Full "BRICK & BEAM COFFEE CO" wordmark, transparent background, brass `#C9A54E`, 1695×140. **Not referenced by the page** — superseded by the `.svg` masks above; kept as a reference/print asset. |
| `assets/wordmark-cream.png` | Same as above, recoloured cream `#E9E3D3` | 1695×140, transparent background. **Not referenced by the page.** |
| `assets/amp-brass.png` | Cropped from the keyed wordmark, glyph only, no underline | 87×104, brass. **No longer referenced by the page.** Kept on disk, unused. |
| `assets/amp-cream.png` | Same crop, recoloured cream | 87×104. **No longer referenced.** Kept on disk, unused. |
| `assets/amp-underline-brass.png` | Same crop with the underline included | 88×129, brass. **No longer referenced.** Kept on disk, unused. |
| `assets/amp-underline-cream.png` | Same crop with the underline included, recoloured cream | 88×129. **No longer referenced.** Kept on disk, unused. |
| `assets/amp_haydn.png` | Client-supplied, the brand's real ampersand artwork | 1080×1080, decorative brass glyph with a subtly speckled texture, clean alpha (already transparent — not a flattened white background), wide margin. Kept as the master original for `amp-haydn.svg` below. |
| `assets/amp-haydn-brass.png` | Trimmed to ink bounds (`-trim +repage`, ImageMagick, Higgsfield sandbox) and recoloured `#C9A54E` by mapping the glyph's own grayscale onto the flat colour (Overlay blend), keeping the speckle texture tinted rather than flattened | 366×452, transparent background, brass. **No longer referenced** — the header wordmark and footer endmark now render from the `.svg` wordmarks above, not this raster. |
| `assets/amp-haydn-cream.png` | Same trim, recoloured `#E9E3D3` the same way | 366×452, transparent background, cream. **No longer referenced** — the four marquee copies now render from `wordmark-brickbeam.svg`. |
| `assets/amp-haydn.svg` | Traced from the trimmed alpha with `potrace` (`potracer` Python package) | Vector, 366×452 viewBox, 2 closed paths (outer silhouette + the ampersand's one enclosed counter), flat silhouette (no texture — masks discard source colour). **Still used**, as a `mask-image` for the "What we pour" badge's ghost and fill layers only — the badge is a standalone ampersand mark, not part of the wordmark lockup. |

**Ampersand: the brand's own artwork, not live type.** The page's ampersands were live Big
Shoulders Display 900 type prior to this pass (see the git history / prior revision of this
section), after an earlier raster crop of the reference logo proved too low-res (~29×35px) to
enlarge cleanly for the pour badge and footer endmark. The client has since supplied
`assets/amp_haydn.png`, the brand's real ampersand mark, and asked for it in place of the live
glyph everywhere the brand name is set as display type — header wordmark, the four marquee inline
"BRICK & BEAM" repeats, the footer endmark, and the "What we pour" auto-pour badge. Because the
source artwork is large (1080×1080) it stays sharp at every size used on the page, including the
badge's largest breakpoint, which was the original complaint about the old 29×35px crop. The
free-standing marquee "&" separators, the review-quote "&" marks, the "CO" pairs and body/meta
copy were out of scope and remain plain live type. Full detail — the sandbox keying/trim/recolour
steps, the `potrace` vectorisation, the `getBoundingClientRect`-measured sizing and baseline
alignment, and the badge's mask-based rebuild — is under "Wordmark treatment" in Typography above.

The raw Higgsfield renders, the seven candidate opening stills and the previous film are kept in
`review/` beside this bundle; nothing in `review/` ships.

Fonts are Google Fonts: Big Shoulders Display, Libre Franklin, Mr Dafoe. Map tiles via Leaflet —
keep the attribution control. The logo files (`Logo.png`, `secondary_logo.png`) live in the client's
own asset folder and are **not** in this bundle; "BRICK"/"BEAM"/"CO" stay live type, while the
ampersand itself is now the client-supplied artwork (`assets/amp-haydn-*`) — see "Wordmark
treatment" under Typography.

If the target codebase has an existing brand system, defer to it for anything not specified here.

## Files

| File | What it is |
|---|---|
| `Brick & Beam v3.dc.html` | The full design — markup, styles, and page logic. The working source of truth; edit this file, never `index.html`. |
| `index.html` | **Generated.** A byte-for-byte copy of `Brick & Beam v3.dc.html`, produced by `deploy.ps1` because GitHub Pages needs an `index.html` at the repo root. Never edit this directly — it gets overwritten on every deploy. |
| `film-engine.js` | Scroll→film engine: mapping, seek gate, WebGL upscaler, all scroll effects. Worth porting closely. |
| `support.js` | Prototype runtime glue. Not part of the design; ignore. |
| `assets/` | Video, stills, and the wordmark SVGs/PNGs. |
| `deploy.ps1` | Copies the `.dc.html` source to `index.html`, stages an explicit list of files (never `git add -A`, since other sessions may be mid-write), commits, and pushes to `origin main`. Run as `.\deploy.ps1 "commit message"`. |

To view the prototype locally: serve the folder over HTTP (`python3 -m http.server`) and open
`Brick & Beam v3.dc.html`. Opening it from `file://` will not work — the video is fetched via
`XMLHttpRequest`.

### Deployment

The site is live on GitHub Pages at **https://haydnm17.github.io/brick-beam/**, deployed from the
public repo `HaydnM17/brick-beam` (this bundle's git remote). `deploy.ps1` is the only supported way
to publish a change: it regenerates `index.html` from the `.dc.html` source and pushes to `main`,
which GitHub Pages serves directly — there is no separate build step. Because `<title>` and the
Open Graph/Twitter meta tags live in the real `<head>` (not just inside the `<helmet>` block that
`support.js` injects at runtime), link previews in messaging apps and social platforms work without
needing JavaScript to run.
