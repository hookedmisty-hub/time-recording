import test from 'node:test'
import assert from 'node:assert/strict'
import {calendarMonth,calendarWeek,validateCalendarEvents,recordCalendarSegment,deliverableEvents} from '../src/historyCalendar.js'
import {parseBundle} from '../src/backupBundle.js'
import {mergeJournal} from '../src/syncModel.js'
import {DEFAULT_CATEGORIES} from '../src/categories.js'
import {DEFAULT_PROJECTS} from '../src/projects.js'
import {defaultRewards} from '../src/rewards.js'
const event=()=>({id:'meeting1',title:'项目会议',kind:'event',date:'2026-11-18',start:'09:00',end:'10:00',allDay:false,color:'#60a5fa',note:'讨论方案'})
test('calendar dates cover full weeks and leap months',()=>{
 const cells=calendarMonth('2024-02-12');assert.equal(cells[0],'2024-01-29');assert.ok(cells.includes('2024-02-29'));assert.equal(cells.length%7,0)
 assert.deepEqual(calendarWeek('2027-01-01'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03'])
})
test('events validate dates and duration, permit timed or all day deadlines',()=>{
 assert.equal(validateCalendarEvents([event()]).length,1)
 for(const patch of [{date:'2026-02-30'},{end:'08:00'},{title:''},{color:'red'}])assert.throws(()=>validateCalendarEvents([{...event(),...patch}]))
 assert.equal(validateCalendarEvents([{...event(),kind:'deadline',end:''},{...event(),id:'all',allDay:true,start:'',end:''}]).length,2)
 assert.throws(()=>validateCalendarEvents([event(),event()]))
})
test('week logs split overnight and deliverable deadlines remain derived',()=>{
 const r={date:'2026-11-18',start:'23:00',end:'01:30'}
 assert.deepEqual(recordCalendarSegment(r,'2026-11-18'),{a:1380,b:1440});assert.deepEqual(recordCalendarSegment(r,'2026-11-19'),{a:0,b:90});assert.equal(recordCalendarSegment(r,'2026-11-20'),null)
 const d={id:'d1',name:'报告提交',dueAt:'2026-11-19T20:00:00Z'};const result=deliverableEvents([d,{id:'none'}]);assert.equal(result.length,1);assert.equal(result[0].deliverable,d)
})
test('events roundtrip JSON and encrypted journal merge as preferences without adding work records',()=>{
 const base={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards()}
 const local={...base,preferences:{subtitle:'测试',calendarEvents:[event()]}}
 const parsed=parseBundle(JSON.stringify({...local,version:'1.4'}));assert.equal(parsed.records.length,0);assert.deepEqual(parsed.settings.preferences.calendarEvents,[event()])
 assert.deepEqual(mergeJournal(base,local,base).journal.preferences.calendarEvents,[event()])
 assert.equal(parseBundle(JSON.stringify({...base,version:'1.4'})).records.length,0)
})
test('event preset keys retain semantic colors and survive backup',async()=>{
 const {EVENT_PRESETS,eventColor}=await import('../src/historyCalendar.js')
 const colors={deadline:'#fb7185',work:'#34d399',life:'#fbbf24',uncategorized:'#94a3b8'}
 for(const preset of EVENT_PRESETS){
  const e={...event(),eventKey:preset.key,kind:preset.key==='deadline'?'deadline':'event',color:preset.color}
  assert.equal(eventColor(e),colors[preset.key]);assert.equal(validateCalendarEvents([e])[0].eventKey,preset.key)
  const base={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards(),preferences:{subtitle:'测试',calendarEvents:[e]}}
  assert.equal(parseBundle(JSON.stringify({...base,version:'1.4'})).settings.preferences.calendarEvents[0].eventKey,preset.key)
 }
 assert.throws(()=>validateCalendarEvents([{...event(),eventKey:'deadline'}]))
 assert.equal(eventColor({...event(),kind:'deadline'}),'#fb7185')
})
test('dragging plans snaps to 15 minutes, preserves duration and metadata, and stays within day',async()=>{
 const {moveCalendarPlan}=await import('../src/historyCalendar.js')
 const {validatePlans}=await import('../src/plans.js')
 const p={id:'drag',date:'2026-11-18',title:'计划',start:'09:00',end:'11:00',tasks:[{id:'t',text:'待办',status:'done',executionLogId:'log1'}],notes:'保留笔记'}
 const next=moveCalendarPlan(p,'2026-11-19',607)
 assert.equal(next.start,'10:00');assert.equal(next.end,'12:00');assert.equal(next.date,'2026-11-19');assert.deepEqual(next.tasks,p.tasks);assert.equal(next.notes,p.notes)
 assert.equal(moveCalendarPlan(p,'2026-11-19',-25).start,'00:00')
 assert.equal(moveCalendarPlan(p,'2026-11-19',1439).start,'22:00');assert.equal(moveCalendarPlan(p,'2026-11-19',1439).end,'24:00')
 assert.equal(moveCalendarPlan(p,'2026-11-19').start,p.start);assert.equal(p.date,'2026-11-18')
 assert.equal(validatePlans([next]).length,1)
})
test('event drag preserves duration and all-day status, snaps weekly time and keeps deadline linkage',async()=>{
 const {moveCalendarEvent,calendarDate,calendarClock}=await import('../src/historyCalendar.js')
 const source={...event(),eventKey:'work',color:'#34d399'}
 const month=moveCalendarEvent(source,'2026-11-21');assert.equal(month.start,'09:00');assert.equal(month.end,'10:00');assert.equal(month.eventKey,'work');assert.equal(source.date,'2026-11-18')
 const week=moveCalendarEvent(source,'2026-11-22',607);assert.equal(week.start,'10:00');assert.equal(week.end,'11:00');validateCalendarEvents([week])
 const end=moveCalendarEvent(source,'2026-11-22',1450);assert.equal(end.start,'23:00');assert.equal(end.end,'24:00')
 const all=moveCalendarEvent({...source,allDay:true},'2026-11-23',650);assert.equal(all.allDay,true);assert.equal(all.start,'09:00')
 const delivery={id:'d1',name:'报告',projectId:'p1',dueAt:'2026-11-18T15:00:15.123Z',milestoneName:'初稿',completedAt:null}
 const derived=deliverableEvents([delivery])[0],moved=moveCalendarEvent(derived,'2026-11-24',615)
 assert.equal(moved.deliverable.id,delivery.id);assert.equal(moved.deliverable.milestoneName,'初稿');assert.equal(calendarDate(new Date(moved.deliverable.dueAt)),'2026-11-24');assert.equal(calendarClock(new Date(moved.deliverable.dueAt).getHours()*60+new Date(moved.deliverable.dueAt).getMinutes()),'10:15')
 assert.equal(new Date(moveCalendarEvent(derived,'2026-11-24').deliverable.dueAt).getSeconds(),15)
})
