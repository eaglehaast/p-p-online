(() => {
const MAP_RENDER_MODES = {
  DATA: 'data'
};
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

const EXTRA_EASY_MAPS = [
  createEasyMapDefinition('easy_safe_crossroads', 'Safe Crossroads', EASY_SAFE_CROSSROADS_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_cage_fight', 'Cage Fight', EASY_CAGE_FIGHT_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_snakes', 'Snakes', EASY_SNAKES_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_diagonal_alley', 'Diagonal Alley', EASY_DIAGONAL_ALLEY_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_pillars', 'Pillars', EASY_PILLARS_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_crab_legs', 'Crab Legs', EASY_CRAB_LEGS_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_island', 'Island', EASY_ISLAND_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_twin_walls', 'Twin Walls', EASY_TWIN_WALLS_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_broken_arrow', 'Broken Arrow', EASY_BROKEN_ARROW_INTERNAL_SPRITES),
  createEasyMapDefinition('easy_tanks_and_gaps', 'Tanks & Gaps', EASY_TANKS_AND_GAPS_INTERNAL_SPRITES)
];

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
  ...EXTRA_EASY_MAPS
];

  window.paperWingsMapsData = {
    MAP_RENDER_MODES,
    MAPS
  };
})();
