import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyCheckins,validateCheckins,addCheckin,undoCheckin,checkinCount,weekBounds} from '../src/checkins.js'
import {validatePreferences} from '../src/preferences.js'
const item=(mode='multiple')=>({id:'habit',name:'练习',color:'#a78bfa',target:5,mode,archived:false})
test('week uses Monday through Sunday across year boundary',()=>assert.deepEqual(weekBounds('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'}))
test('multiple checkins count individually and undo removes only one',()=>{let d={...emptyCheckins(),items:[item()]};for(let i=0;i<8;i++)d=addCheckin(d,'habit','2026-11-16','2026-11-16');assert.equal(checkinCount(d,'habit','2026-11-16',true),8);d=undoCheckin(d,'habit','2026-11-16');assert.equal(d.events.length,7);assert.equal(checkinCount(d,'habit','2026-11-23',true),0)})
test('once a day, backfill, future and archive restrictions',()=>{let d={items:[item('once')],events:[]};d=addCheckin(d,'habit','2026-11-15','2026-11-16');assert.equal(addCheckin(d,'habit','2026-11-15','2026-11-16').events.length,1);assert.throws(()=>addCheckin(d,'habit','2026-11-17','2026-11-16'));d.items[0].archived=true;assert.throws(()=>addCheckin(d,'habit','2026-11-16','2026-11-16'));assert.equal(validateCheckins(d).events.length,1)})
test('preference roundtrip retains checkins, rejects duplicate events and invalid target',()=>{const d=addCheckin({items:[item()],events:[]},'habit','2026-11-16','2026-11-16');assert.deepEqual(validatePreferences(JSON.parse(JSON.stringify({subtitle:'test',checkins:d}))).checkins,d);assert.throws(()=>validateCheckins({...d,events:[...d.events,...d.events]}));assert.throws(()=>validateCheckins({items:[{...item('once'),target:8}],events:[]}))})
test('JSON backup and cloud merge retain full checkin history',async()=>{
 const {parseBundle}=await import('../src/backupBundle.js'),{mergeJournal}=await import('../src/syncModel.js'),{DEFAULT_CATEGORIES}=await import('../src/categories.js'),{DEFAULT_PROJECTS}=await import('../src/projects.js'),{defaultRewards}=await import('../src/rewards.js')
 const base={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards()}
 const data=addCheckin({items:[item()],events:[]},'habit','2026-11-16','2026-11-16'),local={...base,preferences:{subtitle:'test',checkins:data}}
 assert.deepEqual(parseBundle(JSON.stringify({...local,version:'1.4'})).settings.preferences.checkins,data)
 assert.deepEqual(mergeJournal(base,local,base).journal.preferences.checkins,data)
 assert.equal(parseBundle(JSON.stringify({...base,version:'1.3'})).settings.preferences,undefined)
})
test('manual counts accept zero and reset over-limit values including default weekly target',async()=>{
 const {setCheckinCount}=await import('../src/checkins.js')
 let d={items:[{...item(),dailyLimit:3}],events:[]}
 d=setCheckinCount(d,'habit','2026-11-16',3,'2026-11-16');assert.equal(d.events.length,3)
 d=setCheckinCount(d,'habit','2026-11-16',4,'2026-11-16');assert.equal(d.events.length,0)
 d=setCheckinCount(d,'habit','2026-11-16',2,'2026-11-16');d=setCheckinCount(d,'habit','2026-11-16',0,'2026-11-16');assert.equal(d.events.length,0)
 d.items[0].dailyLimit=null;assert.equal(setCheckinCount(d,'habit','2026-11-16',5,'2026-11-16').events.length,5);assert.equal(setCheckinCount(d,'habit','2026-11-16',6,'2026-11-16').events.length,0)
 assert.throws(()=>setCheckinCount(d,'habit','2026-11-16',-1,'2026-11-16'));assert.throws(()=>setCheckinCount(d,'habit','2026-11-16',1.5,'2026-11-16'))
 d.items[0].mode='once';d=setCheckinCount(d,'habit','2026-11-16',1,'2026-11-16');assert.equal(setCheckinCount(d,'habit','2026-11-16',2,'2026-11-16').events.length,0)
})
test('rule edits affect this week onward and preserve completed weeks and counts',async()=>{
 const {updateCheckinItem,checkinRule,checkinLimit,setCheckinCount}=await import('../src/checkins.js')
 let d={items:[item()],events:[]};d=setCheckinCount(d,'habit','2026-11-15',5,'2026-11-16');d=setCheckinCount(d,'habit','2026-11-16',5,'2026-11-16')
 d=updateCheckinItem(d,{...d.items[0],target:3,dailyLimit:2},'2026-11-16')
 assert.equal(d.events.length,10);assert.equal(checkinRule(d.items[0],'2026-11-15').target,5);assert.equal(checkinRule(d.items[0],'2026-11-16').target,3);assert.equal(checkinLimit(checkinRule(d.items[0],'2026-11-16')),2)
 d=updateCheckinItem(d,{...d.items[0],target:4},'2026-11-17');assert.equal(checkinRule(d.items[0],'2026-11-15').target,5);assert.equal(checkinRule(d.items[0],'2026-11-16').target,4)
 assert.throws(()=>updateCheckinItem(d,{...d.items[0],target:15,dailyLimit:2},'2026-11-16'),/每周最多/)
 d=updateCheckinItem(d,{...d.items[0],target:7,dailyLimit:null},'2026-11-23');assert.equal(checkinRule(d.items[0],'2026-11-16').target,4);assert.equal(checkinLimit(checkinRule(d.items[0],'2026-11-23')),7)
 assert.deepEqual(validatePreferences({subtitle:'test',checkins:d}).checkins,d)
})
test('lowered limits preserve historical excess on unchanged input and allow deliberate corrections',async()=>{
 const {updateCheckinItem,setCheckinCount}=await import('../src/checkins.js')
 let d={items:[item()],events:[]};d=setCheckinCount(d,'habit','2026-11-16',5,'2026-11-16');d=updateCheckinItem(d,{...d.items[0],dailyLimit:2,target:4},'2026-11-16')
 assert.deepEqual(setCheckinCount(d,'habit','2026-11-16',5,'2026-11-16'),d)
 assert.equal(setCheckinCount(d,'habit','2026-11-16',2,'2026-11-16').events.length,2)
 assert.equal(setCheckinCount(d,'habit','2026-11-16',0,'2026-11-16').events.length,0)
 const once=updateCheckinItem(d,{...d.items[0],mode:'once',target:3},'2026-11-16');assert.equal(once.events.length,5)
})
test('backfills use historical limits, while changing default limit follows weekly target',async()=>{
 const {updateCheckinItem,setCheckinCount,checkinRule,checkinLimit}=await import('../src/checkins.js')
 let d={items:[item()],events:[]};d=updateCheckinItem(d,{...d.items[0],target:2},'2026-11-16')
 assert.equal(checkinLimit(checkinRule(d.items[0],'2026-11-15')),5)
 assert.equal(setCheckinCount(d,'habit','2026-11-15',5,'2026-11-16').events.length,5)
 assert.equal(setCheckinCount(d,'habit','2026-11-16',3,'2026-11-16').events.length,0)
 assert.throws(()=>setCheckinCount(d,'habit','2026-11-17',1,'2026-11-16'))
 d.items[0].archived=true;assert.throws(()=>setCheckinCount(d,'habit','2026-11-15',1,'2026-11-16'))
})
