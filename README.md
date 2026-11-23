# Per My Last Punch

Glenntooth & Coffee Guy vs. the AI Transformation: a WebGL tag-team brawler. MEGACORP went AI-native overnight and nobody tested it. Eight levels, each ending in a bogeyman, then an endless backlog.

**Play it: https://rayhe.net/per-my-last-punch/**

One HTML page and one JavaScript file. three.js from a CDN, no build step, no dependencies to install.

## Controls

The layout is MOBA-style: left hand on the keyboard, right hand on the mouse, and everything aims at the cursor.

| Input | What it does |
|-------|--------------|
| Right-click | Move there. On a robot: walk over and keep attacking it. Hold to steer. |
| Left-click | Jab toward the cursor |
| `Q` `W` | Jab (four-hit combo, hold to repeat) and kick. Kick after two jabs for a roundhouse. |
| `E` | Special |
| `R` | Super, once caffeine reaches 800mg |
| `D` | Dodge toward the cursor (nothing can hit you mid-dodge). `Space` also dodges. |
| `F` `G` | Tag your partner in (`T` also tags), or call them for a one-move assist |
| `A` `S` | Attack-move to the cursor, and stop |
| `P` `M` | Pause, mute |

Arrow keys move if you would rather not use the mouse.

**Controllers.** Plug in an Xbox or PlayStation pad and press any button; the on-screen labels switch to that pad's glyphs.

| Xbox | PlayStation | What it does |
|------|-------------|--------------|
| Left stick, d-pad | Left stick, d-pad | Move |
| Right stick | Right stick | Aim specials and the super |
| `X` | `□` | Jab (hold to repeat) |
| `Y` | `△` | Kick |
| `B`, `LT` | `○`, `L2` | Special |
| `A` | `✕` | Dodge |
| `RB` | `R1` | Tag |
| `LB` | `L1` | Assist |
| `RT` | `R2` | Super |
| `Menu` | `Options` | Pause |

In menus, `A`/`✕` confirms, `B`/`○` goes back, `Y`/`△` starts the endless backlog, and the d-pad picks a perk. Pads are read through the browser's standard gamepad mapping.

On a phone there is a thumbstick and buttons; hold it sideways.

## The tag team

| | Special | Super |
|---|---------|-------|
| **Glenntooth** | **Pair.** Chains up to six robots: stunned, tethered, and for four seconds a hit on one is partly felt by all. | **Unify.** A rune circle pulls the room together, lightning lands on everything in it, and a storm follows. |
| **Coffee Guy** | **Agents.** A delivery drone drops a scalding espresso where you point, and four AI agents climb out of the splash and get to work. | **Swarm.** Time slows for everyone else while escort drones circle and a fleet of agents works the floor. |

Only one of them fights at a time. The one on the bench recovers morale, and tagging shakes off meetings, PIPs and prompt injections.

## Levels

| # | Room | Bogeyman | Gimmick |
|---|------|----------|---------|
| 1 | Engineering | SYNERGY-9000 | Shockwave that circles back |
| 2 | Coffee Shop | BARISTA-GPT | Decaf pods drain the caffeine meter |
| 3 | People Operations | The Stack Ranker | Puts the active fighter on a PIP until you tag out |
| 4 | Kitchen | Kuberfridge | Re-creates its pods; vulnerable while it restarts |
| 5 | Conference Room 4B | Cross-Functional Sync | Meeting invites root you; recurring meetings recur |
| 6 | Server Room | LGTM-1000 | Front shield; flank it or use specials |
| 7 | Executive Suite | VP of AI Transformation | Reorgs force-swap your fighters |
| 8 | The Boardroom | The CEO's AI Clone | Three phases across twelve slides |

Level text, waves, perks and boss stats are data tables in `game.js` (`LEVELS`, `PERKS`, `BOTS`). Add `?level=5` to the URL to start the story at a given level.

## Run it locally

The page uses ES modules and fetches `.glb` files, so it needs `http://`, not `file://`. Any static file server works. On Windows, with nothing installed:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then open http://localhost:8377/. Elsewhere, `python3 -m http.server` or `npx serve` in this folder does the same job.

To host it, copy `index.html`, `game.js` and `assets/` to any static host.

## Files

| Path | What it is |
|------|------------|
| `index.html` | Markup, HUD and all the CSS |
| `game.js` | The whole game |
| `assets/glenn.glb`, `assets/coffee.glb` | The two fighters, each with sixteen animation clips |
| `serve.ps1` | Tiny static server for local play on Windows |
| `dev/autoplay.js` | Test harness, not loaded by the game |

## Testing

Real-time play is the only check on feel and sound. For everything else, paste `dev/autoplay.js` into the browser console on the title screen:

```js
runStory({ skill: .4 })   // plays all eight levels in a few seconds, one line per level
```

It steps the game through `PMLP.sim(dt)` without drawing. `skill` is the chance the autoplayer dodges each telegraphed attack; `noTag: true` makes it never tag. Difficulty has been tuned against it: an autoplayer that never tags should die around level 5 or 6.

## License

The code is [MIT](LICENSE).

The two character models in `assets/` are **not** covered by the MIT license. They are © Ray He, all rights reserved, and are included so the game runs; please don't reuse them outside this game.
