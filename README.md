# Funk Volume Changer

> Paste a YouTube link. Get a cinematic player, glowing artwork, animated lyrics, and a volume slider that behaves like an instrument instead of a form control.

<div align="center">

`React 19` | `TypeScript` | `Vite` | `react-spring` | `YouTube IFrame API` | `LRCLIB`

</div>

## Why This Project Feels Different

Most media demos stop at "play / pause / seek."

This one leans into atmosphere:

- A YouTube URL turns into a full-screen listening surface.
- The thumbnail is sampled to extract a vibrant accent color for the UI glow.
- Lyrics can appear as a floating spotlight with karaoke-style progression.
- Audio mode keeps the experience immersive instead of shrinking into a bare player.
- The volume control is a playful elastic cannon slider with spring physics and impact animation.

It feels less like a widget and more like a small performance.

## Experience Highlights

### Dual Listening Modes

- `Video mode` keeps the embedded YouTube player front and center.
- `Audio mode` swaps the video surface for artwork while preserving playback and ambience.

### Ambient Visual System

- Uses the YouTube thumbnail as the visual source.
- Extracts a vibrant RGB color in the browser with canvas sampling.
- Pipes that color into CSS custom properties for glow, spotlight, and UI accents.

### Lyrics Spotlight

- Fetches lyrics from `LRCLIB`.
- Supports synced LRC lines when available.
- Falls back to plain lyrics when timing data is missing.
- Animates the active line with a color-tinted sweep effect.

### Elastic Volume Cannon

- Drag to bend the slider like a string.
- Click to pluck it.
- Hold the speaker button to charge a "shot" and launch volume to a target value.
- Uses `react-spring` to keep the motion lively and tactile.

### Playback Controls

- Play / pause
- Seek bar with live progress
- Volume control
- Keyboard shortcuts for space and left/right seek

## Tech Stack

| Layer | Tools |
| --- | --- |
| App | React 19, TypeScript |
| Build | Vite |
| Motion | `@react-spring/web` |
| Icons | `lucide-react` |
| Media | YouTube IFrame API |
| Lyrics | LRCLIB search API |
| Styling | CSS + Tailwind tooling in the project |

## Project Structure

```text
src/
  components/
    ElasticVolumeSlider.tsx   # spring-based interactive volume control
    LyricsSpotlight.tsx       # synced/plain lyric presentation
  utils/
    colorExtractor.ts         # thumbnail color sampling
    lyricsService.ts          # LRCLIB search, cleanup, scoring, parsing
  App.tsx                     # player orchestration and app state
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

### 4. Lint the codebase

```bash
npm run lint
```

## How It Works

### YouTube Playback

The app loads the YouTube IFrame API on the client, creates a main player, and also spins up a muted ambient player in the background so the visual surface can stay alive and synchronized.

### Lyrics Matching

`src/utils/lyricsService.ts` tries multiple search strategies:

1. Parse `artist + track` from the video title when possible.
2. Search with a lightly cleaned title.
3. Retry with a more aggressively cleaned fallback.

Results are then scored with preference for:

- synced lyrics
- non-instrumental tracks
- duration similarity
- available plain lyrics as a fallback

### Color Extraction

`src/utils/colorExtractor.ts` downsamples the thumbnail, filters out dull/extreme pixels, ranks vibrant candidates, and averages the strongest ones to produce a vivid accent color.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `ArrowLeft` | Seek backward 5 seconds |
| `ArrowRight` | Seek forward 5 seconds |

## Current Notes

- Skip, shuffle, and repeat icons are present as UI affordances, but track navigation is not implemented.
- Lyrics availability depends on LRCLIB coverage for the selected song.
- Thumbnail-based ambience depends on the YouTube image being accessible in the browser.

## Scripts

```json
{
  "dev": "vite",
  "build:check": "tsc -b",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

## Build Something From It

Interesting next directions if you want to keep pushing it:

- playlist support
- richer lyric synchronization controls
- saved recent tracks
- mobile gesture tuning
- theme presets driven by artwork color clusters

## License

No license file is currently included in this repository. Add one if you plan to distribute or open-source it publicly.
