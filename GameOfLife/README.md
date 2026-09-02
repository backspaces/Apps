# WebGPU Game of Life

Three versions of Conway's Game of Life on the GPU, same rules, different
ways of getting pixels on screen.

## `tutorial.html` — the tutorial version

This follows the standard [webgpufundamentals](https://webgpufundamentals.org/)
approach: simulation and rendering are two separate pipelines that share
storage buffers.

- **Compute pipeline** (`simulationShaderModule`): reads cell state from
  `cellStateIn`, applies the life rules, writes to `cellStateOut`.
- **Render pipeline** (`cellShaderModule`): draws one small square per cell
  using **instancing** — a single 2-triangle quad (`vertexBuffer`) is drawn
  `GRID_SIZE * GRID_SIZE` times, once per instance. The vertex shader looks
  up `@builtin(instance_index)` to figure out which grid cell it's
  positioning, and scales the quad to zero size if the cell is dead
  (`pos*state`).
- Both pipelines share one `bindGroupLayout` / `pipelineLayout`, built
  explicitly (not `'auto'`) since the layout has to match across two
  different pipelines.
- Two storage buffers (`cellStateStorage[0]`/`[1]`) ping-pong each
  generation; two precomputed bind groups (`bindGroups[0]`/`[1]`) pick
  which buffer is "in" vs "out" for a given step, indexed by `step % 2`.

The complexity here is inherent to drawing shapes: you need a vertex
buffer, a vertex/fragment shader pair, instancing math, and a bind group
layout that's shared between compute and render stages.

## `simple.html` — no vertex buffer, no instancing

This keeps the same two-pipeline shape (compute + render) but replaces
per-cell geometry with a single **full-screen triangle**:

- **Compute pipeline**: identical idea to the tutorial — reads `stateIn`,
  applies the life rules, writes `stateOut` — just written against a flat
  `Params` uniform (width/height/cellSize) instead of a `vec2f` grid
  uniform.
- **Render pipeline**: the vertex shader (`vs`) emits one oversized
  triangle that covers the whole canvas, built from a hardcoded
  `array<vec2f, 3>` — no vertex buffer at all. The fragment shader (`fs`)
  then does the opposite of instancing: for each pixel it computes which
  grid cell that pixel falls in (`fragCoord.xy / cellSize`) and looks up
  that cell's state directly from the same storage buffer the compute
  shader just wrote. A small margin (10% of `cellSize`) around each cell's
  edge is forced to background color, so adjacent alive cells read as
  distinct squares instead of merging into one blob — without it, cells
  render edge-to-edge and the grid looks coarser than it actually is,
  since `tutorial.html`'s instanced quads leave a natural gap by only
  scaling to 80% of the cell.
- Bind group layouts are both `'auto'` — nothing is shared between the two
  pipelines, so there's no need for an explicit `bindGroupLayout` like
  `tutorial.html` has.
- Runs headless, matching the tutorial's minimal shape: no styling, no
  play/pause/randomize controls, just `setInterval(updateGrid, 100)`.

## `three-shaders.html` — instancing, but leaner

This is `tutorial.html`'s instanced-quad approach rewritten in
`simple.html`'s style, for anyone used to a plain vertex/fragment pair
who found the compute shader the only unfamiliar piece:

- **Compute pipeline**: `simple.html`'s version verbatim — a `Params`
  uniform (just `width`/`height` here, `cellSize` isn't needed on the GPU
  side) and a loop-based neighbor count instead of the tutorial's 8
  unrolled `cellActive` calls.
- **Render pipeline**: back to `tutorial.html`'s real division of labor —
  a shared quad (`quadVertices`, scaled to 0.8 for the gap between cells)
  is drawn once per instance. The vertex shader (`vs`) looks up
  `@builtin(instance_index)`'s cell state and scales the quad to zero if
  dead, exactly like the tutorial. The fragment shader (`fs`) then earns
  its keep too — instead of returning a flat color, it colors each cell
  by its grid position (`uv.x`/`uv.y` into a gradient), so all three
  stages are doing real work rather than two of them offloading onto the
  third.
- Bind group layout is explicit and shared across both pipelines, same
  as `tutorial.html` — but because compute and render use the *same*
  layout here (rather than each getting its own `'auto'` layout), a
  single `bindGroups` array serves both passes, one less set of
  bookkeeping than either other version needs.

## Comparing the three

| | `tutorial.html` | `simple.html` | `three-shaders.html` |
|---|---|---|---|
| Drawing cells | instanced quads, vertex/fragment shaders | full-screen triangle, fragment shader does the lookup | instanced quads, vertex/fragment shaders |
| Vertex buffer | yes (`vertexBuffer`, 6 verts/quad) | none | yes (`quadVertices`, 6 verts/quad) |
| Bind group layout | explicit, shared across 2 pipelines | `'auto'`, one per pipeline | explicit, shared across 2 pipelines |
| Per-frame bind group | precomputed (2, alternating) | precomputed (2, alternating) | precomputed (2, alternating), one array shared by both passes |
| Fragment shader | flat color (`vec4f(1,0,0,1)`) | per-pixel cell lookup + margin math | gradient by cell position |
| Canvas resolution | matches window (512×512), quads sized by grid | matches window (512×512), pixels grouped by grid in the shader | matches window (512×512), quads sized by grid |

All three use the same 32×32 grid at 16px/cell (512×512 canvas), so a
side-by-side comparison isn't skewed by cell count or size, and all three
implement identical Game of Life rules (`cellIndex`/the 2-or-3-neighbors
check) — the difference is entirely in how the result gets from the GPU
to visible pixels. `simple.html` trades instancing math for a per-pixel
lookup, which is the smaller mental model if all you want is flat-colored
cells; `tutorial.html` and `three-shaders.html`'s per-cell geometry is
what you'd want if cells needed to be more than flat squares (textured
sprites, per-cell shading, arbitrary shapes) — `three-shaders.html` is
the same idea with `simple.html`'s tidier compute shader and less
bind-group bookkeeping.

There's a third approach worth knowing about, in `~/src/webgpu/life-simple.html`:
the compute shader writes directly into the canvas's texture via
`textureStore` (the canvas is configured with `STORAGE_BINDING` usage), so
there's no render pipeline at all — not even the full-screen triangle.
