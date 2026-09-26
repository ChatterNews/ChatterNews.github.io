import {it,expect} from 'vitest';
import {groupWritingContent} from './group-writing.js';
it('keeps writing formatting without transferring images, links or foreign references',()=>{expect(groupWritingContent({type:'doc',content:[{type:'paragraph',attrs:{proofSourceId:'foreign'},content:[{type:'text',text:'The story',marks:[{type:'bold'},{type:'link',attrs:{href:'https://example.test'}}]}]},{type:'image',attrs:{src:'https://example.test/track.gif'}}]})).toEqual([{type:'paragraph',content:[{type:'text',text:'The story',marks:[{type:'bold'}]}]}]);});
