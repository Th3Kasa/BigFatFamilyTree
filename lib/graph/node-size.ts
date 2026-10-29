/**
 * Size of a person card on the tree, and the spacing the layout keeps between
 * cards. Shared by the layout, the edge geometry and the PersonNode itself, so
 * lines always meet the cards exactly and auto-layout never overlaps cards.
 */
export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 128;

/** Horizontal gap between partners in a couple (room for the marriage label). */
export const PARTNER_GAP = 80;
/** Horizontal gap between siblings / neighbouring family units. */
export const SIBLING_GAP = 40;
/** Extra gap between the children of different marriages, and between separate trees. */
export const GROUP_GAP = 72;
/** Vertical gap between generations (room for brackets and low marriage lanes). */
export const ROW_GAP = 120;
/** Vertical step between stacked "low" marriage lines under a row. */
export const LANE_STEP = 16;
