/**
 * Lyrics service – fetches synced lyrics from LRCLIB with robust fallback strategies.
 *
 * Search order:
 *  1. Artist + Track (structured)
 *  2. Lightly-cleaned raw title (preserves non-English scripts)
 *  3. Heavily-cleaned title (fallback)
 *
 * Duration is used only as a soft preference signal, never as a hard filter,
 * because YouTube "Lyric Video" / "Full Video" durations often differ from
 * the album version stored in LRCLIB.
 */

export interface LrcLine {
  time: number
  text: string
}

interface LrcLibResult {
  id: number
  trackName: string
  artistName: string
  plainLyrics: string
  syncedLyrics: string
  instrumental: boolean
  duration: number
}

// ─── Helpers ─────────────────────────────────────────

/**
 * Try to extract Artist / Track from common YouTube title formats:
 *   "Artist - Track (Official Video)"
 *   "Track - Artist"
 *   "Artist - Track | Album | Extra Info"
 *
 * We strip pipe-separated extras BEFORE splitting on " - " so that
 * "Jab Tu Sajan - Lyric Video | Aap Jaisa Koi | …" correctly becomes
 * artist=null (because "Lyric Video" is not a real track name).
 */
export function parseVideoTitle(title: string): { artist: string | null; track: string | null } {
  // Step 1: Remove parenthetical/bracketed junk
  let cleaned = title
    .replace(/\(.*?(official|video|audio|lyric|hd|4k|full|song|mv|from).*?\)/gi, '')
    .replace(/\[.*?(official|video|audio|lyric|hd|4k|full|song|mv|from).*?\]/gi, '')

  // Step 2: Remove pipe-separated metadata chunks
  // "Track - Lyric Video | Album | Actor | Composer" → "Track"
  cleaned = cleaned.replace(/\|.*/g, '').trim()

  // Step 3: Try to split on common separators
  const separators = [' - ', ' – ', ' — ', ' : ']
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const parts = cleaned.split(sep).map(p => p.trim()).filter(Boolean)
      if (parts.length >= 2) {
        // Quick heuristic: if part[1] looks like junk (e.g. "Lyric Video"), skip
        const junkPattern = /^(lyric|official|full|audio|video|music)\s*(video|audio|song|mv)?$/i
        if (junkPattern.test(parts[1])) {
          // Only the track name is usable
          return { artist: null, track: parts[0] }
        }
        return { artist: parts[0], track: parts[1] }
      }
    }
  }

  return { artist: null, track: null }
}

/** Light clean: remove only "Official Video" / "Lyric Video" labels + pipe-separated extras */
function lightClean(raw: string): string {
  return raw
    .replace(/\(.*?(official|video|audio|lyric|hd|4k|full|song|mv|from).*?\)/gi, '')
    .replace(/\[.*?(official|video|audio|lyric|hd|4k|full|song|mv|from).*?\]/gi, '')
    .replace(/\|.*/g, '')
    .replace(/[\-–—]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Heavy clean: aggressively strip everything non-essential */
function heavyClean(raw: string): string {
  return raw
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\|.*/g, '')
    .replace(/official\s*(music)?\s*video/gi, '')
    .replace(/\blyrics?\b/gi, '')
    .replace(/\bhd\b|\b4k\b|\bfull\s*video\b/gi, '')
    .replace(/\bft\.?\s*/gi, '')
    .replace(/\bfeat\.?\s*/gi, '')
    .replace(/[\-–—]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Parse LRC timestamp string into lines */
export function parseSyncedLyrics(raw: string): LrcLine[] {
  const lines: LrcLine[] = []
  for (const line of raw.split('\n')) {
    const match = line.match(/^\[(\d{2}):(\d{2}\.\d{2})\]\s*(.*)/)
    if (match) {
      const mins = parseInt(match[1], 10)
      const secs = parseFloat(match[2])
      const text = match[3].trim()
      if (text) lines.push({ time: mins * 60 + secs, text })
    }
  }
  return lines
}

// ─── Fetch helper (silent failures) ──────────────────

async function searchLrcLib(params: Record<string, string>): Promise<LrcLibResult[]> {
  try {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`https://lrclib.net/api/search?${qs}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─── Main Search Logic ───────────────────────────────

export async function fetchLyrics(
  videoTitle: string,
  videoDuration?: number
): Promise<{ plain: string | null; synced: LrcLine[] }> {

  const pool: LrcLibResult[] = []

  // Strategy 1: Artist + Track (structured search)
  const { artist, track } = parseVideoTitle(videoTitle)
  if (artist && track) {
    const r1 = await searchLrcLib({ artist_name: artist, track_name: track })
    pool.push(...r1)
  } else if (track) {
    // We extracted a track name but no artist
    const r1b = await searchLrcLib({ track_name: track })
    pool.push(...r1b)
  }

  // Strategy 2: Light-cleaned raw title (preserves non-English scripts)
  const light = lightClean(videoTitle)
  if (light) {
    const r2 = await searchLrcLib({ q: light })
    pool.push(...r2)
  }

  // Strategy 3: Heavy-cleaned title (fallback)
  const heavy = heavyClean(videoTitle)
  if (heavy && heavy !== light) {
    const r3 = await searchLrcLib({ q: heavy })
    pool.push(...r3)
  }

  // ─── Filtering & Scoring ────────────────────────────

  if (pool.length === 0) {
    return { plain: null, synced: [] }
  }

  // Deduplicate by ID
  const seen = new Set<number>()
  let candidates = pool.filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })

  // Remove instrumentals
  candidates = candidates.filter(r => !r.instrumental)

  if (candidates.length === 0) {
    return { plain: null, synced: [] }
  }

  // Score each candidate (higher = better)
  const scored = candidates.map(r => {
    let score = 0

    // +10 for having synced lyrics
    if (r.syncedLyrics) score += 10

    // +5 for duration within ±4s  (soft preference, not a hard filter)
    // +2 for duration within ±15s
    if (videoDuration && videoDuration > 0) {
      const diff = Math.abs(r.duration - videoDuration)
      if (diff < 4) score += 5
      else if (diff < 15) score += 2
    }

    // +1 for having plain lyrics (tiebreaker)
    if (r.plainLyrics) score += 1

    return { result: r, score }
  })

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0].result

  return {
    plain: best.plainLyrics || null,
    synced: best.syncedLyrics ? parseSyncedLyrics(best.syncedLyrics) : [],
  }
}
