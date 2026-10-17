import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './mvu-fixture.js';import {archiveLibraryPage} from '../src/archive-library.js';import {normalizeArchiveBatch} from '../src/archive-review.js';
test('type filtering includes both dedicated and generic records and composes with status and search without mutations',()=>{
 const p={archives:{a:{id:'a',type:'population',name:'守军',status:'active',fields:{purpose:'守城'},updatedAt:2},b:{id:'b',type:'population',name:'工匠',status:'planned',fields:{purpose:'守城器械'},updatedAt:1,specific:{adapterId:'own',recordId:'crew',label:'人员'}},c:{id:'c',type:'facility',name:'守城塔',status:'active',fields:{purpose:'守城'},updatedAt:3}}};const before=JSON.stringify(p);
 assert.equal(archiveLibraryPage(p,{type:'population'}).matched,2);assert.equal(archiveLibraryPage(p,{type:'population',status:'active',query:'守城'}).matched,1);assert.equal(archiveLibraryPage(p,{type:'population',category:'own/crew'}).rows[0].id,'b');assert.equal(JSON.stringify(p),before);
});
test('renamed display labels continue accepting older population and related labels',()=>{
 const f=fixture(),batch=normalizeArchiveBatch({changes:[{type:'种群',name:'守军',status:'active',sourceIndex:-1,fields:{scale:'六人'}},{type:'environment',name:'城防区域',status:'active',sourceIndex:-1,fields:{location:'城墙',关联种群与设施:'守军与岗哨'}}]},f.power,[],[],'玩家确认已有守军和城防区域');assert.equal(batch.issues.length,0);assert.equal(batch.changes[0].type,'population');assert.equal(batch.changes[1].patch.related,'守军与岗哨');
});
