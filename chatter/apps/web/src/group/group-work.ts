import JSZip from 'jszip';
import { validateSoundPackManifest } from '../audio/sound-pack.js';
import { groupWritingContent } from './group-writing.js';
import { createStoryCode, normalizeStoryCode, newId, sha256, validateGroupRevision, type Store, type Story, type User, type Gate, type GroupRevision, type Credit, validateStoryGroupFields, soundSourceAssetIds } from '@chatter/shared';
import { exportPortableStory, importPortableStory, isPortableStoryProject, type PortableStoryProject } from '../portable/portable-project.js';
import { loadBoundedZip, readBoundedZipEntry, type GroupArchiveEntry } from './group-archive.js';
import { flushSessionCheckpoints } from '../store/session-checkpoint.js';

export async function startGroup(store: Store, input: Story, actor: User): Promise<Story> {
  await flushSessionCheckpoints(store);
  const story = await store.stories.get(input.id); if (!story) throw new Error('Open your story again.');
  if (story.status === 'DONE') throw new Error('Published stories stay finished. Start a follow-up story.');
  if (story.group) return story;
  if (story.ownerId && story.ownerId !== actor.id && actor.role !== 'ADVISER') throw new Error('Ask the story lead to start group work.');
  const used = new Set((await store.stories.list()).map(s => s.group?.code)); let code = createStoryCode(); while (used.has(code)) code = createStoryCode();
  return store.stories.update(story.id, { ownerId: story.ownerId ?? actor.id, group: { code, rootId: newId(), kind: 'main', contributionId: newId(), authorId: actor.id, authorName: actor.penName } });
}
export async function joinGroup(store: Store, input: string, actor: User, label = 'Group story'): Promise<Story> {
  const code = normalizeStoryCode(input);
  const existing = (await store.stories.list()).find(s => s.group?.code === code && s.group.kind !== 'piece'); if (existing) return existing;
  return store.stories.create({ title: label.trim() || 'Group story', ownerId: actor.id, channels: ['web'], creationRecipeId: 'article', group: { code, kind: 'joined', contributionId: newId(), authorId: actor.id, authorName: actor.penName } });
}
export async function makeGroupPiece(store: Store, group: Story, actor: User, title = `${actor.penName}'s perspective`, recipe: Story['creationRecipeId'] = 'article'): Promise<Story> {
  if (!group.group) throw new Error('Join a group story first.');
  return store.stories.create({ title: title.trim() || `${actor.penName}'s piece`, ownerId: actor.id, bylineIds: [actor.id], creationRecipeId: recipe, channels: [recipe === 'video' ? 'video' : recipe === 'podcast' ? 'pod' : recipe === 'poster' ? 'social' : 'web'], brief: group.brief, group: { code: group.group.code, rootId: group.group.rootId, kind: 'piece', contributionId: newId(), authorId: actor.id, authorName: actor.penName } });
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['exportedAt','updatedAt','lastRevisionId','baseRevisionId'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key, v])=>[key,canonical(v)]));
  return value;
}
async function contentHash(project: PortableStoryProject, zip: JSZip): Promise<string> {
  const sounds = zip.file('sounds.soundpack'); let soundManifest: unknown;
  if (sounds) { const packed = await loadBoundedZip(await readBoundedZipEntry(sounds)); const manifest = packed.file('soundpack.json'); if (manifest) soundManifest = JSON.parse(new TextDecoder().decode(await readBoundedZipEntry(manifest, 8*1024*1024))); }
  return sha256(new TextEncoder().encode(JSON.stringify(canonical({ project, soundManifest }))));
}
/** Validate the entire portable snapshot before any records are adopted. */
export async function inspectGroupSnapshot(bytes: Uint8Array, options: { allowJoined?: boolean } = {}): Promise<{ project: PortableStoryProject; hash: string }> {
  const zip = await loadBoundedZip(bytes); const manifest = zip.file('story.chatter.json'); if (!manifest) throw new Error('This contribution is missing its story.');
  const project = JSON.parse(new TextDecoder().decode(await readBoundedZipEntry(manifest, 8*1024*1024)));
  if (!isPortableStoryProject(project) || !project.story || !Array.isArray(project.users) || !Array.isArray(project.deliverables ?? []) || project.groupArchive) throw new Error('This contribution has an unsupported story format.');
  if (!project.story.body || project.story.body.type !== 'doc') throw new Error('This contribution has damaged writing.');
  validateStoryGroupFields(project.story);
  const group=project.story.group;
  if(!group||(group.kind==='joined'&&!options.allowJoined))throw new Error('This contribution is missing its group identity.');
  validateGroupRevision({id:'preflight',createdAt:0,updatedAt:0,groupCode:group.code,rootId:group.rootId,contributionId:group.contributionId,kind:group.kind==='joined'?'main':group.kind,authorId:group.authorId,authorName:group.authorName,title:project.story.title,storyTitle:project.story.title,snapshotHash:`sha256:${'0'.repeat(64)}`,contentHash:`sha256:${'0'.repeat(64)}`,body:project.story.body});
  for(const key of ['users','assets','takes','transcripts','credits','appearances','releases','roleAssigns','crewTasks','reviews','episodes','motionPackages','blasts','deliverables','showtimeProjects','podcastShows','podcastProjects','samplerPresets','studioProjects'] as const) {
   const rows=project[key];if(rows!==undefined&&(!Array.isArray(rows)||rows.length>5000||rows.some((row:unknown)=>!row||typeof row!=='object'||Array.isArray(row))))throw new Error('This contribution has damaged records.');
  }
  for(const key of ['users','assets','takes','transcripts','credits','appearances','releases','roleAssigns','crewTasks','reviews','episodes','motionPackages','blasts'] as const)if(!Array.isArray(project[key]))throw new Error('This contribution is missing its records.');
  if(!Array.isArray(project.story.channels)||!Array.isArray(project.story.bylineIds)||typeof project.story.slug!=='string')throw new Error('This contribution has damaged story metadata.');
  const authorIds=new Set<string>();for(const user of project.users){if(typeof user.id!=='string'||!user.id||authorIds.has(user.id)||typeof user.penName!=='string'||!user.penName.trim()||user.penName.length>512)throw new Error('This contribution has damaged attribution.');authorIds.add(user.id);}
  const uniqueAssetIds=new Set<string>();for(const item of project.assets){if(!item.record||typeof item.record.id!=='string'||!item.record.id||uniqueAssetIds.has(item.record.id)||typeof item.file!=='string'||!item.file||!Number.isSafeInteger(item.record.bytes)||item.record.bytes<0||!['IMAGE','AUDIO','VIDEO'].includes(item.record.kind)||!['UPLOAD','OPENVERSE','RECORDING','GENERATED'].includes(item.record.origin)||typeof item.record.mime!=='string')throw new Error('This contribution has damaged media metadata.');uniqueAssetIds.add(item.record.id);}

  const assetIds = new Set(project.assets.map(a=>a.record.id));
  for (const item of project.assets) { const f=zip.file(item.file); if (!f) throw new Error('The contribution is missing source media.'); const media=await readBoundedZipEntry(f); if (media.length!==item.record.bytes || await sha256(media)!==item.record.sha256) throw new Error('The contribution contains damaged source media.'); }
  for (const item of project.deliverables ?? []) {const f=zip.file(item.file);if(!f)throw new Error('The contribution is missing an export.');const data=await readBoundedZipEntry(f);if(data.length!==item.record.bytes||await sha256(data)!==item.record.blobHash)throw new Error('The contribution contains a damaged export.');}
  // Every asset reference in editable projects must resolve before accepting the package.
  function references(value: unknown, key='') {if(typeof value==='string' && /(?:assetId|AssetId)$/.test(key) && value && !assetIds.has(value))throw new Error('The contribution is missing a referenced source.'); if(Array.isArray(value))value.forEach(v=>references(v,key==='attachedAssetIds'?'assetId':key));else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>references(v,k));}
  references({story:project.story,takes:project.takes,motion:project.motionPackages,blasts:project.blasts,video:project.showtimeProjects,podcasts:project.podcastProjects,shows:project.podcastShows,studio:project.studioProjects,credits:project.credits,appearances:project.appearances,transcripts:project.transcripts,samplers:project.samplerPresets});
  const soundClips=[...(project.showtimeProjects??[]).flatMap(p=>p.clips),...(project.podcastProjects??[]).flatMap(p=>p.clips)].filter(c=>c.soundProjectId||c.soundRevisionId||c.soundItemId);
  if(soundClips.length&&!project.soundPack)throw new Error('The contribution is missing its editable sound library.');
  if(project.soundPack){
   if(project.soundPack!=='sounds.soundpack'||!zip.file(project.soundPack))throw new Error('The contribution is missing its sound library.');
   const sounds=await loadBoundedZip(await readBoundedZipEntry(zip.file(project.soundPack)!));const m=sounds.file('soundpack.json');if(!m)throw new Error('Missing sound manifest.');
   const data:unknown=JSON.parse(new TextDecoder().decode(await readBoundedZipEntry(m,8*1024*1024)));validateSoundPackManifest(data);
   for(const clip of soundClips){
    if((clip.soundProjectId&&!data.projects.some(p=>p.id===clip.soundProjectId))||(clip.soundRevisionId&&!data.revisions.some(r=>r.id===clip.soundRevisionId))||(clip.soundItemId&&!data.items.some(i=>i.id===clip.soundItemId)))throw new Error('The contribution has an incomplete editable sound attachment.');
    const inner=data.assets.find(a=>a.record.id===clip.assetId);const outer=project.assets.find(a=>a.record.id===clip.assetId);if(!inner||!outer||inner.record.sha256!==outer.record.sha256)throw new Error('The contribution has mismatched sound media.');
   }
   for(const a of data.assets){const f=sounds.file(a.file);if(!f)throw new Error('Missing sound source.');const raw=await readBoundedZipEntry(f);if(raw.length!==a.record.bytes||await sha256(raw)!==a.record.sha256)throw new Error('Damaged sound source.');}
  }
  return { project, hash: await contentHash(project,zip) };
}
const captureQueues = new WeakMap<Store, Promise<unknown>>();
export async function captureGroupRevision(store: Store, storyId: string): Promise<GroupRevision> {
  const previous=captureQueues.get(store) ?? Promise.resolve(); const work=previous.catch(()=>{}).then(()=>capture(store,storyId));captureQueues.set(store,work);return work;
}
async function capture(store: Store, storyId:string):Promise<GroupRevision>{
  await flushSessionCheckpoints(store); const story=await store.stories.get(storyId);if(!story?.group||story.group.kind==='joined')throw new Error('Make your piece or bring in a group draft before saving.');
  const packed=await exportPortableStory(store,story,{omitGroupHistory:true});const snapshot=new Uint8Array(await packed.blob.arrayBuffer());const checked=await inspectGroupSnapshot(snapshot);
  const prior=(await store.groupRevisions.list()).filter(r=>r.contributionId===story.group!.contributionId&&r.groupCode===story.group!.code&&r.rootId===story.group!.rootId);
  const same=prior.find(r=>r.contentHash===checked.hash);if(same){if(story.group.lastRevisionId!==same.id)await store.stories.update(story.id,{group:{...story.group,lastRevisionId:same.id}});return same;}
  const groupTitle=(await store.stories.list()).find(s=>s.group?.code===story.group!.code&&s.group.kind!=='piece')?.title??story.title;
  const now=Date.now();const record:GroupRevision={id:newId(),createdAt:now,updatedAt:now,groupCode:story.group.code,rootId:story.group.rootId,contributionId:story.group.contributionId,parentRevisionId:story.group.lastRevisionId??story.group.baseRevisionId,kind:story.group.kind,authorId:story.group.authorId,authorName:story.group.authorName,title:story.title,storyTitle:groupTitle,snapshotHash:await sha256(snapshot),contentHash:checked.hash,body:structuredClone(story.body)};
  validateGroupRevision(record);await store.blobs.put(snapshot);const saved=await store.groupRevisions.create(record);await store.stories.update(story.id,{group:{...story.group,lastRevisionId:record.id}});return saved;
}
export async function groupEntries(store:Store, input:string, contributionId?:string):Promise<GroupArchiveEntry[]>{
 const code=normalizeStoryCode(input);const records=(await store.groupRevisions.list()).filter(r=>r.groupCode===code&&(!contributionId||r.contributionId===contributionId));const entries:GroupArchiveEntry[]=[];
 for(const record of records){const snapshot=await store.blobs.get(record.snapshotHash);if(!snapshot)throw new Error(`The saved copy of “${record.title}” is missing. Keep this computer open and save it again.`);entries.push({record,snapshot});}return entries;
}
function stable(value: unknown): unknown {
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
 return value;
}
async function inspectEntry(entry: GroupArchiveEntry): Promise<PortableStoryProject> {
 validateGroupRevision(entry.record);
 if(await sha256(entry.snapshot)!==entry.record.snapshotHash)throw new Error('This contribution has damaged bytes.');
 const checked=await inspectGroupSnapshot(entry.snapshot);const group=checked.project.story.group;const record=entry.record;
 if(checked.hash!==record.contentHash||JSON.stringify(stable(checked.project.story.body))!==JSON.stringify(stable(record.body)))throw new Error('The contribution preview does not match its saved work.');
 if(!group||group.code!==record.groupCode||group.rootId!==record.rootId||group.contributionId!==record.contributionId||group.kind!==record.kind||group.authorId!==record.authorId||group.authorName!==record.authorName||checked.project.story.title!==record.title||(group.lastRevisionId??group.baseRevisionId)!==record.parentRevisionId)throw new Error('This contribution metadata does not match its saved story.');
 return checked.project;
}
const collectionQueues=new WeakMap<Store,Promise<unknown>>();
export async function collectGroupEntries(store:Store, entries:GroupArchiveEntry[]):Promise<{added:number;already:number}> {
 // Own the incoming bytes before awaiting another collection from the same drive.
 const held=structuredClone(entries);const previous=collectionQueues.get(store)??Promise.resolve();
 const work=previous.catch(()=>{}).then(()=>collectEntries(store,held));collectionQueues.set(store,work);return work;
}
async function collectEntries(store:Store, entries:GroupArchiveEntry[]):Promise<{added:number;already:number}> {
 const existing=await store.groupRevisions.list();const seen=new Map(existing.map(r=>[r.id,r]));let already=0;const incoming:GroupArchiveEntry[]=[];
 const localStories=await store.stories.list();
 for(const entry of entries){await inspectEntry(entry);
  const old=seen.get(entry.record.id);if(old){if(JSON.stringify(stable(old))!==JSON.stringify(stable(entry.record)))throw new Error('Two different pieces have the same saved identity. Keep both original files.');already++;continue;}
  const roots=new Set([...seen.values()].filter(r=>r.groupCode===entry.record.groupCode&&r.rootId).map(r=>r.rootId));
  for(const story of localStories)if(story.group?.code===entry.record.groupCode&&story.group.rootId)roots.add(story.group.rootId);
  if(entry.record.rootId&&roots.size&&!roots.has(entry.record.rootId))throw new Error('Two group stories are using this code. Keep the files separate and ask the lead to give one story a new code.');seen.set(entry.record.id,entry.record);incoming.push(entry);
 }
 for(const {record} of incoming){
  const visited=new Set([record.id]);let child=record;
  while(child.parentRevisionId){if(visited.has(child.parentRevisionId))throw new Error('This contribution has circular revision history.');visited.add(child.parentRevisionId);const parent=seen.get(child.parentRevisionId);if(!parent)break;
   if(parent.groupCode!==child.groupCode||parent.contributionId!==child.contributionId||parent.rootId!==child.rootId)throw new Error('This contribution has unrelated revision history.');child=parent;
  }
 }
 const added:string[]=[];try{for(const e of incoming)await store.blobs.put(e.snapshot);for(const e of incoming){await store.groupRevisions.create(e.record);added.push(e.record.id);}}catch(error){for(const id of added)await store.groupRevisions.remove(id);throw error;}
 return {added:added.length,already};
}
export async function openGroupRevision(store:Store,gate:Gate,revisionId:string,actor:User):Promise<Story>{
 const revision=await store.groupRevisions.get(revisionId);if(!revision)throw new Error('Choose a collected piece.');const bytes=await store.blobs.get(revision.snapshotHash);if(!bytes)throw new Error('The saved piece is missing.');await inspectEntry({record:revision,snapshot:bytes});
 const zip=await loadBoundedZip(bytes);const project=JSON.parse(await zip.file('story.chatter.json')!.async('string')) as PortableStoryProject;
 project.projectId=`group-copy-${newId()}`;project.story={...project.story,status:'WORK',group:undefined,body:{type:'doc',content:groupWritingContent(revision.body)},attachedAssetIds:project.assets.map(item=>item.record.id)};project.groupArchive=undefined;
 // Imported contributor display names are not local sign-in badges or adviser authority.
 project.users=project.users.map(u=>({...u,role:'STUDENT'}));zip.file('story.chatter.json',JSON.stringify(project));
 const imported=await importPortableStory(store,gate,new File([await zip.generateAsync({type:'blob'})],`${revision.title}.chatter`),{isolatedUsers:true});
 return store.stories.update(imported.story.id,{ownerId:actor.id,group:{code:revision.groupCode,rootId:revision.rootId,kind:revision.kind,contributionId:revision.contributionId,authorId:actor.id,authorName:actor.penName,baseRevisionId:revision.id,lastRevisionId:revision.id}});
}
function editableTarget(story:Story,actor:User,revision:GroupRevision):void {
 if(story.status==='DONE')throw new Error('Published stories stay finished. Start a follow-up story.');
 if(!story.group||story.group.code!==revision.groupCode||(story.group.rootId&&revision.rootId&&story.group.rootId!==revision.rootId))throw new Error('Choose work from this group story.');
 if(story.ownerId!==actor.id&&actor.role!=='ADVISER')throw new Error('Ask the lead or adviser to update this draft.');
}
async function savedRevision(store:Store,revisionId:string):Promise<GroupRevision>{
 const revision=await store.groupRevisions.get(revisionId);if(!revision)throw new Error('Choose a collected piece.');const snapshot=await store.blobs.get(revision.snapshotHash);if(!snapshot)throw new Error('The saved piece is missing.');await inspectEntry({record:revision,snapshot});return revision;
}
export async function adoptGroupWriting(store:Store,storyId:string,revisionId:string,actor:User):Promise<Story>{
 await flushSessionCheckpoints(store);let story=await store.stories.get(storyId);if(!story?.group)throw new Error('Open the group draft.');const revision=await savedRevision(store,revisionId);editableTarget(story,actor,revision);if(story.group.kind==='piece')throw new Error('Open the group draft to combine writing.');
 if(story.group.kind==='main'){await captureGroupRevision(store,story.id);story=(await store.stories.get(story.id))!;}
 editableTarget(story,actor,revision);
 const group=story.group!;
 return store.stories.update(story.id,{ownerId:story.ownerId??actor.id,body:{type:'doc',content:groupWritingContent(revision.body)},group:{...group,kind:'main',rootId:group.rootId??revision.rootId,usedRevisionIds:[...new Set([...(group.usedRevisionIds??[]),revision.id])]}});
}
/** Import an isolated editable source through Gate, then make its media selectable in the target. */
export async function attachGroupMedia(store:Store,gate:Gate,revisionId:string,targetStoryId:string,actor:User):Promise<Story>{
 await flushSessionCheckpoints(store);const target=await store.stories.get(targetStoryId);if(!target?.group)throw new Error('Open a group story first.');const revision=await savedRevision(store,revisionId);editableTarget(target,actor,revision);
 const copy=await openGroupRevision(store,gate,revisionId,actor);
 const credits=await store.credits.list() as Credit[];const sourceCredits=credits.filter(c=>c.storyId===copy.id);
 const ids=new Set([...(copy.attachedAssetIds??[]),...sourceCredits.map(c=>c.assetId)]);
 const provenance=`Group contribution ${revision.id} by ${revision.authorName}`;
 const sounds=(await store.soundProjects.list()).filter(p=>p.storyId===copy.id);const soundIds=new Set(sounds.map(p=>p.id));
 for(const project of sounds)for(const id of soundSourceAssetIds(project))ids.add(id);
 for(const sound of await store.soundRevisions.list())if(soundIds.has(sound.projectId)){ids.add(sound.assetId);for(const id of sound.sourceAssetIds)ids.add(id);}
 // Rendered media is a saved output, not a Gate asset, until it passes local review.
 for(const output of await store.deliverables.list())if(output.storyId===copy.id&&/^(image|audio|video)\//.test(output.mime)){
  const bytes=await store.blobs.get(output.blobHash);if(!bytes)throw new Error('A collected media export is missing.');
  const kind=output.mime.startsWith('image/')?'IMAGE':output.mime.startsWith('audio/')?'AUDIO':'VIDEO';
  const result=await gate.ingest({source:'generated',bytes,ownDevice:false,meta:{kind,mime:output.mime,origin:'GENERATED',creator:revision.authorName}});
  if(!result.assetId)throw new Error('A collected media export could not pass local media review.');
  ids.add(result.assetId);sourceCredits.push({id:`output-${output.id}`,createdAt:0,updatedAt:0,storyId:copy.id,assetId:result.assetId,usedIn:`Rendered ${output.title}`});
 }

 for(const assetId of ids){
  const descriptions=sourceCredits.filter(c=>c.assetId===assetId).map(c=>`${c.usedIn} — ${provenance}`);if(!descriptions.length)descriptions.push(provenance);
  for(const usedIn of descriptions)if(!credits.some(c=>c.storyId===target.id&&c.assetId===assetId&&c.usedIn===usedIn))await store.credits.create({storyId:target.id,assetId,usedIn});
 }
 const fresh=(await store.stories.get(target.id))!;editableTarget(fresh,actor,revision);
 return store.stories.update(target.id,{ownerId:fresh.ownerId??actor.id,attachedAssetIds:[...new Set([...(fresh.attachedAssetIds??[]),...ids])],group:{...fresh.group!,usedRevisionIds:[...new Set([...(fresh.group!.usedRevisionIds??[]),revision.id])]}});
}
