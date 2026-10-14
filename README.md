# Cobblemon Eternal Platinum Pokédex

Static Pokédex for the Grunion Games Cobblemon Eternal Platinum modpack. No
frameworks, no build tools — plain HTML/CSS/JS that deploys directly to
Cloudflare Pages.

## Pages

- **Pokédex** (`#/`) — the dex grid with a single-type filter, and per-Pokémon
  entries (forms as tabs, evolution branch trees, sortable move tables).
- **Battle changes** (`#/battle-changes`) — type effectiveness changes vs the
  base games (computed from the mod's typechart overrides) plus the list of
  custom abilities, each linking to its own page.
- **Ability pages** (`#/ability/<id>`) — effect text and every Pokédex
  entry/form that has the ability. Custom ability names on Pokédex pages and
  in the search bar link here too.

The search bar finds both Pokémon (name/slug/dex number) and custom abilities,
and clears itself whenever you navigate to a new page.

## Updating data from the mod

Data is exported from the mod's own JSON files, so the site never drifts from
gameplay reality:

1. `node _pokedex_moves_dump.js > _pokedex_moves.json` (only when moves/abilities change)
2. `python _pokedex_export.py` — exports the first 351 eternal dex entries
   (`--all` for all 700, `--count N` for the first N, `--only raichu tauros` for
   specific slugs)

Both scripts live in the parent `Fabric Mods` folder. They read:

| Source | Provides |
|---|---|
| `cobblemon 1.8/.../Cobblemon-fabric-1.8.1+1.21.1.jar` | vanilla species data, lang text |
| `cobblemon 1.8/megashowdown/...jar` | standard mega species files + form additions |
| `ggquest/src/main/resources` | species overrides, custom species, custom megas/forms, lang, typechart overrides |
| `mega showdown extraction/.../showdown` | move stats (power/accuracy/PP/category) |
| `Pokedex FInal/GGQuest Pokedex v2.txt` | **form whitelist** — which forms appear (curated guide; never a data source) |
| `ggquest/.../mega_showdown/showdown/moves` | custom move stats |
| `ggquest/.../mega_showdown/showdown/abilities` | custom ability list |
| `ggquest/.../mega_showdown/showdown/typecharts` | type effectiveness overrides |

The export also regenerates `_pokedex_moves.json` automatically whenever the
Showdown sources change, so custom move stats stay current.

Species data merges exactly like the game loads it, in priority order
**ggquest > Mega Showdown > base Cobblemon** (later wins). The roster order
comes from `ggquest/data/ggquest/dexes/ggquest.json` (the eternal dex); the
custom eternal dex number is what the site displays. Forms only appear when the
curated `GGQuest Pokedex v2.txt` guide lists them — extra forms in the data
(e.g. Pikachu cosplays) are dropped, and the export prints a cross-check report
against the guide at the end. Evolution chart branches follow the same rule:
evolutions into guide-listed forms (Alolan Raichu, Hisuian Lilligant, Toxtricity
Low-Key...) are kept as branch nodes, while cosmetic variants (Torterra's tree
forms, Alcremie decorations, per-nature duplicates) collapse into the base
branch.

## Local preview

```
cd pokemon-website
python -m http.server 8080
```

Then open http://localhost:8080. (Opening index.html directly from disk also
works in most browsers, but a local server avoids fetch restrictions.)

## Deploying to Cloudflare Pages

The site is pure static files; the runtime set is `index.html`, `app.js`,
`styles.css`, `data/`, and `img/`. The `artwork/` staging folder and this
README are dev-only.

1. Run `python _make_deploy.py` (workspace root). It assembles a clean
   `website-deploy/` folder with just the runtime files.
2. In Cloudflare: **Workers & Pages → Create → Pages → Upload assets**,
   name the project, and drop the `website-deploy` folder in. No build
   command, no framework preset.
3. For later updates (e.g. when dex entries 352–700 are ready): re-run
   `_pokedex_export.py`, re-run `_make_deploy.py`, then open the Pages
   project → **Create new deployment** → upload the folder again.

Hash-based routing (`#/pokemon/...`) needs no redirect rules on Pages.
Alternatively `npx wrangler pages deploy website-deploy` does the same from
the terminal after `wrangler login`.

## Adding artwork

Drop renders into `pokemon-website/artwork/` using the naming convention:

- `artwork/<slug>.png` — base form (e.g. `infernape.png`)
- `artwork/<slug>_<form-id>.png` — other forms (e.g. `infernape_mega.png`,
  `raichu_alolan.png`, `tauros_paldean-blaze-breed.png`)

Form ids match the tab URL segment and are the form's aspects joined with `-`
(regional first, mega variants last): `alolan`, `galarian`, `hisuian`,
`paldean`, `paldean-blaze-breed`, `sandy-cloak`, `blade-forme`, `female`,
`mega`, `mega-x`, `mega-y`, `mega-z`, `mega-g`, `alolan-mega`, …

The export script auto-crops, resizes, and centers every image onto a uniform
320×480 transparent canvas, so all artwork displays at a consistent size —
no manual resizing needed. Images are used for the hero artwork, the
evolution line, and the index grid. Until an image exists, a placeholder is
shown. Re-run the export after adding files.
