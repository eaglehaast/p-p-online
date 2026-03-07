#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist_web"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT_DIR/index.html" "$DIST_DIR/"
cp "$ROOT_DIR/settings.html" "$DIST_DIR/"
cp "$ROOT_DIR/script.js" "$DIST_DIR/"
cp "$ROOT_DIR/settings.js" "$DIST_DIR/"
cp "$ROOT_DIR/maps.js" "$DIST_DIR/"
cp "$ROOT_DIR/styles.css" "$DIST_DIR/"
cp "$ROOT_DIR/favicon.ico" "$DIST_DIR/"
cp "$ROOT_DIR/letterbox2.png" "$DIST_DIR/"
cp "$ROOT_DIR/preload_animation.gif" "$DIST_DIR/"
cp "$ROOT_DIR/sprite_ copy.png" "$DIST_DIR/"
cp -R "$ROOT_DIR/ui_controlpanel" "$DIST_DIR/"
cp -R "$ROOT_DIR/ui_gamescreen" "$DIST_DIR/"
cp -R "$ROOT_DIR/ui_mainmenu" "$DIST_DIR/"

printf 'Built release web package in %s\n' "$DIST_DIR"
printf 'Excluded folders: dev/, archive_assets/, docs/, scripts/\n'
