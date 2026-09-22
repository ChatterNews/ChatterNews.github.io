import type { Story, User } from '@chatter/shared';
import { useParams } from 'react-router-dom';
import { Showtime } from './Showtime.js';

/** The video app shares capture records with Showtime; graphics stay editable on its timeline. */
export function StingerVideo({ stories, me }: { stories: Story[]; me?: User }) {
  const { storyId } = useParams();
  return <Showtime editor stories={stories} me={me} storyId={storyId} />;
}
