# openDAW dependency notices and source material

Prepared September 12, 2026 for the Orbit Windows co-advisor test package.

Orbit Studio uses the openDAW headless SDK and runtime. openDAW is copyright
2025 André Michelle and its contributors. The package versions and upstream
commits used for this build are recorded in `OPENDAW-PACKAGE-INVENTORY.json`;
the installed package manifests are preserved in `installed-opendaw-manifests/`.

## Exact upstream declarations

The sixteen installed SDK/library package manifests declare
`LGPL-3.0-or-later`. `@opendaw/nam-wasm` 1.2.0 declares MIT.
However, the **installed SDK's own README**, not just the full openDAW
application's README, states AGPL-3.0-or-later/commercial terms. The same
declarations occur in the upstream source at the recorded commits. This package
preserves those declarations rather than silently rewriting either one.

The SDK also includes the CTAGDRC compressor port. Its own source notice
expressly identifies GPL-3.0-or-later, copyright 2020 Phillip Lamp, with
LookAhead work copyright 2019 Daniel Rudrich. See `CTAGDRC-NOTICE.md`.
This component is a separate reason not to describe the entire bundled audio
engine as unconditionally LGPL-only.

Included license texts:

- `LGPL-3.0.txt`, `GPL-3.0.txt`, and `AGPL-3.0.txt` from the GNU Project.
- `NAM-WASM-MIT.txt`, copied from the installed package.
- `Signalsmith-Stretch-MIT.txt`, copied from the exact openDAW source.
- The exact root and SDK READMEs from both recorded upstream commits.

These third-party notices do not choose a new license for the Orbit application
or modify the license granted by any upstream author. They do not certify that
the inconsistent SDK declarations have been resolved. Source accompaniment and
rebuild material are supplied to the recipient; no public source hosting or
commercial-license purchase was performed to prepare them.

## Corresponding source snapshots

The two `opendaw-sdk-source-<commit>.tar.gz` archives contain unmodified upstream
files from the exact commits recorded in the installed npm packages:

- `e1495bbd78b89e262bcd72141dde0344bc328326`
- `4356bb141de31c0d27562bc9e8b310e90861ea10`

Each archive includes root build configuration and lockfiles, SDK/library and
configuration workspaces, Rust crates, build scripts, license notices, and CI
workflows. The unrelated full application UI, its assets, test recordings,
documentation media, and a precompiled `crates/signalsmith/out.zip` are omitted.
Each adjacent inventory lists every included file with its byte count and
SHA-256 hash, as well as the omitted paths. These are SDK source snapshots,
not complete mirrors of the upstream repository.

The separate `../source/` directory in the distribution contains Orbit's
application build sources and packaging instructions. See `REBUILD-OPENDAW.md`
for how the supplied upstream sources relate to that application build.

## Primary upstream references

- https://github.com/andremichelle/openDAW/tree/e1495bbd78b89e262bcd72141dde0344bc328326
- https://github.com/andremichelle/openDAW/tree/4356bb141de31c0d27562bc9e8b310e90861ea10
- https://www.npmjs.com/package/@opendaw/studio-sdk/v/0.0.169
- https://github.com/andremichelle/nam-wasm
- https://github.com/p-hlp/CTAGDRC
- https://www.gnu.org/licenses/lgpl-3.0.html
- https://www.gnu.org/licenses/gpl-3.0.html
- https://www.gnu.org/licenses/agpl-3.0.html

Other application dependencies and the desktop runtime retain their own
licenses; this directory's openDAW inventory is not an inventory of all Orbit
dependencies.
