import type { PodcastEpisodeFinding } from '@chatter/shared';

const STATION_LABELS: Record<PodcastEpisodeFinding['station'], string> = { RUNDOWN: 'Rundown', CUT: 'Cut', MIX: 'Mix', PACKAGE: 'Package' };

export function ChatterboxEpisodeCheck({ findings, onFocus, onClose }: { findings: PodcastEpisodeFinding[]; onFocus: (finding: PodcastEpisodeFinding) => void; onClose: () => void }) {
  const blocking = findings.filter((finding) => finding.severity === 'BLOCKING');
  return <section className="chatterbox-episode-check" role="dialog" aria-modal="true" aria-label="Episode Check">
    <header><div><span className="newsroom-eyebrow">EPISODE CHECK</span><h2>{blocking.length ? `${blocking.length} stop${blocking.length === 1 ? '' : 's'} before handoff` : findings.length ? 'Ready for a listening pass' : 'The episode is ready'}</h2><p>Story shape, sound, credits, cover, and listener information.</p></div><button aria-label="Close Episode Check" onClick={onClose}>×</button></header>
    <div className="chatterbox-check-list">{findings.length ? findings.map((finding, index) => <article key={`${finding.code}-${finding.clipId ?? finding.segmentId ?? finding.trackId ?? index}`} className={finding.severity.toLowerCase()}><i>{finding.severity === 'BLOCKING' ? '!' : '★'}</i><div><b>{finding.title}</b><p>{finding.message}</p></div><button onClick={() => onFocus(finding)}>Open {STATION_LABELS[finding.station]} →</button></article>) : <div className="chatterbox-check-clear"><b>✓</b><span><strong>Clear for package.</strong> The episode has a complete arc, playable audio, listener information, and checked music.</span></div>}</div>
    <footer><span>Advisories are listening prompts. Stops protect a complete package.</span><button onClick={onClose}>Back to the episode</button></footer>
  </section>;
}
