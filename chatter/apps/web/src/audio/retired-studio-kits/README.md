Studio was removed from the active Orbit app on September 15, 2026.
These original sounds remain with the dormant source, outside Vite's public
folder so new app builds do not copy them. OpenDAW is Studio-only; App.tsx no
longer imports Garage.tsx and vite.config.ts no longer emits its WASM engine.
The source dependency remains for dormant source typechecking and tests.
Do not re-enable the DAW without a new product decision and full verification.
Existing Studio records, source audio, .chatter imports/exports and old mixed
files remain supported. SavedStudioProjects in Media Bin links older standalone
sessions to a story without loading the DAW.
