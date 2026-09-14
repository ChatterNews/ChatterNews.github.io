export interface PodcastCoverChoice { assetId: string; title: string; source: string }

export function ChatterboxCoverStudio({ showTitle, episodeTitle, episodeNumber, artworkMode, showCoverId, episodeCoverId, effectiveCoverId, choices, urls, onUseShow, onUseEpisode, onSetShow, onChoose, onUpload, onEditBlast, onClose }: {
  showTitle: string; episodeTitle: string; episodeNumber?: number; artworkMode?: 'SHOW' | 'EPISODE';
  showCoverId?: string; episodeCoverId?: string; effectiveCoverId?: string; choices: PodcastCoverChoice[]; urls: Map<string, string>;
  onUseShow: () => void; onUseEpisode: () => void; onSetShow: (assetId: string) => void; onChoose: (assetId: string) => void;
  onUpload: (file: File) => void; onEditBlast: () => void; onClose: () => void;
}) {
  const effectiveUrl = effectiveCoverId ? urls.get(effectiveCoverId) : undefined;
  return <section className="chatterbox-cover-studio" role="dialog" aria-modal="true" aria-label="Cover Studio">
    <header><div><span className="newsroom-eyebrow">COVER STUDIO</span><h2>Give the episode a face</h2><p>Use one cover for the whole show or give this episode its own square.</p></div><button aria-label="Close Cover Studio" onClick={onClose}>×</button></header>
    <div className="chatterbox-cover-workbench">
      <div className="chatterbox-cover-preview">{effectiveUrl ? <img src={effectiveUrl} alt="Current episode cover" /> : <><span>CB</span><b>{episodeTitle}</b><small>{showTitle} · EP {episodeNumber ?? '—'}</small></>}</div>
      <div className="chatterbox-cover-modes"><button aria-pressed={!!showCoverId && (artworkMode === 'SHOW' || (!artworkMode && !episodeCoverId))} disabled={!showCoverId} onClick={onUseShow}><b>Use show cover</b><small>{showCoverId ? 'Keep every episode recognizable.' : 'Choose a show cover first.'}</small></button><button aria-pressed={!!episodeCoverId && (artworkMode === 'EPISODE' || !artworkMode)} disabled={!episodeCoverId} onClick={onUseEpisode}><b>Use episode cover</b><small>{episodeCoverId ? 'Your last episode cover is still here.' : 'Choose or make one below.'}</small></button></div>
      <div className="chatterbox-cover-actions"><label className="newsroom-button">Upload cover<input hidden type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ''; }} /></label><button className="newsroom-button primary" onClick={onEditBlast}>Edit in Blast ↗</button></div>
    </div>
    <div className="chatterbox-cover-bin"><div><h3>Choose from Media Bin</h3><p>Approved photos and artwork from this story drive.</p></div>{choices.length ? <div>{choices.map((choice) => <article key={choice.assetId}><button className="chatterbox-cover-choice" aria-pressed={effectiveCoverId === choice.assetId} onClick={() => onChoose(choice.assetId)}>{urls.get(choice.assetId) ? <img src={urls.get(choice.assetId)} alt="" /> : <span>▧</span>}<b>{choice.title}</b><small>{choice.source}</small></button><button className="chatterbox-cover-show-default" onClick={() => onSetShow(choice.assetId)}>Make show cover</button></article>)}</div> : <p className="chatterbox-cover-empty">No approved pictures yet. Upload one here or make a square in Blast.</p>}</div>
  </section>;
}
