import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mergeJournal,validateJournal,legacyJournal,clone,directionPlan} from '../src/syncModel.js'
import {writeJournal,readJournal,BUNDLE_ID} from '../src/syncTransport.js'
import {DEFAULT_CATEGORIES} from '../src/categories.js'
import {DEFAULT_PROJECTS} from '../src/projects.js'
import {defaultRewards} from '../src/rewards.js'
import {migrationEntities} from '../src/cloudMigration.js'
const blank=()=>({records:[],categories:clone(DEFAULT_CATEGORIES),projects:clone(DEFAULT_PROJECTS),deliverables:[],goals:{},todos:{},rewards:defaultRewards()})
const record=(id,title=id)=>({id,title,date:'2026-11-13',start:'09:00',end:'10:00',category:'核心工作',project:'项目1',note:'',coreMinutes:45})

test('independent device additions and all data domains survive merge',()=>{
 const base=blank(),local=clone(base),remote=clone(base)
 local.records=[record('a')];remote.records=[record('b')]
 local.todos={'2026-11-13':[{id:'todo',text:'整理',done:false}]}
 remote.goals={'2026-11-13':{text:'完成报告',minutes:300}}
 const {journal}=mergeJournal(base,local,remote)
 assert.equal(journal.records.length,2);assert.equal(journal.todos['2026-11-13'].length,1);assert.equal(journal.goals['2026-11-13'].minutes,300)
})
test('remote deletion propagates, does not resurrect on stale devices',()=>{
 const base=blank();base.records=[record('a')]
 assert.deepEqual(mergeJournal(base,base,blank()).journal.records,[])
 assert.deepEqual(mergeJournal(base,blank(),base).journal.records,[])
})
test('concurrent edit/edit and edit/delete require explicit choice',()=>{
 const base=blank();base.records=[record('a')]
 const local=clone(base);local.records[0].title='本地'
 const remote=clone(base);remote.records[0].title='云端'
 assert.equal(mergeJournal(base,local,remote).conflicts.length,1)
 assert.equal(mergeJournal(base,local,remote,{'records/a':'remote'}).journal.records[0].title,'云端')
 assert.equal(mergeJournal(base,local,blank()).conflicts.length,1)
 assert.equal(mergeJournal(base,local,blank(),{'records/a':'remote'}).journal.records.length,0)
})
test('project rename plus stale remote additions never creates broken links',()=>{
 const base=blank(),local=clone(base),remote=clone(base)
 local.projects[0].name='新名称';remote.records=[record('b')]
 const result=mergeJournal(base,local,remote)
 assert.equal(result.journal,null);assert.match(result.error,/关联/)
})
test('deliverable UTC times, linkage, archives, rewards and order round-trip',()=>{
 const data=blank();data.projects[0].archived=true
 data.deliverables=[{id:'d',projectId:'项目1',name:'测试',milestoneName:'初稿',dueAt:'2026-11-20T10:00:00+08:00',milestoneAt:null,completedAt:null}]
 data.records=[{...record('a'),deliverableId:'d'}]
 data.rewards.wishlist=[{id:'wish',name:'书',cents:5000,url:''}]
 const rows=migrationEntities(data).map(r=>({...r,revision:1,deleted:false}))
 assert.deepEqual(legacyJournal(rows),data)
 assert.deepEqual(mergeJournal(data,data,data).journal,data)
})
test('rejects malformed or duplicate records before sync',()=>{
 const data=blank();data.records=[record('a'),record('a')]
 assert.throws(()=>validateJournal(data),/重复/)
 data.records=[{...record('a'),date:'2026-02-30'}]
 assert.throws(()=>validateJournal(data),/日期/)
})
test('preserves multiple work-purpose categories supported by existing category settings',()=>{
 const data=blank();data.categories.push({id:'another-core',name:'另一工作分类',color:'#a78bfa',kind:'core'})
 assert.deepEqual(validateJournal(data).categories,data.categories)
})

function server(){
 let row=null
 return {get row(){return clone(row)},from(){return {select(){return {eq(){return this},maybeSingle:async()=>({data:clone(row)})}}}},
 async rpc(_name,args){
  if(_name==='journal_legacy_token')return {data:'synthetic-token'}
  if((row?.revision||0)!==args.p_revision)return {error:{code:'40001'}}
  row={entity_type:'order',entity_id:BUNDLE_ID,payload:clone(args.p_payload),revision:(row?.revision||0)+1,deleted:false}
  return {data:clone(row)}
 }}
}
test('atomic compare-and-swap prevents stale overwrite',async()=>{
 const client=server(),first=blank();first.records=[record('a')]
 await writeJournal(client,first,0)
 const deviceA=await readJournal(client),deviceB=await readJournal(client)
 deviceA.journal.records[0].title='A';deviceB.journal.records[0].title='B'
 await writeJournal(client,deviceA.journal,deviceA.revision)
 await assert.rejects(writeJournal(client,deviceB.journal,deviceB.revision),/其他设备/)
 assert.equal((await readJournal(client)).journal.records[0].title,'A')
})
test('lost network acknowledgement can be retried without duplicates',async()=>{
 const client=server(),data=blank();data.records=[record('a')]
 await writeJournal(client,data,0) // Server committed; pretend device never got the response.
 const remote=await readJournal(client)
 const merged=mergeJournal(null,data,remote.journal)
 assert.equal(merged.journal.records.length,1)
 assert.equal(remote.revision,1)
})
test('edits during upload rebase onto received remote additions',()=>{
 const before=blank(),during=blank(),synced=blank()
 during.records=[record('local')];synced.records=[record('remote')]
 assert.equal(mergeJournal(before,during,synced).journal.records.length,2)
})

test('direction choices replace whole journals or merge independent changes',()=>{
 const base=blank(),local=blank(),remote=blank()
 local.records=[record('local')];remote.records=[record('remote')]
 assert.deepEqual(directionPlan(base,local,remote,'upload').journal,local)
 assert.deepEqual(directionPlan(base,local,remote,'restore').journal,remote)
 assert.equal(directionPlan(base,local,remote,'merge').journal.records.length,2)
 assert.equal(directionPlan(base,local,null,'restore').journal,null)
})
test('cloud save timestamps survive transport; checking does not manufacture update time',async()=>{
 const client=server(),data=blank()
 const result=await writeJournal(client,data,0)
 assert.equal(result.revision,1)
 assert.equal(result.updatedAt,null)
 assert.equal((await readJournal(client)).updatedAt,null)
 const timestamp='2026-11-13T19:30:00.000Z'
 const fixed={from(){return {select(){return {eq(){return this},maybeSingle:async()=>({data:{payload:{format:'journal-v2',journal:data},revision:4,updated_at:timestamp}})}}}},rpc:async()=>({data:'legacy-token'})}
 assert.equal((await readJournal(fixed)).updatedAt,timestamp)
 assert.equal((await readJournal(fixed)).updatedAt,timestamp)
})
