# Level 02 Environmental VFX

Stage 02, **The Rotting Rotogravure**, has a dedicated non-gameplay VFX layer:

- `res://levels/level_02/Level02VFX.tscn`
- `res://levels/level_02/Level02VFX.gd`
- reusable effect scenes in `res://vfx/level_02/`

The layer is attached at runtime only for Stage 02. It is named `Level02VFX` and joins the `level_02_vfx` and `environmental_vfx` groups.

## What Was Added

- Black ink smoke stacks around side machinery and boss arena edges.
- Timed pipe steam bursts with cooldowns.
- Moving rotogravure roller shadows.
- Slow paper-roll rotation and paper-web flutter.
- Molten type-metal glow and furnace light.
- Ribbon-Red ink flame and editorial sparks.
- Oil-slick shimmer on side/corner areas.
- Press vibration dust and halftone ash motes.
- Dirty catwalk warning flicker.
- Red proofing mark pulses.
- A stronger Heavy-Handed Critic arena frame with smoke, proofing rings, roller shadows, cutter silhouette, furnace glow, and outer paper scraps.

The VFX sit above the seven painted map plates and below gameplay actors, attacks, pickups, and UI. Background images, stitching placement, collisions, pathing, camera bounds, gameplay, and HUD are unchanged.

## Lore Intent

Level 02 should feel like a cursed newspaper factory that never stopped printing. The presses breathe black ink, paper rolls turn like pale industrial moons, molten type glows like diseased punctuation, and Ribbon-Red ink flames crawl along machinery like angry editorial marks.

## Difference From Level 01

Level 01 is a cold morgue/archive: pale mist, surgical stillness, manuscript autopsy vapor, cabinet dust, and restrained haunted-paper ambience.

Level 02 is hot and mechanical:

- industrial ink smoke instead of morgue mist
- roller and paper-roll motion instead of archive stillness
- furnace and molten type glow instead of pale surgical light
- steam bursts and press vibration instead of delicate dust
- ribbon-red ink flame as corrupted factory pressure, not quiet correction wounds

## Tuning

`Level02VFX.gd` exposes:

- `vfx_enabled`
- `quality_mode`: `LOW`, `MEDIUM`, `HIGH`
- `particle_density`
- `ink_smoke_intensity`
- `steam_intensity`
- `furnace_glow_intensity`
- `red_ink_flame_intensity`
- `roller_motion_enabled`
- `paper_roll_motion_enabled`
- `boss_chamber_vfx_enabled`

Call `set_vfx_enabled(false)` to disable the full layer, `set_roller_motion_enabled(false)` or `set_paper_roll_motion_enabled(false)` to pause mechanical motion, and `set_boss_vfx_enabled(false)` to disable the boss chamber framing effects.

## Performance

The VFX use small Godot-native `GPUParticles2D`, `PointLight2D`, and lightweight `CanvasItem` draw calls. `LOW` quality reduces smoke and steam by at least 60%, disables minor dust/ash emitters, and keeps essential red proofing marks plus minimal boss arena framing.

