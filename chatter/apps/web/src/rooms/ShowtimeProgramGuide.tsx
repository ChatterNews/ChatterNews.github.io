import {
  SHOWTIME_RECIPES, showtimeDuration, type ShowtimeCutFinding, type ShowtimeProject,
  type ShowtimeRecipeId,
} from '@chatter/shared';

function clock(value: number) {
  const seconds = Math.max(0, Math.round(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ShowtimeRecipePicker({ onChoose }: { onChoose: (id: ShowtimeRecipeId) => void }) {
  return <section className="showtime-recipe-picker">
    <header><span className="showtime-kicker">PROGRAM RECIPES</span><h2>Start with the rundown</h2><p>Pick the kind of program you are cutting. The timing guide starts empty—your reporting fills it.</p></header>
    <div className="showtime-recipe-cards">{SHOWTIME_RECIPES.map((recipe, index) => <button key={recipe.id} onClick={() => onChoose(recipe.id)} style={{ '--recipe-color': recipe.color } as React.CSSProperties}>
      <span>{String(index + 1).padStart(2, '0')}</span><small>{clock(recipe.targetSec)} · {recipe.format === 'VERTICAL' ? '9:16' : '16:9'}</small><b>{recipe.label}</b><p>{recipe.description}</p><i>{recipe.rails.map((rail) => rail.label).join(' / ')}</i>
    </button>)}</div>
  </section>;
}

export function ShowtimeRundownRail({ project, onChangeRecipe }: { project: ShowtimeProject; onChangeRecipe: () => void }) {
  const plan = project.programPlan;
  if (!plan) return null;
  const duration = showtimeDuration(project);
  const fill = Math.min(100, duration / Math.max(1, plan.targetSec) * 100);
  return <section className="showtime-rundown">
    <header><div><span className="showtime-kicker">PROGRAM BOARD</span><b>{clock(duration)} / {clock(plan.targetSec)}</b></div><button onClick={onChangeRecipe}>Change recipe</button></header>
    <div className="showtime-rundown-track" style={{ '--program-fill': `${fill}%` } as React.CSSProperties}>
      {plan.rails.map((rail) => <article key={rail.id} style={{ flexGrow: rail.endSec - rail.startSec, '--rail-color': rail.color } as React.CSSProperties}><small>{clock(rail.startSec)}</small><b>{rail.label}</b><span>{rail.purpose}</span></article>)}
    </div>
  </section>;
}

export function ShowtimeCutCheck({ findings, onSelect }: { findings: ShowtimeCutFinding[]; onSelect: (finding: ShowtimeCutFinding) => void }) {
  const blockers = findings.filter((finding) => finding.severity === 'BLOCKING').length;
  return <section className="showtime-cut-check">
    <header><div><span className="showtime-kicker">CUT CHECK</span><h2>{findings.length ? `${findings.length} thing${findings.length === 1 ? '' : 's'} to watch` : 'The cut is clear'}</h2></div><b className={blockers ? 'blocked' : findings.length ? 'watch' : 'ready'}>{blockers ? `${blockers} BLOCK` : findings.length ? 'CHECK' : 'READY'}</b></header>
    {findings.length ? <div>{findings.map((finding, index) => <button key={`${finding.code}-${finding.clipId ?? finding.titleId ?? finding.railId ?? index}`} onClick={() => onSelect(finding)}><span>{finding.severity === 'BLOCKING' ? '!' : '○'}</span><div><b>{finding.title}</b><small>{finding.message}</small></div><i>Locate →</i></button>)}</div> : <p>Watch the complete Program once with sound before you render. The check can measure the edit; your eyes and ears make the call.</p>}
  </section>;
}
