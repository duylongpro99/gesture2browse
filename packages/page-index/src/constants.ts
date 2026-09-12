/**
 * Spatial tunables owned by page-index (arch §5, G6 MOCK 2026-09-12). These are
 * *spatial* parameters (px / pointer-speed), not gesture timing — gesture timing
 * lives only in gesture-core (CLAUDE.md §2). Values are MOCK defaults; final
 * values come from owner tuning / the Fitts replay (roadmap §2.1).
 */

/** Snap radius in CSS px (G6 MOCK = 40; `0` disables snapping). */
export const SNAP_RADIUS_PX = 40;

/**
 * Pointer speed above which snapping is suppressed (radius → 0), so a fast
 * traverse across the page does not stick to every target it flies over.
 * Units match the `speed` passed to `Snapper.snap` (px per pointer sample).
 */
export const SNAP_SPEED_CUTOFF = 2.5;

/**
 * Neighbour-switch margin in CSS px: extra distance a competing target must beat
 * the current target by before the snap switches. This is the "neighbour
 * hysteresis" tunable (roadmap §4.3), a spatial px margin — not a gesture-timing
 * value — so it lives here in page-index, not gesture-core.
 */
export const SNAP_NEIGHBOUR_MARGIN_PX = 12;
