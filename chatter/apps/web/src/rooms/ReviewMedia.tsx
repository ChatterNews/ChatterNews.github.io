import { useEffect, useState, type ReactNode } from 'react';
import type { Asset, ProseNode } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';

/** Render the editor's structure without trusting stored HTML. */
export function ReviewDocument({ node }: { node: ProseNode }): ReactNode {
  const children = node.content?.map((child, index) => <ReviewDocument key={index} node={child} />);
  if (node.type === 'text') {
    let text: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = <strong>{text}</strong>;
      if (mark.type === 'italic') text = <em>{text}</em>;
      if (mark.type === 'strike') text = <s>{text}</s>;
      if (mark.type === 'code') text = <code>{text}</code>;
    }
    return text;
  }
  switch (node.type) {
    case 'heading': return <h3>{children}</h3>;
    case 'paragraph': return <p>{children}</p>;
    case 'blockquote': return <blockquote>{children}</blockquote>;
    case 'bulletList': return <ul>{children}</ul>;
    case 'orderedList': return <ol>{children}</ol>;
    case 'listItem': return <li>{children}</li>;
    case 'hardBreak': return <br />;
    case 'horizontalRule': return <hr />;
    case 'image': return <div className="review-image-reference">▧ {String(node.attrs?.alt || 'Attached picture')} · see the media preview below</div>;
    default: return children ?? null;
  }
}

export function ReviewMedia({ assets }: { assets: Asset[] }) {
  const store = useStore();
  const [sources, setSources] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(assets.map((asset) => [asset.id, asset.sha256, asset.gateStatus]));
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    setSources({}); setLoaded(false);
    void Promise.all(assets.filter((asset) => asset.gateStatus === 'APPROVED').map(async (asset) => {
      try {
        const bytes = await store.blobs.get(asset.sha256);
        if (!bytes || !live) return undefined;
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: asset.mime }));
        urls.push(url);
        return [asset.id, url] as const;
      } catch { return undefined; }
    })).then((entries) => {
      if (live) { setSources(Object.fromEntries(entries.filter((entry) => entry !== undefined))); setLoaded(true); }
    });
    return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [store, key, retry]);
  if (!assets.length) return null;
  return <section className="review-media"><div className="review-section-heading"><h2>Attached media</h2><span>{assets.length} attached files</span></div><p>Check each file linked to this story. These may be source files rather than finished exports.</p><div className="review-media-grid">{assets.map((asset, index) => <article key={asset.id}>
    <b>{asset.kind.toLowerCase()} {index + 1} · {asset.creator || 'Chatter crew'}</b>
    {asset.gateStatus !== 'APPROVED' ? <p>Waiting for the media safety check. An adviser can review it below.</p> : sources[asset.id] ? asset.kind === 'IMAGE' ? <img src={sources[asset.id]} alt={`Attached image ${index + 1} by ${asset.creator || 'the Chatter crew'}`} /> : asset.kind === 'AUDIO' ? <audio controls preload="metadata" src={sources[asset.id]} /> : <video controls preload="metadata" src={sources[asset.id]} /> : <p>{loaded ? 'The original media is unavailable.' : 'Loading preview…'}{loaded && <button className="newsroom-button" onClick={() => setRetry((value) => value + 1)}>Retry media</button>}</p>}
    <small>{asset.license || 'License not recorded'} · {Math.round(asset.bytes / 1024)} KB</small>
  </article>)}</div></section>;
}
