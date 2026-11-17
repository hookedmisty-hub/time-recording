import test from 'node:test'
import assert from 'node:assert/strict'
import {validatePlans,savePlan,deferPlanTask,planLanes} from '../src/plans.js'
import {parseBundle} from '../src/backupBundle.js'
import {mergeJournal} from '../src/syncModel.js'
import {DEFAULT_CATEGORIES} from '../src/categories.js'
import {DEFAULT_PROJECTS} from '../src/projects.js'
import {defaultRewards} from '../src/rewards.js'
const p=()=>({id:'p1',date:'2026-11-17',title:'报告',start:'09:00',end:'11:00',categoryId:'核心科研',projectId:'',deliverableId:'',tasks:[{id:'t1',text:'提纲',status:'pending'}]})
test('plans reject invalid dates, reversed times and duplicate IDs; midnight end works',()=>{
 assert.equal(validatePlans([{...p(),end:'24:00'}]).length,1)
 for(const bad of [{date:'2026-02-30'},{start:'11:00'},{end:'08:00'},{tasks:[{id:'x',text:'t',status:'invalid'}]}])assert.throws(()=>validatePlans([{...p(),...bad}]))
 assert.throws(()=>validatePlans([p(),p()]))
 assert.equal(savePlan([p()],{...p(),title:'更新'})[0].title,'更新')
})
test('deferral retains source status and copies only the chosen task with fresh IDs',()=>{
 const result=deferPlanTask([p()],p(),'t1','2026-11-18');assert.equal(result.plans.length,2);assert.equal(result.source.tasks[0].status,'deferred');assert.equal(result.source.tasks[0].deferredTo,'2026-11-18');const next=result.plans[1];assert.equal(next.tasks[0].status,'pending');assert.notEqual(next.tasks[0].id,'t1');assert.equal(next.fromPlanId,'p1');assert.throws(()=>deferPlanTask([p()],p(),'t1','2026-11-16'))
})
test('overlapping blocks get lanes while adjacent blocks share a lane',()=>{
 const result=planLanes([{id:'a',a:0,b:60},{id:'b',a:30,b:90},{id:'c',a:90,b:120}]);assert.equal(result[0].columns,2);assert.notEqual(result[0].lane,result[1].lane);assert.equal(result[2].columns,1)
})
test('backup and cloud merge retain plan tasks and record associations; old backup stays compatible',()=>{
 const base={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards()}
 const records=[{id:'r1',title:'报告',date:'2026-11-17',start:'09:00',end:'10:00',category:'核心工作',coreMinutes:45,planId:'p1'}]
 const local={...base,records,preferences:{subtitle:'test',plans:[p()]}}
 const restored=parseBundle(JSON.stringify({...local,version:'1.4'}));assert.equal(restored.records[0].planId,'p1');assert.deepEqual(restored.settings.preferences.plans,[p()]);assert.deepEqual(mergeJournal(base,local,base).journal.preferences.plans,[p()]);assert.equal(parseBundle(JSON.stringify({...base,version:'1.3'})).settings.preferences,undefined)
})
test('execution status timestamps and history survive backup; invalid execution history is rejected',()=>{
 const at='2026-11-17T17:00:00.000Z',plan={...p(),tasks:[{...p().tasks[0],status:'done',statusAt:at,history:[{status:'done',at}]}]}
 assert.equal(validatePlans([plan])[0].tasks[0].statusAt,at)
 assert.throws(()=>validatePlans([{...plan,tasks:[{...plan.tasks[0],history:[{status:'unknown',at}]}]}]))
 const base={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards(),preferences:{subtitle:'test',plans:[plan]}}
 assert.deepEqual(parseBundle(JSON.stringify({...base,version:'1.4'})).settings.preferences.plans[0].tasks[0].history,[{status:'done',at}])
 const moved=deferPlanTask([plan],plan,'t1','2026-11-18');assert.equal(moved.source.tasks[0].history.at(-1).status,'deferred');assert.ok(moved.source.tasks[0].statusAt)
})
test('plan notes persist with tasks and backup, without changing actual records',()=>{
 const plan={...p(),notes:'参考链接\n下一步：检查材料'}
 const saved=savePlan([],plan)
 const base={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards(),preferences:{subtitle:'test',plans:saved}}
 const restored=parseBundle(JSON.stringify({...base,version:'1.4'}));assert.equal(restored.settings.preferences.plans[0].notes,plan.notes);assert.equal(restored.records.length,0)
 assert.throws(()=>validatePlans([{...plan,notes:'x'.repeat(20001)}]))
})
test('LOG edits existing linked records rather than creating overlapping duplicates',async()=>{
 const {planLogAction}=await import('../src/plans.js')
 const record={id:'r1',planId:'p1',title:'报告',date:'2026-11-17',start:'09:15',end:'09:55',note:'实际备注'}
 const records=[record,{id:'r2',planId:'different',title:'报告',date:'2026-11-17',start:'11:00',end:'12:00'}]
 const action=planLogAction({date:'2026-11-17',start:'09:00',end:'11:00'},records);assert.equal(action.type,'edit');assert.equal(action.records[0].id,'r1');assert.equal(action.records[0].start,'09:15');assert.equal(action.records[0].note,'实际备注');assert.equal(records.length,2)
 assert.equal(planLogAction({date:'2026-11-18',start:'09:00',end:'11:00'},records).type,'create')
 assert.equal(planLogAction({date:'2026-11-17',start:'09:00',end:'11:00'},[...records,{...record,id:'r3',start:'10:00',end:'10:30'}]).type,'choose')
})

test('overlap links all plans and handles overnight records without linking touching edges',async()=>{
 const {planOverlapsRecord}=await import('../src/plans.js')
 const plan={date:'2026-11-17',start:'09:00',end:'10:00'}
 assert.equal(planOverlapsRecord(plan,{date:plan.date,start:'08:30',end:'09:01'}),true)
 assert.equal(planOverlapsRecord(plan,{date:plan.date,start:'10:00',end:'11:00'}),false)
 assert.equal(planOverlapsRecord(plan,{date:plan.date,start:'08:00',end:'09:00'}),false)
 assert.equal(planOverlapsRecord({date:'2026-11-18',start:'00:00',end:'01:00'},{date:'2026-11-17',start:'23:00',end:'00:30'}),true)
 assert.equal(planOverlapsRecord({date:'2026-11-18',start:'00:00',end:'01:00'},{date:'2026-11-17',start:'23:00',end:'24:00'}),false)
})
test('plan task execution belongs to one log and returns to all logs when pending',async()=>{
 const {tasksForLog,assignPlanTask}=await import('../src/plans.js')
 const records=[{id:'a',date:'2026-11-17',start:'09:00',end:'09:30'},{id:'b',date:'2026-11-17',start:'10:00',end:'10:30'}]
 let plan=p()
 assert.equal(tasksForLog(plan,'a',records).length,1);assert.equal(tasksForLog(plan,'b',records).length,1)
 plan=assignPlanTask(plan,'t1','done','b');validatePlans([plan])
 assert.equal(plan.tasks.length,1);assert.equal(tasksForLog(plan,'a',records).length,0);assert.equal(tasksForLog(plan,'b',records).length,1)
 plan=assignPlanTask(plan,'t1','cancelled','b');assert.equal(tasksForLog(plan,'a',records).length,0)
 plan=assignPlanTask(plan,'t1','pending','b');assert.equal(tasksForLog(plan,'a',records).length,1);assert.equal(tasksForLog(plan,'b',records).length,1)
})
test('independent LOG tasks and plan execution ownership survive backup and cloud merge',async()=>{
 const {assignPlanTask}=await import('../src/plans.js')
 const plan=assignPlanTask(p(),'t1','done','r1')
 const r={id:'r1',title:'报告',date:'2026-11-17',start:'09:00',end:'10:00',category:DEFAULT_CATEGORIES[0].name,logTasks:[{id:'own1',text:'独立补充',status:'done',statusAt:new Date().toISOString()}]}
 const base={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards()}
 const journal={...base,records:[r],preferences:{subtitle:'test',plans:[plan]}}
 const restored=parseBundle(JSON.stringify({...journal,version:'1.4'}))
 assert.equal(restored.records[0].logTasks[0].text,'独立补充');assert.equal(restored.settings.preferences.plans[0].tasks[0].executionLogId,'r1')
 const merged=mergeJournal(base,journal,base).journal
 assert.equal(merged.records[0].logTasks[0].status,'done');assert.equal(merged.preferences.plans[0].tasks.length,1)
 assert.throws(()=>parseBundle(JSON.stringify({...journal,version:'1.4',records:[{...r,logTasks:[{id:'x',text:'',status:'done'}]}]})))
})
