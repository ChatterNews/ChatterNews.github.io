import {sha256,type Asset,type Credit,type Store} from '@chatter/shared';

const RASTER_MIMES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
export interface StoryPicture {id:string;label:string;credit:string}
function attribution(asset:Asset,credits:Credit[]):string{
 const creator=asset.creator?.trim()||credits.find(c=>c.usedIn.trim())?.usedIn||'Story photo';
 return [creator,asset.license==='OWN'?'Original photo':asset.license].filter(Boolean).join(' · ');
}
async function members(store:Store,storyId:string){
 const story=await store.stories.get(storyId);if(!story)throw new Error('Open your story again.');
 const credits=(await store.credits.list()).filter(c=>c.storyId===storyId);
 return {story,credits,ids:new Set([...(story.attachedAssetIds??[]),...credits.map(c=>c.assetId)])};
}
/** List labels only: quarantined or foreign images are never previewed. */
export async function listStoryPictures(store:Store,storyId:string):Promise<StoryPicture[]>{
 const {credits,ids}=await members(store,storyId);const pictures:StoryPicture[]=[];
 for(const id of ids){const asset=await store.assets.get(id);if(!asset||asset.kind!=='IMAGE'||asset.gateStatus!=='APPROVED'||!RASTER_MIMES.has(asset.mime))continue;
  const own=credits.filter(c=>c.assetId===id);const credit=attribution(asset,own);pictures.push({id,label:(own.find(c=>c.usedIn.trim())?.usedIn||asset.creator||'Story photo').slice(0,180),credit});
 }
 return pictures;
}
function rasterBytes(bytes:Uint8Array,mime:string):boolean{
 const prefix=(values:number[])=>values.every((v,i)=>bytes[i]===v);
 if(mime==='image/png')return prefix([137,80,78,71,13,10,26,10]);
 if(mime==='image/jpeg')return prefix([255,216,255]);
 if(mime==='image/gif')return prefix([71,73,70,56])&&(bytes[4]===55||bytes[4]===57)&&bytes[5]===97;
 return mime==='image/webp'&&prefix([82,73,70,70])&&[87,69,66,80].every((v,i)=>bytes[i+8]===v);
}
function dataUrl(bytes:Uint8Array,mime:string):Promise<string>{
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('This photo could not be read.'));reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('This photo could not be read.'));reader.readAsDataURL(new Blob([bytes as BlobPart],{type:mime}));});
}
/** Keep the writing copy small; the full original remains a portable source attachment. */
async function writingImage(bytes:Uint8Array,mime:string):Promise<string>{
 if(bytes.length<=128*1024)return dataUrl(bytes,mime);
 const image=await createImageBitmap(new Blob([bytes as BlobPart],{type:mime}));
 try{
  const canvas=document.createElement('canvas');
  for(const edge of [1200,800,500]){
   const scale=Math.min(1,edge/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('The photo display copy could not be prepared.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('The photo display copy could not be prepared.')),'image/webp',.8));
   if(blob.size<=128*1024)return dataUrl(new Uint8Array(await blob.arrayBuffer()),blob.type);
  }
  throw new Error('This photo needs a smaller display copy before adding it to the writing. Its original is still attached.');
 }finally{image.close();}
}
/** Recheck membership and Gate approval at use time, then embed durable local bytes. */
export async function pickStoryPicture(store:Store,storyId:string,assetId:string):Promise<{src:string;credit:string}>{
 const {story,credits,ids}=await members(store,storyId);if(story.status==='DONE')throw new Error('Published stories stay finished.');
 const asset=await store.assets.get(assetId);if(!ids.has(assetId)||!asset||asset.kind!=='IMAGE'||asset.gateStatus!=='APPROVED')throw new Error('Choose an approved photo attached to this story.');
 if(!RASTER_MIMES.has(asset.mime))throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
 const bytes=await store.blobs.get(asset.sha256);if(!bytes)throw new Error('This photo’s saved bytes are missing. Bring in the complete story again.');
 if(await sha256(bytes)!==asset.sha256||!rasterBytes(bytes,asset.mime))throw new Error('This image is damaged or is not a supported PNG, JPEG, WebP or GIF.');
 const own=credits.filter(c=>c.assetId===assetId);const credit=attribution(asset,own);const src=await writingImage(bytes,asset.mime);
 if(!own.length)await store.credits.create({storyId,assetId,usedIn:credit});
 return {src,credit};
}
