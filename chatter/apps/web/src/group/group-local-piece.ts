import { newId, type Gate, type Store, type Story, type User } from '@chatter/shared';
import { exportPortableStory, importPortableStory } from '../portable/portable-project.js';
import { loadBoundedZip } from './group-archive.js';
import { captureGroupRevision } from './group-work.js';

/** Explicitly copies an existing local project into a group; the source stays intact. */
export async function copyLocalGroupPiece(store:Store,gate:Gate,sourceId:string,target:Story,actor:User):Promise<Story>{
 if(!target.group)throw new Error('Start or join the group story first.');
 const source=await store.stories.get(sourceId);if(!source)throw new Error('Choose an existing story.');
 const packed=await exportPortableStory(store,source,{omitGroupHistory:true});const zip=await loadBoundedZip(packed.blob);const project=JSON.parse(await zip.file('story.chatter.json')!.async('string'));
 project.projectId=`group-piece-${newId()}`;project.story={...project.story,group:undefined,status:'WORK'};project.groupArchive=undefined;
 zip.file('story.chatter.json',JSON.stringify(project));
 const imported=await importPortableStory(store,gate,new File([await zip.generateAsync({type:'blob'})],'copy.chatter'),{isolatedUsers:true});
 const copy=await store.stories.update(imported.story.id,{ownerId:actor.id,group:{code:target.group.code,rootId:target.group.rootId,kind:'piece',contributionId:newId(),authorId:actor.id,authorName:actor.penName}});
 await captureGroupRevision(store,copy.id);return copy;
}
