/**
 * The track: the persistent recipe bar. SPEC S6.
 * The step follows the story's validated recipe position, with a status-based
 * fallback for older stories that predate explicit recipe progress.
 */
import { Fragment, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { recipeTrackIndex, resolveStoryCreationRecipe, storyRoomPath, type Story } from '@chatter/shared';
import { Icon } from './Sprite.js';

export function Track({ story, onPick }: { story?: Story; onPick?: () => void }) {
  const navigate = useNavigate();
  if (!story) return null;

  const recipe = resolveStoryCreationRecipe(story);
  const steps = recipe.steps;
  const at = recipeTrackIndex(story);
  const step = steps[at]!;
  const currentStep = story.status === 'HELD'
    ? { ...step, next: 'Waiting on an adviser decision. Open the review to see what needs attention.', action: 'See what is held' }
    : step;
  const roomForStory = (room: string) => storyRoomPath(room, story.id);

  return (
    <div className="track recipe-track" id="track" data-current-step={step.id} style={{ '--recipe-accent': recipe.accent } as CSSProperties}>
      <div className="track-story">
        <span>CURRENT STORY · <b>{recipe.label}</b></span>
        <button className="which" title="Track a different one" onClick={onPick}>
          <Icon name="ic-slate" /><span>{story.title}</span><small>change</small>
        </button>
      </div>

      <div className="beadwrap">
        <ol className="beads">
          {steps.map((s, i) => (
            <Fragment key={s.id}>
              {i > 0 && <li className={`link ${i <= at ? 'done' : ''}`} />}
              <li>
                <button
                  className={`bead ${i < at ? 'done' : i === at ? 'now' : ''}`}
                  title={s.label}
                  onClick={() => navigate(roomForStory(s.room))}
                >
                  <span className="dot"><Icon name={i < at ? 'ic-check' : s.icon} /></span>
                  <span>{s.label}</span>
                </button>
              </li>
            </Fragment>
          ))}
        </ol>
      </div>

      <div className="nxt">
        <span><small>NEXT FOR {recipe.shortLabel}</small><span className="lbl">{currentStep.next}</span></span>
        <button className="b sm go" onClick={() => navigate(roomForStory(currentStep.room))}>{currentStep.action}<span aria-hidden="true">→</span></button>
      </div>
    </div>
  );
}
