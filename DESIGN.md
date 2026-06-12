# ALVORADA — Design Direction

**One line:** *a cartographer's table at first light* — an antique hand-inked map coming
alive on a lacquered campaign desk, brass fittings catching the lamp.

Civilization's beauty is specific: the world reads as a *map that becomes terrain* —
unexplored space is literally old paper; the UI is dark furniture with metal trim that
frames the world without competing with it; iconography is era-true (scrolls, laurels,
cogs), not app-store glyphs. We build from those observations, not from dashboard
defaults.

## 1. Palette — "Cartographer's Dawn"

Six named anchors. Everything else (terrain table below) derives from them.

| Name | Hex | Role |
|---|---|---|
| **Lacquer** | `#1B2330` | Panel base — deep blue-charcoal, like a varnished map-table. All UI chrome sits on this. |
| **Brass** | `#C8A55B` | Fittings: borders, headers, active states, the end-turn plate. Used as *trim on dark*, never as fills on light. |
| **Ivory** | `#F0E7D2` | Text on Lacquer. Warm, not white. |
| **Parchment** | `#D9C49A` | The unexplored world (fog of war) and menu backdrop — diegetic paper, not page background. |
| **Sepia** | `#6A5436` | Ink on Parchment: hatching, terra-incognita sketches, fog-side text. |
| **Atlantic** | `#1E4E73` | Deep ocean; the map's dominant cool mass and the game's de-facto background color. |

Anti-cliché check: no cream-and-terracotta page design (Parchment exists only as the
*in-world* unexplored map and the menu's tabletop, never behind body text panels); no
black-with-acid-accent (Lacquer is a warm dark blue, Brass is a material, not a neon);
no broadsheet hairlines (thin lines appear only as brass fittings *on dark*).

### Terrain palette (canvas fills; ±3% per-tile seeded lightness jitter)

| Terrain | Base | Accent (speckle/edge) |
|---|---|---|
| Ocean | `#1E4E73` | `#16405F` depth mottling |
| Coast | `#2E6E94` | `#9CC4D4` foam rim along land edges |
| Grassland | `#6B8F3E` | `#7DA34C` blade speckle |
| Plains | `#B5A35C` | `#C4B26B` straw speckle |
| Desert | `#D8BD7F` | `#C3A35F` dune arcs |
| Tundra | `#9AA08B` | `#B9BCAB` frost flecks |
| Snow | `#E8EDF0` | `#C9D4DC` blue shadow |
| Hills | terrain base −8% lum | ridge arcs in accent |
| Mountain | `#8B8E96` rock | `#EFF3F6` snowcap, `#5E6168` shadow face |
| Forest | crowns `#3F6B34` / `#2F5228` | trunks `#5C4632` |
| Jungle | crowns `#2E5E40` / `#24492F` | — |

Player colors (chosen for mutual + terrain contrast): Rome `#B03A3A` crimson,
Egypt `#C2873E` ochre, Babylon `#3A62B0` lapis, Hellas `#2E8C83` aegean teal.

## 2. Type

| Role | Face | Usage |
|---|---|---|
| Display | **Cinzel** (600/700) | The Trajan-column letterform — Civ's own register. City names, panel headers, era titles, victory screens. Always letter-spaced small-caps style, usually Brass on Lacquer. |
| Body | **Alegreya Sans** (400/500/700) | Humanist warmth, excellent at 12–14px, looks inked rather than engineered. All panel copy, tooltips, buttons. |
| Numerals/utility | Alegreya Sans 700 | Yields, costs, HP. Big, unapologetic numbers next to small icons. |

Scale: 11 / 12.5 / 14 / 17 / 22 / 30px. Display never below 14px. Body line-height 1.45.
Both faces bundled via `@fontsource` — the game must look right offline.

## 3. Signature element — *Terra Incognita*

The fog of war **is the antique map**. Unexplored tiles render as Parchment with:
- a faint Sepia hex-hatch (hand-ruled feel, 12% opacity),
- sparse hand-sketched marks (compass rose, wave curls, ridge doodles — seeded, ~1 per
  40 tiles, 20% opacity — sparse enough to stay elegant),
- a **feathered torn edge** where knowledge ends: the fog layer is composited with a
  soft 8px blur so explored terrain emerges from the paper like ink soaking in.

Explored-but-not-visible tiles show real terrain under a 45% Parchment wash (a memory,
not a live view); units vanish there, cities remain as last known. Revealing tiles
cross-fades over 250ms. This single element carries the game's identity: every
screenshot reads "a map being discovered," which *is* the 4X fantasy.

Secondary signature: **chamfered brass plates.** Every panel is a Lacquer plate with
8px chamfered corners (45° clipped), a 1px Brass border, a 1px inner hairline at 25%,
and a vertical sheen gradient (+6% at top). No rounded rectangles anywhere — the chamfer
is the house shape, echoed in buttons, tooltips, the end-turn plate, and tech nodes.

## 4. The map: tactile tile rules

- **Light from the northwest.** Every hex gets a 1.5px highlight stroke on its NW edges
  (+10% lum) and a shade stroke on SE edges (−10%): the board reads as low relief, like
  pressed leather. Mountains/forests cast 1px offset shadows the same direction.
- **Seeded jitter everywhere.** Tile lightness, tree placement, ridge arcs, speckle —
  all hashed from tile coords: no two grassland tiles identical, but stable every frame.
- **Features are clustered miniatures**, not icons: forests are 4–6 layered conifer
  silhouettes; hills are 1–2 inked ridge arcs; mountains are faceted peaks with lit/shadow
  faces and snowcaps. Painterly, readable at 50% zoom.
- **Resources are tokens**: a small parchment disc, sepia ring, dark glyph (wheat sheaf,
  horse head, anvil, fish) at the tile's lower-left — Civ's "map marker" feel.
- **Borders**: 2.5px solid player-color line inset along the territory frontier over an
  8% tint of the same color; corners follow hex edges exactly (no smoothing) — crisp,
  cartographic.
- **Readability hierarchy** (always wins in this order): selection & combat previews >
  units > city banners > resources > terrain detail.

Units: 24px player-color roundel with a dark rim and a white era-true glyph (sword, bow,
spear, horse, gear, flag, eye), HP shown as an arc around the rim, fortify chevron
below. Civilians use a square-cut plate to read instantly as non-combat. Cities: a tiny
clustered settlement (roofs scale with population tier) plus a chamfered nameplate:
name in Cinzel, pop badge, production progress as a 2px brass underline.

## 5. Motion — subtle, purposeful

| Event | Motion | Spec |
|---|---|---|
| Unit move | glide tile-to-tile | 140ms/tile, ease-out quad |
| Combat | attacker lunge 30% toward target + back; floating damage numeral | 220ms; numeral rises 24px / 600ms fade |
| Fog reveal | parchment cross-fade | 250ms |
| Panel open | slide + fade 12px | 180ms cubic-bezier(.2,.7,.3,1) |
| Toast | slide from right, auto-dismiss | 180ms in / 6s hold |
| Selection | breathing ring | 1.6s sine, ±15% alpha — the only idle motion |
| End turn ready | single brass sheen sweep | 800ms, once per state change |

Nothing loops idly except the selection ring; nothing bounces; nothing moves that didn't
change. AI moves inside your vision animate at the same 140ms so the world feels
inhabited; outside vision they resolve instantly.

## 6. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR: science ▸ culture ▸ gold (+/turn) │ TURN 47 · era │ ☰ │  44px Lacquer plate
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     THE MAP (canvas, full-bleed)             │
│  [city panel slides       [tile info plate]                  │
│   in from left]                          [toasts stack right]│
│                                                              │
│ ┌unit plate┐                            ┌ END TURN  plate ┐  │
│ │glyph name│                            │ (state-aware)   │  │
│ │HP MP acts│                            ├ minimap ────────┤  │
│ └──────────┘                            └─────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

The map is never chrome-boxed: panels float over it on shadows, the world bleeds to all
four edges. Tech tree and menus are full-screen overlays on 70% Lacquer scrim — stepping
"into the study" — with the tree drawn as plates linked by brass conduits, era columns
titled in Cinzel.

Iconography: one 16px stroke-icon set, 2px rounded stroke, era-true metaphors — wheat
(food), cog (production), scroll (science), amphora (culture), coin (gold), laurel
(score), crossed swords (war). No emoji, no mixed icon families.

Sound: out of scope for v1 (noted as extension; the visual language must carry mood alone).
