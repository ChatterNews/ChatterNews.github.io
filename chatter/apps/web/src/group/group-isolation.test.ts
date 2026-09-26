import {expect,it} from 'vitest';
import {MemoryStore,Gate,DEFAULT_GATE_CONFIG} from '@chatter/shared';
import {exportPortableStory,importPortableStory} from '../portable/portable-project.js';
const gate=(store:MemoryStore)=>new Gate(store,DEFAULT_GATE_CONFIG,{ready:true,async classify(){return 0;}});
it('isolated copies preserve local shows and transcripts even when titles and media hashes match',async()=>{
 const source=new MemoryStore();const destination=new MemoryStore();await source.open();await destination.open();
 const story=await source.stories.create({title:'Contribution'});const data=new Uint8Array([7,8,9]);
 const original=await gate(source).ingest({source:'upload',bytes:data,ownDevice:false,meta:{kind:'AUDIO',mime:'audio/wav',origin:'UPLOAD'}});await source.stories.update(story.id,{attachedAssetIds:[original.assetId!]});await source.transcripts.create({assetId:original.assetId!,text:'Received transcript',segments:[]});
 const show=await source.podcastShows.create({title:'Shared title',description:'Received show',hostIds:[],defaultVoicePreset:'CLEAN',nextEpisodeNumber:1});await source.podcastProjects.create({title:'Contribution episode',description:'',showId:show.id,storyIds:[story.id],episodeType:'FULL',explicit:false,state:'DRAFT',segments:[],tracks:[],clips:[],chapters:[],targetLufs:-16,truePeakDb:-1});
 const localAsset=await gate(destination).ingest({source:'upload',bytes:data,ownDevice:false,meta:{kind:'AUDIO',mime:'audio/wav',origin:'UPLOAD'}});const localTranscript=await destination.transcripts.create({assetId:localAsset.assetId!,text:'Local corrections',segments:[]});const localShow=await destination.podcastShows.create({title:'Shared title',description:'Local description',hostIds:[],defaultVoicePreset:'CLEAN',nextEpisodeNumber:9});
 const exported=await exportPortableStory(source,(await source.stories.get(story.id))!);const file=new File([exported.blob],exported.fileName);
 const first=await importPortableStory(destination,gate(destination),file,{isolatedUsers:true});const second=await importPortableStory(destination,gate(destination),file,{isolatedUsers:true});
 expect(await destination.transcripts.get(localTranscript.id)).toEqual(localTranscript);expect(await destination.podcastShows.get(localShow.id)).toEqual(localShow);expect(first.story.id).not.toBe(second.story.id);expect(await destination.podcastShows.list()).toHaveLength(3);expect(await destination.podcastProjects.list()).toHaveLength(2);
});
