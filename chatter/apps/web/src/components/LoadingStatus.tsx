import { useEffect, useState } from 'react';
import './LoadingStatus.css';

/** Omit progress when the work cannot report a measured fraction. */
export function LoadingStatus({ label, detail, progress, screen = false }: {
  label: string; detail?: string; progress?: number; screen?: boolean;
}) {
  const [takingLonger, setTakingLonger] = useState(false);
  useEffect(() => {
    setTakingLonger(false);
    const timer = window.setTimeout(() => setTakingLonger(true), 15000);
    return () => window.clearTimeout(timer);
  }, [label]);
  const fraction = progress !== undefined && Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : undefined;
  return <div className={screen ? 'orbit-loading-screen' : undefined}>
    <section className="orbit-loading" role="status" aria-live="polite">
      <div className="orbit-loading-heading"><b>{label}</b>{fraction !== undefined && <span>{Math.round(fraction * 100)}%</span>}</div>
      <progress aria-label={label} max={1} value={fraction} />
      {detail && <p>{detail}</p>}
      {takingLonger && <p>This is taking a little longer. Keep this tab open while it finishes.</p>}
    </section>
  </div>;
}
