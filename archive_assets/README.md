# Archived development assets

This folder stores legacy visual prototypes and old map/asset variants that are kept only for historical reference.

## What was moved here

The following development-only assets were moved out of the active `dev/` area:

- `dev/old_assets/**`
- `dev/legacy_maps_png/**`
- `dev/arcad_proto.gif`
- `dev/arcad png.png`

Inside this archive folder they now live under `archive_assets/dev/...`.

## Why these files are kept

- They help compare old and current visual style.
- They can be useful if we need to restore a removed idea from early prototypes.
- They are **not** part of the current game runtime.

## Runtime/deploy policy

- Archived files from `archive_assets/` must not be included in release web packages.
- Legacy files moved from `dev/` are also excluded from the release package by `scripts/build-web-package.sh`.
- The production package should be built from the generated `dist_web/` directory.
