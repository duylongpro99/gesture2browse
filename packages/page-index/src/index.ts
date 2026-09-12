export { SpatialGrid, type Bbox } from './grid.js';
export { INTERACTABLE_SELECTOR, isVisible, roleOf, nameOf } from './selectors.js';
export {
  createInteractableIndex,
  type InteractableIndex,
  type InteractableIndexOptions,
  type IndexEntry,
} from './interactable-index.js';
export { SNAP_RADIUS_PX, SNAP_SPEED_CUTOFF, SNAP_NEIGHBOUR_MARGIN_PX } from './constants.js';
export {
  createSnapper,
  type Snapper,
  type SnapperOptions,
  type SnapResult,
} from './snapping.js';
