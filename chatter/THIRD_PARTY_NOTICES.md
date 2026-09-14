# Third-party notices

Updated: 2026-09-12

## openDAW

Studio uses the unmodified openDAW headless SDK and WebAssembly runtime through
`@opendaw/studio-sdk` (declared as `^0.0.169`). It is the only Studio DAW
engine. The lockfile, not this prose, is the exact installed-version record.

The installed SDK/library package manifests currently declare
`LGPL-3.0-or-later`, while the SDK's own README still describes
AGPL-3.0-or-later / commercial terms. Its CTAGDRC compressor also identifies
GPLv3 licensing. This is an unresolved upstream declaration mismatch; do not
infer that every component is permissively licensed or silently assign a new
license to Orbit's original code.

The Windows test package accompanies the app with its rebuild sources, GNU
license texts, component notices, installed manifests and SDK source snapshots
at the two exact upstream commits used by the lockfile. See
`desktop/licenses/README.md` and `desktop/licenses/REBUILD-OPENDAW.md` for the
evidence, component scope and rebuild details. These materials preserve the
upstream declarations; their inclusion is not a claim that the mismatch or a
wider release's licensing decision has been resolved.

## webm-muxer

Stinger and browser video export use the unmodified `webm-muxer` package
(declared as `^5.1.4`), MIT licensed. WebCodecs produces encoded chunks and
nothing else; the muxer puts the WebM container around them.

MIT imposes no source-availability obligation. It is recorded here because the
app deliberately avoids adding a large second media runtime when the browser
codecs plus a small container writer are sufficient.
