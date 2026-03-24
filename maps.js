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
const MAPS = [];
const MAPS_MANIFEST_PATH = 'ui_gamescreen/maps/manifest.json';

function normalizeImportedMapTier(rawTier){
  const normalized = typeof rawTier === 'string' ? rawTier.trim().toLowerCase() : '';
  if(normalized === 'easy'){
    return 'easy';
  }
  return 'hard';
}

async function fetchJson(path){
  if(typeof fetch !== 'function'){
    return null;
  }

  const response = await fetch(path);
  if(!response.ok){
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function loadMapManifest(){
  const parsed = await fetchJson(MAPS_MANIFEST_PATH);
  const entries = Array.isArray(parsed?.maps)
    ? parsed.maps
    : (Array.isArray(parsed) ? parsed : []);

  return entries
    .map((entry) => typeof entry === 'string' ? entry : entry?.path)
    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

async function loadMapDefinitionFromJson(path){
  try {
    const parsed = await fetchJson(path);
    const map = parsed?.map;
    if(!map || typeof map !== 'object') return null;
    if(typeof map.id !== 'string' || map.id.length === 0) return null;
    if(typeof map.name !== 'string' || map.name.length === 0) return null;

    const normalizedTier = normalizeImportedMapTier(map.tier || map.difficulty);
    return {
      ...map,
      mode: map.mode || MAP_RENDER_MODES.DATA,
      sprites: Array.isArray(map.sprites) ? map.sprites : [],
      tier: normalizedTier,
      difficulty: normalizedTier,
      flags: Array.isArray(map.flags) ? map.flags : []
    };
  } catch(error){
    console.warn('[maps] failed to load map json', { path, error });
    return null;
  }
}

async function loadMapsFromManifest(){
  try {
    const paths = await loadMapManifest();
    if(!paths.length){
      console.warn('[maps] manifest did not provide any map files', { path: MAPS_MANIFEST_PATH });
      return [];
    }

    const maps = await Promise.all(paths.map((path) => loadMapDefinitionFromJson(path)));
    return maps.filter(Boolean);
  } catch(error){
    console.warn('[maps] failed to load map manifest', { path: MAPS_MANIFEST_PATH, error });
    return [];
  }
}

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

async function initializeImportedJsonMaps(){
  const importedMaps = await loadMapsFromManifest();
  MAPS.splice(0, MAPS.length, ...importedMaps);
  window.dispatchEvent(new CustomEvent('paperWingsMapsReady', {
    detail: {
      mapsLoaded: importedMaps.length,
      manifestPath: MAPS_MANIFEST_PATH
    }
  }));
  return importedMaps;
}

window.paperWingsMapsData = {
  MAP_RENDER_MODES,
  MAPS,
  MAPS_READY: initializeImportedJsonMaps(),
  MAP_SPRITE_PATHS,
  MAP_DEFAULT_SPRITE_NAME,
  MAP_BRICK_SPRITE_PATH,
  MAPS_MANIFEST_PATH
};
})();
