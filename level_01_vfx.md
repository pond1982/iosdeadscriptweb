# Level 01 Environmental VFX

Stage 01, **The Morgue of Deleted Scenes**, now has a dedicated non-gameplay VFX layer:

- `res://levels/level_01/Level01VFX.tscn`
- `res://levels/level_01/Level01VFX.gd`
- reusable effect scenes in `res://vfx/level_01/`

The layer is attached at runtime only for Stage 01. It is named `Level01VFX` and joins the `level_01_vfx` and `environmental_vfx` groups.

## What Was Added

- Cold blue-gray floor mist along room edges and void-adjacent sections.
- Slow black ink seep/ripple effects near existing stains and encounter scars.
- Thin Ribbon-Red correction pulses on encounter circles, rest marks, bridge threads, and the boss arena.
- Rejected page motes and cabinet dust near archive/filing-room edges.
- Toe-tag and hanging manuscript-strip flutter.
- Pale vapor around autopsy slab areas.
- Weak amber archive lamp flicker.
- Stronger but still restrained Redactionist chamber aura around arena edges.

All VFX sit above the painted map plates and below actors, enemies, attacks, pickups, and UI. The painted map art, collisions, pathing, camera bounds, gameplay, and HUD are unchanged.

## Lore Intent

Level 01 should feel like a cold archive trying to proofread itself back into existence. Black ink moves like rot under stone, Ribbon-Red pulses like editorial wounds, pages drift like rejected memory, and lamps flicker like dead filing rooms.

## Difference From Level 02

Level 02 is the industrial Rotogravure: paper rolls, press machinery, black ink smoke, ribbon-red flame, molten/factory energy, and heavy mechanical motion.

Level 01 avoids that identity. Its VFX are quiet, surgical, archival, and gothic-noir:

- no printing-press motion
- no large paper-roll effects
- no furnace glow as the main palette
- no industrial steam atmosphere
- no hazard-light color identity
- no loud mechanical animation

## Tuning

`Level01VFX.gd` exposes:

- `vfx_enabled`
- `quality_mode`: `LOW`, `MEDIUM`, `HIGH`
- `particle_density`
- `mist_opacity`
- `ink_ripple_intensity`
- `red_correction_intensity`
- `lamp_flicker_enabled`
- `boss_chamber_vfx_enabled`

Call `set_vfx_enabled(false)` to disable the full layer, or `set_boss_vfx_enabled(false)` to disable only boss-chamber effects.

## Performance

The VFX use small Godot-native `GPUParticles2D`, `PointLight2D`, and lightweight draw calls. `LOW` quality disables minor dust/flutter effects and reduces mist/page particle counts. Encounter circle pulses remain visible because they support the map’s editorial-scar identity.

