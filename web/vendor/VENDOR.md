# Vendored libraries

## d3-force 3.0.0

- File: d3-force-3.0.0.min.js (single-file ESM bundle, includes its
  d3-quadtree/d3-dispatch/d3-timer dependencies)
- Source: npm package d3-force@3.0.0, bundled once at vendoring time with
  `npx esbuild node_modules/d3-force --bundle --format=esm --minify`
- sha256: 3d95f611b505f8ee27165c17b7cb4b25da1c087a8264b1a4b9183b1be23eb749
- Types: d3-force.d.ts copied from @types/d3-force (referenced via the
  tsconfig paths mapping; the import map in index.html points the bare
  "d3-force" specifier at the bundle in the browser)
- License: ISC (d3-force, Mike Bostock)

Update procedure: bump the npm version, re-run the esbuild command, update
the filename, sha256, and the import map in index.html.
