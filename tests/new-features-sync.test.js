import test from 'node:test'
import assert from 'node:assert/strict'
import {createEncryption,unlockEncryption,decryptSyncItem} from '../src/journalCrypto.js'
import {writeDelta,readDelta} from '../src/deltaSync.js'
import {mergeJournal} from '../src/syncModel.js'
import {DEFAULT_CATEGORIES} from '../src/categories.js'
import {DEFAULT_PROJECTS} from '../src/projects.js'
import {defaultRewards} from '../src/rewards.js'
import {moveCalendarPlan,moveCalendarEvent} from '../src/historyCalendar.js'
import {setCheckinCount,updateCheckinItem} from '../src/checkins.js'
import {assignPlanTask} from '../src/plans.js'
const empty=()=>({records:[],categories:structuredClone(DEFAULT_CATEGORIES),projects:structuredClone(DEFAULT_PROJECTS),deliverables:[],goals:{},todos:{},rewards:defaultRewards()})
test('two devices preserve calendar, plan/log tasks, DDL and checkins through encrypted incremental transport',async()=>{
 let revision=0,stored=new Map(),calls=[]
 const client={async rpc(name,args){calls.push({name,args:structuredClone(args)});if(name==='save_journal_delta'){
  assert.equal(args.p_revision,revision);revision++;for(const item of args.p_changes)stored.set(item.token,{...item,revision});return {data:{revision,updated_at:new Date().toISOString()}}
 }if(name==='read_journal_delta'){
  const rows=[...stored.values()].filter(x=>x.revision>args.p_since&&x.revision<=args.p_revision&&x.token>args.p_after).sort((a,b)=>a.token<b.token?-1:a.token>b.token?1:0);return {data:{revision:args.p_revision,items:rows.slice(0,args.p_limit),more:rows.length>args.p_limit}}
 }throw new Error(name)}}
 const uid='synthetic-calendar-audit',pass='synthetic-test-passphrase-only',a=await createEncryption(uid,pass)
 const journal=empty()
 let checkins={items:[{id:'habit',name:'练习',color:'#34d399',mode:'multiple',target:6,dailyLimit:3,archived:false},{id:'archived',name:'已归档',color:'#94a3b8',mode:'once',target:2,archived:true}],events:[]}
 checkins=setCheckinCount(checkins,'habit','2026-11-15',2,'2026-11-18');checkins=updateCheckinItem(checkins,{...checkins.items[0],target:7,dailyLimit:2},'2026-11-18')
 const plan={id:'plan',title:'Private plan',date:'2026-11-18',start:'09:00',end:'11:00',tasks:[{id:'task',text:'Private task',status:'pending'}],notes:'Private plan notes'}
 journal.preferences={subtitle:'自己的提醒',plans:[plan],calendarEvents:[{id:'event',title:'Private meeting',date:'2026-11-18',start:'14:00',end:'15:00',kind:'event',allDay:false,eventKey:'work',color:'#34d399',note:'Private event note'}],checkins}
 journal.records=[{id:'log',title:'Private log',date:'2026-11-18',start:'09:00',end:'10:00',category:'核心工作',project:'项目1',coreMinutes:45,logTasks:[{id:'own',text:'Private independent task',status:'pending'}]}]
 journal.deliverables=[{id:'ddl',projectId:'项目1',name:'Private deadline',milestoneName:'初稿',dueAt:'2026-11-20T20:00:00Z',milestoneAt:null,completedAt:null}]
 const first=await writeDelta(client,journal,0,a.unlocked,null)
 const head={revision:first.revision,payload:first.envelope,updated_at:first.updatedAt}
 const b=await unlockEncryption(first.envelope,uid,pass)
 const downloaded=await readDelta(client,head,b,null)
 assert.deepEqual(downloaded.journal,journal)
 const next=structuredClone(journal)
 next.preferences.plans=[assignPlanTask(moveCalendarPlan(plan,'2026-11-19',615),'task','done','log')]
 next.preferences.calendarEvents=next.preferences.calendarEvents.map(e=>moveCalendarEvent(e,'2026-11-19',900))
 next.preferences.checkins=setCheckinCount(next.preferences.checkins,'habit','2026-11-18',2,'2026-11-18')
 next.preferences.checkins.items.reverse();next.preferences.checkins.items[1].name='练习更新';next.preferences.checkins.items[1].color='#fbbf24'
 next.records[0].logTasks[0].status='done';next.deliverables[0].dueAt='2026-11-21T20:00:00Z'
 const second=await writeDelta(client,next,first.revision,a.unlocked,downloaded)
 const changes=calls.filter(x=>x.name==='save_journal_delta').at(-1).args.p_changes
 assert.equal(changes.length,3)
 assert.deepEqual((await Promise.all(changes.map(x=>decryptSyncItem({...x,revision:second.revision},a.unlocked)))).map(x=>x.path).sort(),['deliverables/ddl','preferences','records/log'])
 assert.equal(JSON.stringify(changes).includes('Private'),false)
 const secondRead=await readDelta(client,{revision:second.revision,payload:second.envelope,updated_at:second.updatedAt},b,{encrypted:true,revision:first.revision,base:downloaded.journal})
 assert.deepEqual(secondRead.journal,next)
 const deleted=structuredClone(next);deleted.preferences.calendarEvents=[];deleted.preferences.checkins.events=deleted.preferences.checkins.events.filter(e=>e.date!=='2026-11-18')
 const third=await writeDelta(client,deleted,second.revision,a.unlocked,secondRead)
 const thirdRead=await readDelta(client,{revision:third.revision,payload:third.envelope,updated_at:third.updatedAt},b,{encrypted:true,revision:second.revision,base:secondRead.journal})
 assert.deepEqual(thirdRead.journal,deleted)
 assert.equal(calls.filter(x=>x.name==='read_journal_delta').at(-1).args.p_since,second.revision)
 const concurrent=structuredClone(journal);concurrent.preferences.checkins.items[0].name='另一设备改名'
 const conflict=mergeJournal(journal,next,concurrent);assert.ok(conflict.conflicts.some(x=>x.id==='preferences'))
})
