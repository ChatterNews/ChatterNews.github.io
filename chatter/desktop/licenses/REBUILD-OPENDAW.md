# Rebuilding the supplied openDAW dependencies

This source material lets the recipient inspect the exact dependency code and
prepare replacement packages for the accompanying Orbit build. No upstream
source edits were made while preparing the snapshots. Rebuilding the entire
upstream Rust/TypeScript toolchain has not been exercised as part of this notice
preparation; the upstream scripts are included unchanged.

1. Extract the `e1495bbd78b89e262bcd72141dde0344bc328326` SDK source archive.
   This is the release commit for the installed Studio SDK/core/WASM packages.
2. Consult `OPENDAW-PACKAGE-INVENTORY.json`. For dependencies recorded at
   `4356bb141de31c0d27562bc9e8b310e90861ea10`, their exact source is in the second
   archive at the package's `upstreamPath`. Preserve these versions when
   reproducing the linked package set; do not substitute the repository's newest
   code merely because it has the same package name.
3. Upstream's root `package.json` declares Node >=23 and npm 11.4.2. Its
   `package-lock.json`, `turbo.json`, configuration workspaces, and package build
   scripts are present. Install the upstream build dependencies, then use its
   Turbo build graph for the SDK and its dependencies:

   ```sh
   npm ci
   npx turbo run build --filter=@opendaw/studio-sdk...
   ```

   The SDK graph includes the private `studio-core-workers`,
   `studio-core-processors`, and `studio-forge-boxes` workspaces: they generate
   worker bundles and box sources required by the published packages. Do not
   replace this graph with TypeScript compilation of `studio-core` alone.
4. For the WASM runtime, `packages/studio/core-wasm/build-wasm.sh` builds the Rust
   engine and device modules from the included `crates/` tree. It expects Rust
   stable, a nightly device toolchain (overridable using `DEVICE_TOOLCHAIN`), the
   `wasm32-unknown-unknown` target, and Rust source support for `-Zbuild-std`.
   Binaryen's `wasm-opt` is optional in that script. Its exact flags, crate list,
   output layout and copy steps are supplied in the script. The upstream root
   also exposes `npm run build-wasm`.
5. After building any modified dependencies, pack the affected library
   workspaces with `npm pack`, install those packages in a separate copy of the
   accompanying Orbit application sources, and rerun Orbit's production build
   and desktop packaging commands supplied in `../source/`. Replace all
   interdependent openDAW packages consistently. Their package exports and
   `dist/` layouts must remain available to Vite, including worklet/worker JS
   and the WASM artifacts.

The source snapshots intentionally omit the separate upstream application's
UI/assets and large test audio. They preserve the SDK's build sources; they are
not a runnable copy of the openDAW website. Package metadata and source-license
declarations are reproduced without resolving their licensing inconsistency;
see `README.md` and the original notices before drawing licensing conclusions.
