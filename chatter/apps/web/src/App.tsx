import { workspaceStorage, workspaceStoreName } from './portable/workspace-context.js';
/**
 * The shell: header, room tabs, the track, and Reily. Reproduces the
 * prototype's DOM so its stylesheet applies unchanged (SPEC S0b).
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { recipeTrackStepForStory, storyRoomPath, type Story } from '@chatter/shared';
import { StoreProvider, useStore } from './store/StoreProvider.js';
import { useRoleIdentity } from './store/useCurrentUser.js';
import { isAdviserSession } from './store/role-session.js';
import { DisplayControls } from './components/DisplayControls.js';
import { applyAfterHours, readAfterHours, saveAfterHours, readLowSpec, saveLowSpec } from './components/display-mode.js';
import { Sprite } from './components/Sprite.js';
import { Reily } from './components/Pip.js';
import { ReilyContextProvider } from './components/ReilyContextProvider.js';
import { REILY_ROOMS, type ReilyRoom } from './components/reily-advice.js';
import { reilyRoomPath } from './components/reily-navigation.js';
import type { RoomRevealRequest } from './components/SpiralRoomMap.js';
import { ControlIcon } from './components/ControlIcon.js';
import { ProjectDrive } from './components/ProjectDrive.js';
import { ModelProvider } from './ml/ModelProvider.js';
import { GateProvider } from './gate/GateProvider.js';
import { lazyNamed } from './room-loaders.js';
import { WhoAmI } from './components/WhoAmI.js';
import { NewsroomCheckIn } from './components/NewsroomCheckIn.js';
import { RoomAtmosphere } from './components/RoomAtmosphere.js';
import { SpiralStage } from './components/SpiralStage.js';
import { StorySatellite } from './components/StorySatellite.js';
import { atmosphereRoomFromPathname } from './room-atmosphere.js';
import { MEDIA_BIN_RETURN_KEY, mediaBinDestination, newsroomLocation } from './media-bin-navigation.js';
import { routeStoryId as storyIdFromRoute } from './story-navigation.js';
import { enterDemoDesk, leaveDemoDesk, readDeskMode, storeNameForDesk, type DeskMode } from './store/desk-mode.js';
import './styles/Navigation.css';
import './styles/Reimagine.css';
import './styles/TactilePass.css';
import './styles/MotionPass.css';
import './styles/FlowPass.css';
import './styles/SpiralStage.css';

const Clubhouse = lazyNamed(() => import('./rooms/Clubhouse.js'), 'Clubhouse');
const Slate = lazyNamed(() => import('./rooms/Slate.js'), 'Slate');
const Desk = lazyNamed(() => import('./rooms/Desk.js'), 'Desk');
const Booth = lazyNamed(() => import('./rooms/Booth.js'), 'Booth');
const GreenLight = lazyNamed(() => import('./rooms/GreenLight.js'), 'GreenLight');
const Crew = lazyNamed(() => import('./rooms/Crew.js'), 'Crew');
const Reruns = lazyNamed(() => import('./rooms/Reruns.js'), 'Reruns');
const Blast = lazyNamed(() => import('./rooms/Blast.js'), 'Blast');
const Stinger = lazyNamed(() => import('./rooms/Stinger.js'), 'Stinger');
const Showtime = lazyNamed(() => import('./rooms/Showtime.js'), 'Showtime');
const Chatterbox = lazyNamed(() => import('./rooms/Chatterbox.js'), 'Chatterbox');
const MediaBin = lazyNamed(() => import('./rooms/MediaBin.js'), 'MediaBin');
const FrontDesk = lazyNamed(() => import('./rooms/FrontDesk.js'), 'FrontDesk');

function normalizeReilyRoom(room: string): ReilyRoom {
  if (!room) return 'home';
  if (room === 'garage' || room === 'studio') return 'files';
  return (REILY_ROOMS as readonly string[]).includes(room) ? room as ReilyRoom : 'home';
}

function RoomLoading() {
  return (
    <section className="room-loading" role="status" aria-live="polite">
      <span className="room-loading-orbit" aria-hidden="true" />
      <b>Opening the room…</b>
    </section>
  );
}

function Shell({ deskMode }: { deskMode: DeskMode }) {
  const [lowSpec, setLowSpec] = useState(readLowSpec);
  const [afterHours, setAfterHours] = useState(readAfterHours);
  useEffect(() => { document.body.dataset.lowSpec = String(lowSpec); }, [lowSpec]);
  const screenControls = (inRoom: boolean) => <DisplayControls lowSpec={lowSpec} afterHours={afterHours} inRoom={inRoom}
    onAfterHoursChange={(value) => {applyAfterHours(value);setAfterHours(value);saveAfterHours(value);}}
    onLowSpecChange={(value) => {setLowSpec(value);saveLowSpec(value);}} />;
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [stories, setStories] = useState<Story[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [trackedId, setTrackedId] = useState<string>();
  const [previousRoom, setPreviousRoom] = useState<ReilyRoom>();
  const [roomRevealRequest, setRoomRevealRequest] = useState<RoomRevealRequest>();
  const mediaBinReturn = useRef<string | null>(null);
  const lastRoom = useRef<ReilyRoom>('home');
  const lastSessionUserId = useRef<string>();
  const identity = useRoleIdentity(store);
  const adviser = isAdviserSession(identity.session);

  useEffect(() => {
    store.stories.list().then((rows) => {
      setStories(rows);
      setTrackedId((current) => current ?? rows[0]?.id);
    });
  }, [store, location.pathname, reloadKey]);

  useEffect(() => {
    document.body.dataset.role = adviser ? 'adviser' : 'student';
    document.body.dataset.interface = 'spiral-stage';
  }, [adviser]);

  useEffect(() => {
    if (location.pathname.startsWith('/files')) {
      mediaBinReturn.current ??= workspaceStorage(window.sessionStorage).getItem(MEDIA_BIN_RETURN_KEY);
      return;
    }
    const exactRoute = newsroomLocation(location);
    mediaBinReturn.current = exactRoute;
    workspaceStorage(window.sessionStorage).setItem(MEDIA_BIN_RETURN_KEY, exactRoute);
  }, [location]);

  useEffect(() => {
    document.querySelector<HTMLElement>('.spiral-center-room')?.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  }, [location.pathname]);

  const me = identity.me;
  const room = location.pathname.split('/')[1] ?? '';
  const reilyRoom = normalizeReilyRoom(room);
  const atmosphereRoom = atmosphereRoomFromPathname(location.pathname);
  const routeStoryId = storyIdFromRoute(location.pathname, location.search);
  const tracked = stories.find((s) => s.id === (routeStoryId ?? trackedId));
  const contextStoryId = routeStoryId ?? tracked?.id;
  const recommendedRoom = normalizeReilyRoom(tracked ? recipeTrackStepForStory(tracked).room.replace(/^\//, '') : 'slate');

  const sessionUserId = identity.session.kind === 'NONE' ? undefined : identity.session.userId;
  useEffect(() => {
    if (!sessionUserId || lastSessionUserId.current === sessionUserId) return;
    lastSessionUserId.current = sessionUserId;
    lastRoom.current = reilyRoom;
    setPreviousRoom(undefined);
  }, [reilyRoom, sessionUserId]);

  useEffect(() => {
    if (!sessionUserId || lastRoom.current === reilyRoom) return;
    const prior = lastRoom.current;
    lastRoom.current = reilyRoom;
    if (!(prior === 'frontdesk' && !adviser)) setPreviousRoom(prior);
  }, [adviser, reilyRoom, sessionUserId]);

  useEffect(() => { if (routeStoryId) setTrackedId(routeStoryId); }, [routeStoryId]);
  const penName = me?.penName ?? 'Chatter crew';
  const navigateToRoom = (destination: ReilyRoom) => navigate(reilyRoomPath(destination, contextStoryId));
  const revealRoom = (destination: ReilyRoom) => setRoomRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, room: destination }));

  /**
   * Put the badge back on the table. One classroom laptop is used by several
   * kids in a period, so handing it back has to be one press.
   */
  const handBack = () => {
    identity.checkout();
    if (deskMode === 'DEMO') {
      leaveDemoDesk(workspaceStorage(window.sessionStorage));
      window.location.assign(import.meta.env.BASE_URL);
      return;
    }
    navigate('/');
  };

  /** Track a different story: step to the next one in the list. */
  const pickNext = () => {
    if (stories.length === 0) return;
    const at = stories.findIndex((s) => s.id === trackedId);
    const nextId = stories[(at + 1) % stories.length]!.id;
    setTrackedId(nextId);
    if (routeStoryId) navigate(storyRoomPath(`/${room}`, nextId));
  };

  if (!identity.loaded) {
    return <div className="wrap" style={{ padding: 40 }}><h1>Opening the badge table…</h1></div>;
  }

  if (identity.session.kind === 'NONE') {
    return (
      <>
        <Sprite />
        <RoomAtmosphere room={atmosphereRoom} />
        <div className="rays" /><div className="dots" />
        {screenControls(false)}
        <NewsroomCheckIn
          demoMode={deskMode === 'DEMO'}
          students={identity.students}
          advisers={identity.advisers}
          preferredAdviserId={identity.preferredAdviserId}
          onIdentityChanged={identity.refresh}
          onAdviserUnlock={identity.unlockAdviser}
          onStudentPicked={async (userId, toRoom) => {
            const picked = await identity.chooseStudent(userId);
            if (picked) { identity.refresh(); navigate(toRoom ?? '/'); }
            return picked;
          }}
          onEnterDemo={() => {
            enterDemoDesk(workspaceStorage(window.sessionStorage));
            window.location.assign(import.meta.env.BASE_URL);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Sprite />
      <RoomAtmosphere room={atmosphereRoom} />
      <div className="rays" /><div className="dots" />

      {screenControls(true)}
      <ReilyContextProvider>
        <SpiralStage
          lowSpec={lowSpec}
          currentRoom={room}
          recommendedRoom={recommendedRoom}
          roomRevealRequest={roomRevealRequest}
          storyTitle={tracked?.title}
          onNavigate={(destination) => navigateToRoom(normalizeReilyRoom(destination))}
          storyControl={tracked ? <StorySatellite story={tracked} onPick={pickNext} /> : null}
          driveControl={<ProjectDrive stories={stories} story={tracked} onChanged={() => setReloadKey((key) => key + 1)} />}
          identityControl={<WhoAmI me={me} choices={adviser ? identity.advisers : identity.students} students={identity.students} adviser={adviser} onChoose={identity.switchAdviser} onChanged={identity.refresh} onHandBack={handBack} />}
          mediaControl={<button className="stage-utility media-bin-trigger" onClick={() => navigate(mediaBinDestination(newsroomLocation(location), mediaBinReturn.current, contextStoryId))} aria-current={room === 'files' ? 'page' : undefined}><ControlIcon kind={room === 'files' ? 'back' : 'media'} /><b>{room === 'files' ? 'Return' : 'Media'}</b></button>}
          adviserControl={deskMode === 'DEMO' ? <button className="stage-utility adviser-trigger demo-desk-trigger" onClick={handBack}><ControlIcon kind="leave" /><b>Leave demo</b></button> : adviser ? <button className="stage-utility adviser-trigger" onClick={() => navigate('/frontdesk')} aria-current={room === 'frontdesk' ? 'page' : undefined}><ControlIcon kind="adviser" /><b>Adviser</b></button> : null}
        >
          <main className="board spiral-live-board">
          <Suspense fallback={<RoomLoading />}><Routes>
            <Route path="/" element={<Clubhouse stories={stories} story={tracked} me={me} penName={penName} />} />
            <Route path="/slate" element={<Slate stories={stories} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/slate/:storyId" element={<Slate stories={stories} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/booth" element={<Booth stories={stories} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/booth/:storyId" element={<Booth stories={stories} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/desk" element={<Desk stories={stories} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/desk/:storyId" element={<Desk stories={stories} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/greenlight" element={<GreenLight stories={stories} adviser={adviser} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/greenlight/:storyId" element={<GreenLight stories={stories} adviser={adviser} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/crew" element={<Crew stories={stories} adviser={adviser} me={me} />} />
            <Route path="/stinger" element={<Stinger stories={stories} me={me} />} />
            <Route path="/stinger/:storyId" element={<Stinger stories={stories} me={me} />} />
            <Route path="/studio" element={<Navigate to={`/files${location.search}`} replace />} />
            <Route path="/garage" element={<Navigate to={`/files${location.search}`} replace />} />
            <Route path="/blast" element={<Blast me={me} stories={stories} storyId={contextStoryId} />} />
            <Route path="/reruns" element={<Reruns stories={stories} me={me} />} />
            <Route path="/reruns/:storyId" element={<Reruns stories={stories} me={me} />} />
            <Route path="/reruns/podcast/:projectId" element={<Reruns stories={stories} me={me} />} />
            <Route path="/files" element={<MediaBin stories={stories} adviser={adviser} me={me} />} />
            <Route path="/frontdesk" element={<FrontDesk stories={stories} adviser={adviser} me={me} onChanged={() => setReloadKey((k) => k + 1)} />} />
            <Route path="/showtime" element={<Showtime stories={stories} me={me} storyId={contextStoryId} />} />
            <Route path="/showtime/:storyId" element={<Showtime stories={stories} me={me} storyId={routeStoryId ?? undefined} />} />
            <Route path="/chatterbox" element={<Chatterbox stories={stories} me={me} />} />
          </Routes></Suspense>
          </main>
        </SpiralStage>

        <Reily
          context={{ room: reilyRoom, story: tracked, role: adviser ? 'ADVISER' : 'STUDENT', previousRoom }}
          userId={identity.session.userId}
          recommendedRoom={recommendedRoom}
          onNavigate={navigateToRoom}
          onRevealRoom={revealRoom}
        />
      </ReilyContextProvider>
    </>
  );
}

export function App() {
  let deskMode: DeskMode = 'LIVE';
  try { deskMode = readDeskMode(workspaceStorage(window.sessionStorage)); } catch { /* live is the safe fallback */ }
  const dbName = workspaceStoreName(storeNameForDesk(deskMode));
  return (
    <StoreProvider dbName={dbName} key={dbName}>
      <ModelProvider>
        <GateProvider>
          <Shell deskMode={deskMode} />
        </GateProvider>
      </ModelProvider>
    </StoreProvider>
  );
}
