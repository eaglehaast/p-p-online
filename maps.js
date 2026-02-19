(() => {
const MAP_RENDER_MODES = {
  DATA: 'data'
};
const MAP_DEFAULT_SPRITE_NAME = 'brick_1_default';
const MAP_BRICK_SPRITE_PATH = 'ui_gamescreen/bricks/brick_1_default.png';
const MAP_FALLBACK_SPRITE_PATHS = Object.freeze({
  brick_1_default: 'ui_gamescreen/bricks/brick_1_default.png',
  brick_3_mini: 'ui_gamescreen/bricks/brick_3_mini.png',
  brick_5_corner: 'ui_gamescreen/bricks/brick_5_corner.png',
  brick_4: 'ui_gamescreen/bricks/brick4_diagonal copy.png',
  brick_4_diagonal: 'ui_gamescreen/bricks/brick4_diagonal copy.png'
});
const CLEAR_SKY_VERTICAL_Y = [20,60,100,140,180,220,260,300,340,380,420,460,500,540,580];
const CLEAR_SKY_HORIZONTAL_X = [0,40,80,120,160,200,240,280,320];
const CLEAR_SKY_BORDER_SPRITES = [
  ...CLEAR_SKY_VERTICAL_Y.map(y => ({ spriteName: "brick_1_default", x: 0, y, rotate: 0, scale: 1 })),
  ...CLEAR_SKY_VERTICAL_Y.map(y => ({ spriteName: "brick_1_default", x: 340, y, rotate: 0, scale: 1 })),
  ...CLEAR_SKY_HORIZONTAL_X.map(x => ({ spriteName: "brick_1_default", x, y: 0, rotate: -90, scale: -1 })),
  ...CLEAR_SKY_HORIZONTAL_X.map(x => ({ spriteName: "brick_1_default", x, y: 620, rotate: -90, scale: -1 })),
];

const BROKEN_X_SPRITES = [
  { id: "brick_v_left_1", spriteName: "brick_1_default", x: 0, y: 20, rotate: 0, scale: 1 },
  { id: "brick_v_left_2", spriteName: "brick_1_default", x: 0, y: 60, rotate: 0, scale: 1 },
  { id: "brick_v_left_3", spriteName: "brick_1_default", x: 0, y: 100, rotate: 0, scale: 1 },
  { id: "brick_v_left_4", spriteName: "brick_1_default", x: 0, y: 140, rotate: 0, scale: 1 },
  { id: "brick_v_left_5", spriteName: "brick_1_default", x: 0, y: 180, rotate: 0, scale: 1 },
  { id: "brick_v_left_6", spriteName: "brick_1_default", x: 0, y: 220, rotate: 0, scale: 1 },
  { id: "brick_v_left_7", spriteName: "brick_1_default", x: 0, y: 260, rotate: 0, scale: 1 },
  { id: "brick_v_left_8", spriteName: "brick_1_default", x: 0, y: 300, rotate: 0, scale: 1 },
  { id: "brick_v_left_9", spriteName: "brick_1_default", x: 0, y: 340, rotate: 0, scale: 1 },
  { id: "brick_v_left_10", spriteName: "brick_1_default", x: 0, y: 380, rotate: 0, scale: 1 },
  { id: "brick_v_left_11", spriteName: "brick_1_default", x: 0, y: 420, rotate: 0, scale: 1 },
  { id: "brick_v_left_12", spriteName: "brick_1_default", x: 0, y: 460, rotate: 0, scale: 1 },
  { id: "brick_v_left_13", spriteName: "brick_1_default", x: 0, y: 500, rotate: 0, scale: 1 },
  { id: "brick_v_left_14", spriteName: "brick_1_default", x: 0, y: 540, rotate: 0, scale: 1 },
  { id: "brick_v_left_15", spriteName: "brick_1_default", x: 0, y: 580, rotate: 0, scale: 1 },
  { id: "brick_v_right_1", spriteName: "brick_1_default", x: 340, y: 20, rotate: 0, scale: 1 },
  { id: "brick_v_right_2", spriteName: "brick_1_default", x: 340, y: 60, rotate: 0, scale: 1 },
  { id: "brick_v_right_3", spriteName: "brick_1_default", x: 340, y: 100, rotate: 0, scale: 1 },
  { id: "brick_v_right_4", spriteName: "brick_1_default", x: 340, y: 140, rotate: 0, scale: 1 },
  { id: "brick_v_right_5", spriteName: "brick_1_default", x: 340, y: 180, rotate: 0, scale: 1 },
  { id: "brick_v_right_6", spriteName: "brick_1_default", x: 340, y: 220, rotate: 0, scale: 1 },
  { id: "brick_v_right_7", spriteName: "brick_1_default", x: 340, y: 260, rotate: 0, scale: 1 },
  { id: "brick_v_right_8", spriteName: "brick_1_default", x: 340, y: 300, rotate: 0, scale: 1 },
  { id: "brick_v_right_9", spriteName: "brick_1_default", x: 340, y: 340, rotate: 0, scale: 1 },
  { id: "brick_v_right_10", spriteName: "brick_1_default", x: 340, y: 380, rotate: 0, scale: 1 },
  { id: "brick_v_right_11", spriteName: "brick_1_default", x: 340, y: 420, rotate: 0, scale: 1 },
  { id: "brick_v_right_12", spriteName: "brick_1_default", x: 340, y: 460, rotate: 0, scale: 1 },
  { id: "brick_v_right_13", spriteName: "brick_1_default", x: 340, y: 500, rotate: 0, scale: 1 },
  { id: "brick_v_right_14", spriteName: "brick_1_default", x: 340, y: 540, rotate: 0, scale: 1 },
  { id: "brick_v_right_15", spriteName: "brick_1_default", x: 340, y: 580, rotate: 0, scale: 1 },
  { id: "brick_h_top_01", spriteName: "brick_1_default", x: 0, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_02", spriteName: "brick_1_default", x: 40, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_03", spriteName: "brick_1_default", x: 80, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_04", spriteName: "brick_1_default", x: 120, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_05", spriteName: "brick_1_default", x: 160, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_06", spriteName: "brick_1_default", x: 200, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_07", spriteName: "brick_1_default", x: 240, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_08", spriteName: "brick_1_default", x: 280, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_09", spriteName: "brick_1_default", x: 320, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_01", spriteName: "brick_1_default", x: 0, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_02", spriteName: "brick_1_default", x: 40, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_03", spriteName: "brick_1_default", x: 80, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_04", spriteName: "brick_1_default", x: 120, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_05", spriteName: "brick_1_default", x: 160, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_06", spriteName: "brick_1_default", x: 200, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_07", spriteName: "brick_1_default", x: 240, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_08", spriteName: "brick_1_default", x: 280, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_09", spriteName: "brick_1_default", x: 320, y: 620, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 160, y: 120, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 60, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 260, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 60, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 260, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 160, y: 500, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 140, y: 280, rotate: 0, scale: 1 },
  { id: "brick1", spriteName: "brick_1_default", x: 200, y: 320, rotate: 0, scale: 1 },
  { id: "brick_4_diagonal", spriteName: "brick_4_diagonal", x: 100, y: 220, rotate: 0, scale: 1 },
  { id: "brick_4_diagonal", spriteName: "brick_4_diagonal", x: 200, y: 360, rotate: 0, scale: 1 },
  { id: "brick_4_diagonal", spriteName: "brick_4_diagonal", x: 200, y: 220, rotate: 0, scaleX: -1 },
  { id: "brick_4_diagonal", spriteName: "brick_4_diagonal", x: 100, y: 360, rotate: 0, scaleX: -1 }
];

const FIVE_BRICKS_SPRITES = [
  { id: "brick_v_left_1", spriteName: "brick_1_default", x: 0, y: 20, rotate: 0, scale: 1 },
  { id: "brick_v_left_2", spriteName: "brick_1_default", x: 0, y: 60, rotate: 0, scale: 1 },
  { id: "brick_v_left_3", spriteName: "brick_1_default", x: 0, y: 100, rotate: 0, scale: 1 },
  { id: "brick_v_left_4", spriteName: "brick_1_default", x: 0, y: 140, rotate: 0, scale: 1 },
  { id: "brick_v_left_5", spriteName: "brick_1_default", x: 0, y: 180, rotate: 0, scale: 1 },
  { id: "brick_v_left_6", spriteName: "brick_1_default", x: 0, y: 220, rotate: 0, scale: 1 },
  { id: "brick_v_left_7", spriteName: "brick_1_default", x: 0, y: 260, rotate: 0, scale: 1 },
  { id: "brick_v_left_8", spriteName: "brick_1_default", x: 0, y: 300, rotate: 0, scale: 1 },
  { id: "brick_v_left_9", spriteName: "brick_1_default", x: 0, y: 340, rotate: 0, scale: 1 },
  { id: "brick_v_left_10", spriteName: "brick_1_default", x: 0, y: 380, rotate: 0, scale: 1 },
  { id: "brick_v_left_11", spriteName: "brick_1_default", x: 0, y: 420, rotate: 0, scale: 1 },
  { id: "brick_v_left_12", spriteName: "brick_1_default", x: 0, y: 460, rotate: 0, scale: 1 },
  { id: "brick_v_left_13", spriteName: "brick_1_default", x: 0, y: 500, rotate: 0, scale: 1 },
  { id: "brick_v_left_14", spriteName: "brick_1_default", x: 0, y: 540, rotate: 0, scale: 1 },
  { id: "brick_v_left_15", spriteName: "brick_1_default", x: 0, y: 580, rotate: 0, scale: 1 },
  { id: "brick_v_right_1", spriteName: "brick_1_default", x: 340, y: 20, rotate: 0, scale: 1 },
  { id: "brick_v_right_2", spriteName: "brick_1_default", x: 340, y: 60, rotate: 0, scale: 1 },
  { id: "brick_v_right_3", spriteName: "brick_1_default", x: 340, y: 100, rotate: 0, scale: 1 },
  { id: "brick_v_right_4", spriteName: "brick_1_default", x: 340, y: 140, rotate: 0, scale: 1 },
  { id: "brick_v_right_5", spriteName: "brick_1_default", x: 340, y: 180, rotate: 0, scale: 1 },
  { id: "brick_v_right_6", spriteName: "brick_1_default", x: 340, y: 220, rotate: 0, scale: 1 },
  { id: "brick_v_right_7", spriteName: "brick_1_default", x: 340, y: 260, rotate: 0, scale: 1 },
  { id: "brick_v_right_8", spriteName: "brick_1_default", x: 340, y: 300, rotate: 0, scale: 1 },
  { id: "brick_v_right_9", spriteName: "brick_1_default", x: 340, y: 340, rotate: 0, scale: 1 },
  { id: "brick_v_right_10", spriteName: "brick_1_default", x: 340, y: 380, rotate: 0, scale: 1 },
  { id: "brick_v_right_11", spriteName: "brick_1_default", x: 340, y: 420, rotate: 0, scale: 1 },
  { id: "brick_v_right_12", spriteName: "brick_1_default", x: 340, y: 460, rotate: 0, scale: 1 },
  { id: "brick_v_right_13", spriteName: "brick_1_default", x: 340, y: 500, rotate: 0, scale: 1 },
  { id: "brick_v_right_14", spriteName: "brick_1_default", x: 340, y: 540, rotate: 0, scale: 1 },
  { id: "brick_v_right_15", spriteName: "brick_1_default", x: 340, y: 580, rotate: 0, scale: 1 },
  { id: "brick_h_top_01", spriteName: "brick_1_default", x: 0, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_02", spriteName: "brick_1_default", x: 40, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_03", spriteName: "brick_1_default", x: 80, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_04", spriteName: "brick_1_default", x: 120, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_05", spriteName: "brick_1_default", x: 160, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_06", spriteName: "brick_1_default", x: 200, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_07", spriteName: "brick_1_default", x: 240, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_08", spriteName: "brick_1_default", x: 280, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_09", spriteName: "brick_1_default", x: 320, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_01", spriteName: "brick_1_default", x: 0, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_02", spriteName: "brick_1_default", x: 40, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_03", spriteName: "brick_1_default", x: 80, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_04", spriteName: "brick_1_default", x: 120, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_05", spriteName: "brick_1_default", x: 160, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_06", spriteName: "brick_1_default", x: 200, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_07", spriteName: "brick_1_default", x: 240, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_08", spriteName: "brick_1_default", x: 280, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_09", spriteName: "brick_1_default", x: 320, y: 620, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 80, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 120, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 200, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 240, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 140, y: 310, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 180, y: 310, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 80, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 120, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 200, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 240, y: 400, rotate: -90, scale: -1 }
];

const FIVE_BRICKS_FLAGS = [
  { color: "blue", x: 170, y: 41, width: 20, height: 20 },
  { color: "green", x: 170, y: 568, width: 20, height: 20 }
];

const BROKEN_X_FLAGS = [
  { color: "blue", x: 170, y: 41, width: 20, height: 20 },
  { color: "green", x: 170, y: 568, width: 20, height: 20 }
];

const EASY_MAP_DEFAULT_FLAGS = [
  { color: "blue", x: 170, y: 41, width: 20, height: 20 },
  { color: "green", x: 170, y: 568, width: 20, height: 20 }
];

const EASY_SAFE_CROSSROADS_INTERNAL_SPRITES = [
  { spriteName: "brick_1_default", x: 100, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 140, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 260, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 220, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 340, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 380, rotate: -90, scale: -1 }
];

const EASY_CAGE_FIGHT_INTERNAL_SPRITES = [
  { spriteName: "brick_1_default", x: 60, y: 80, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 120, y: 80, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 80, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 80, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 300, y: 80, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 60, y: 540, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 120, y: 540, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 540, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 540, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 300, y: 540, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 160, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 200, y: 300, rotate: -90, scale: -1 }
];

const EASY_SNAKES_INTERNAL_SPRITES = [
  { spriteName: "brick_1_default", x: 100, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 100, y: 280, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 120, y: 280, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 120, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 380, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 360, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 360, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 340, rotate: -90, scale: -1 }
];

const EASY_DIAGONAL_ALLEY_INTERNAL_SPRITES = [
  { spriteName: "brick_4_diagonal", x: 100, y: 220, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 120, y: 240, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 140, y: 260, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 160, y: 280, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 200, y: 280, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 220, y: 260, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 240, y: 240, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 260, y: 220, rotate: 0, scale: 1, scaleX: 1 }
];

const EASY_PILLARS_INTERNAL_SPRITES = [
  { spriteName: "brick_1_default", x: 100, y: 280, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 140, y: 280, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 280, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 280, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 260, y: 280, rotate: -90, scale: -1 }
];

const EASY_CRAB_LEGS_INTERNAL_SPRITES = [
  { spriteName: "brick_1_default", x: 60, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 60, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 60, y: 340, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 280, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 280, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 280, y: 340, rotate: -90, scale: -1 }
];

const EASY_ISLAND_INTERNAL_SPRITES = [
  { spriteName: "brick_1_default", x: 140, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 140, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 140, y: 340, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 340, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 340, rotate: -90, scale: -1 }
];

const EASY_TWIN_WALLS_INTERNAL_SPRITES = [
  { spriteName: "brick_1_default", x: 60, y: 240, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 100, y: 240, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 140, y: 240, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 240, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 240, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 260, y: 240, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 300, y: 240, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 60, y: 360, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 100, y: 360, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 140, y: 360, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 180, y: 360, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 220, y: 360, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 260, y: 360, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 300, y: 360, rotate: -90, scale: -1 }
];

const EASY_BROKEN_ARROW_INTERNAL_SPRITES = [
  { spriteName: "brick_4_diagonal", x: 100, y: 220, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 200, y: 220, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_1_default", x: 60, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 300, y: 260, rotate: -90, scale: -1 },
  { spriteName: "brick_4_diagonal", x: 100, y: 360, rotate: 0, scale: 1, scaleX: 1 },
  { spriteName: "brick_4_diagonal", x: 200, y: 360, rotate: 0, scale: 1, scaleX: 1 }
];

const EASY_TANKS_AND_GAPS_INTERNAL_SPRITES = [
  { spriteName: "brick_1_default", x: 100, y: 280, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 100, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 100, y: 320, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 280, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 300, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 320, rotate: -90, scale: -1 }
];

const WEAK_BRICK_SPRITES = [
  { spriteName: "brick_1_default", x: 0, y: 20 },
  { spriteName: "brick_1_default", x: 0, y: 60 },
  { spriteName: "brick_1_default", x: 0, y: 100 },
  { spriteName: "brick_1_default", x: 0, y: 140 },
  { spriteName: "brick_1_default", x: 0, y: 180 },
  { spriteName: "brick_1_default", x: 0, y: 220 },
  { spriteName: "brick_1_default", x: 0, y: 260 },
  { spriteName: "brick_1_default", x: 0, y: 300 },
  { spriteName: "brick_1_default", x: 0, y: 340 },
  { spriteName: "brick_1_default", x: 0, y: 380 },
  { spriteName: "brick_1_default", x: 0, y: 420 },
  { spriteName: "brick_1_default", x: 0, y: 460 },
  { spriteName: "brick_1_default", x: 0, y: 500 },
  { spriteName: "brick_1_default", x: 0, y: 540 },
  { spriteName: "brick_1_default", x: 0, y: 580 },
  { spriteName: "brick_1_default", x: 340, y: 20 },
  { spriteName: "brick_1_default", x: 340, y: 60 },
  { spriteName: "brick_1_default", x: 340, y: 100 },
  { spriteName: "brick_1_default", x: 340, y: 140 },
  { spriteName: "brick_1_default", x: 340, y: 180 },
  { spriteName: "brick_1_default", x: 340, y: 220 },
  { spriteName: "brick_1_default", x: 340, y: 260 },
  { spriteName: "brick_1_default", x: 340, y: 300 },
  { spriteName: "brick_1_default", x: 340, y: 340 },
  { spriteName: "brick_1_default", x: 340, y: 380 },
  { spriteName: "brick_1_default", x: 340, y: 420 },
  { spriteName: "brick_1_default", x: 340, y: 460 },
  { spriteName: "brick_1_default", x: 340, y: 500 },
  { spriteName: "brick_1_default", x: 340, y: 540 },
  { spriteName: "brick_1_default", x: 340, y: 580 },
  { spriteName: "brick_1_default", x: 0, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 40, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 80, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 120, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 160, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 200, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 280, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 320, y: 0, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 0, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 40, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 80, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 120, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 160, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 200, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 240, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 280, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_1_default", x: 320, y: 620, rotate: -90, scale: -1 },
  { spriteName: "brick_3_mini", x: 320, y: 520 },
  { spriteName: "brick_3_mini", x: 260, y: 520 },
  { spriteName: "brick_5_corner", x: 140, y: 520, rotate: 270 },
  { spriteName: "brick_5_corner", x: 180, y: 520 },
  { spriteName: "brick_3_mini", x: 80, y: 520 },
  { spriteName: "brick_3_mini", x: 20, y: 520 },
  { spriteName: "brick_5_corner", x: 140, y: 60, rotate: 180 },
  { spriteName: "brick_5_corner", x: 180, y: 60, rotate: 90 },
  { spriteName: "brick_3_mini", x: 320, y: 80 },
  { spriteName: "brick_3_mini", x: 20, y: 80 },
  { spriteName: "brick_3_mini", x: 260, y: 80 },
  { spriteName: "brick_3_mini", x: 80, y: 80 }
];

const WEAK_BRICK_FLAGS = [
  {
    id: "blue-0",
    color: "blue",
    layout: {
      x: 170,
      y: 41,
      width: 20,
      height: 20
    }
  },
  {
    id: "green-1",
    color: "green",
    layout: {
      x: 170,
      y: 568,
      width: 20,
      height: 20
    }
  }
];

function buildEasyMapSprites(internalSprites = []){
  return [...CLEAR_SKY_BORDER_SPRITES, ...internalSprites];
}

function buildEasyMapFlags(){
  return EASY_MAP_DEFAULT_FLAGS.map(flag => ({ ...flag }));
}

function createEasyMapDefinition(id, name, internalSprites){
  return {
    id,
    name,
    mode: MAP_RENDER_MODES.DATA,
    sprites: buildEasyMapSprites(internalSprites),
    tier: 'easy',
    flags: buildEasyMapFlags()
  };
}

const MAPS = [
  {
    id: 'clearSky',
    name: 'Clear Sky',
    mode: MAP_RENDER_MODES.DATA,
    sprites: CLEAR_SKY_BORDER_SPRITES,
    tier: 'easy'
  },
  {
    id: 'fiveBricks',
    name: 'fiveBricks',
    mode: MAP_RENDER_MODES.DATA,
    sprites: FIVE_BRICKS_SPRITES,
    tier: 'easy',
    flags: FIVE_BRICKS_FLAGS
  },
  {
    id: 'brokenX',
    name: 'brokenX',
    mode: MAP_RENDER_MODES.DATA,
    sprites: BROKEN_X_SPRITES,
    tier: 'easy',
    flags: BROKEN_X_FLAGS
  },
  {
    id: 'clearSky',
    name: 'Weak brick',
    mode: MAP_RENDER_MODES.DATA,
    tier: 'easy',
    difficulty: 'easy',
    sprites: WEAK_BRICK_SPRITES,
    flags: WEAK_BRICK_FLAGS
  }
];

function collectMapSpritePathsFromSidebar(){
  const sidebarEntries = Array.from(document.querySelectorAll('[data-brick-sprite]'))
    .map((element) => {
      const spriteName = element.dataset?.brickSprite;
      const spritePath = element.getAttribute('src');
      if(typeof spriteName !== 'string' || spriteName.length === 0) return null;
      if(typeof spritePath !== 'string' || spritePath.length === 0) return null;
      return [spriteName, spritePath];
    })
    .filter(Boolean);

  const fromSidebar = Object.fromEntries(sidebarEntries);
  const withFallbacks = {
    ...MAP_FALLBACK_SPRITE_PATHS,
    ...fromSidebar
  };

  if(!withFallbacks[MAP_DEFAULT_SPRITE_NAME]){
    withFallbacks[MAP_DEFAULT_SPRITE_NAME] = MAP_BRICK_SPRITE_PATH;
  }

  return withFallbacks;
}

const MAP_SPRITE_PATHS = Object.freeze(collectMapSpritePathsFromSidebar());

  window.paperWingsMapsData = {
    MAP_RENDER_MODES,
    MAPS,
    MAP_SPRITE_PATHS,
    MAP_DEFAULT_SPRITE_NAME,
    MAP_BRICK_SPRITE_PATH
  };
})();
