# Foley sound source manifest

Version 1 · 21 September 2026

The default Sounds shelf now contains 38 recorded/designed CC0 files from
Kenney, BigSoundBank contributors and artisticdude. See
[the shipped manifest](../../public/sounds/foley/v1/README.md) and catalog.json
for exact sources, licenses, formats and hashes. Assets load on selection and
are saved locally. Gate approval requires the catalog ID and exact bytes; labels,
URLs and imported packs do not confer approval. Existing review decisions persist.

Make retains two starting tools, Air & texture and Clear tone. The historical
25 recipes below remain for saved-project compatibility, not as the stock shelf.

All 25 entries in `sound-starters.ts` are original parameter recipes authored for
Foley in this implementation. They use only the algorithm in `sound-engine.ts`:
phase-integrated sine waves or seeded pseudorandom noise, optional one-pole
filtering, an amplitude envelope and cosine pulses. No recording, sample pack,
retired drum kit, external waveform or licensed music is included. The fixed
seeds and recipe version make the source PCM reproducible. Tone seed differences
alone do not change the signal; the named tone entries have different envelopes,
pitches, sweeps or pulse settings.

The complete name/category/seed/parameter manifest is the exported `starterSounds`
array. The five categories are Transitions (5), Accents (5), Signals (5), Ambience
(5), and Cue building blocks (5). C/E/G building blocks are intentionally pitched
for layering. Descriptive names indicate synthetic impressions, not claims that
an actual location or object was recorded. The algorithmic reverb uses a separate
fixed noise seed and a 1.6-second decay, also with no external impulse recording.

Attribution stored with each result: creator `Foley original synthesis`; usage
label `Original synthesized audio`. There is no external license URL or invented
third-party permission. Normal local Gate review still applies to generated and
rendered assets. Any imported sound keeps its own creator, source and license;
combining it with these recipes does not change its permission status.

Rendering uses a stereo 48 kHz OfflineAudioContext, a low-pass filter, equal-power
stereo pan, four discrete delay taps (0.45 successive amplitude ratio), and the
fixed reverb. The exported WAV is also the preview source. The measured peak is
before 16-bit WAV clipping, so the workspace can warn when gain exceeds 0 dBFS.
The resource budget is conservative (256 MiB estimated working set), not a claim
that a particular Chromebook has passed a five-minute workload. Browser decoding
of compressed formats is preceded by duration metadata inspection and a 20 MiB
encoded size cap; decoder-internal allocations cannot be measured in advance.
Cancellation stops scheduled voices and discards pending decode/render results;
Web Audio does not offer cancellation of an in-flight decode.

A loop overlaps its ending with its beginning by the explicit `loopCrossfade`
(default 20 ms), so its WAV is shorter than the selected range by that overlap.
Non-loop exports include finite effect tails. Preview plays that exact finished
WAV. The generator PCM is deterministic; browser convolution may produce tiny
floating-point differences between independent offline renders (Chrome rehearsal:
4 out of 230400 channel samples differed by one 16-bit step). This does not affect
preview/export parity when both use the same rendered result.

Browser rehearsal on 21 September 2026: Chrome on this Mac produced a 2.4-second
stereo WAV (460844 bytes, peak 0.238454, 360 waveform bars) for a repeated signal
with fades, filter, delay and reverb. A 0.8-second loop range with a 20 ms overlap
produced 0.78 seconds. The generated WAV successfully passed the bounded import
metadata/decode/waveform path. Managed Chromebook and physical Safari checks
remain unperformed.

Local microphone captures use the recorder's bounded measured duration because
Chrome MediaRecorder WebM can report infinite container duration. The trusted
recording operation then decodes, checks actual duration/channel/memory bounds,
and stores normalized PCM WAV so later renders and portable imports can inspect
its duration without a trusted hint. External files never get this override.
WAV sources and normalized recordings have a 64 MiB byte limit, which accommodates
five-minute stereo 48 kHz PCM captures. Compressed sources retain their 20 MiB
limit; both paths still enforce the same 256 MiB working-memory estimate, actual
duration and channel checks. An oversized capture retains its downloadable
recovery recording with a trim instruction. A synthetic Chrome MediaRecorder fixture verified the
Infinity metadata case, 0.3-second normalized WAV, and subsequent cue render.
