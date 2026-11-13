import {test} from 'node:test'
import assert from 'node:assert/strict'
import {clearLocalJournal,LOGOUT_EVENT,createSyncSchedule,finishLocalLogout,saveLogoutChoice,shouldClearOnLogout} from '../src/localSession.js'
class Storage{
 constructor(entries){this.values=new Map(entries)}
 get length(){return this.values.size}
 key(i){return [...this.values.keys()][i]??null}
 getItem(k){return this.values.get(k)??null}
 setItem(k,v){this.values.set(k,String(v))}
 removeItem(k){this.values.delete(k)}
}
test('logout clears all app domains, plaintext sync baselines and saved pre-sync copies',()=>{
 const keys=['time-recording-v1','time-recording-categories-v1','time-recording-projects-v1','time-recording-deliverables-v1','time-recording-goals-v1','time-recording-todos-v1','time-recording-rewards-v1','time-recording-sync-v2','time-recording-before-sync-user-a','time-recording-before-sync-user-b','time-recording-local-updated-at-v1']
 const local=new Storage([...keys.map(k=>[k,'private']),['another-app-data','preserve']])
 const session=new Storage([['time-recording-session-copy','private'],['another-app-session','preserve']])
 clearLocalJournal(local,session,'synthetic-logout-event')
 for(const key of keys)assert.equal(local.getItem(key),null)
 assert.equal(local.getItem(LOGOUT_EVENT),'synthetic-logout-event')
 assert.equal(local.getItem('another-app-data'),'preserve')
 assert.equal(session.getItem('time-recording-session-copy'),null)
 assert.equal(session.getItem('another-app-session'),'preserve')
 clearLocalJournal(local,session,'another-event')
 assert.equal(local.getItem('another-app-data'),'preserve')
})
function clock(){
 let time=0,id=0
 const tasks=new Map()
 return {now:()=>time,setTimer(fn,delay){const key=++id;tasks.set(key,{fn,at:time+delay});return key},clearTimer(key){tasks.delete(key)},tick(n){time+=n;for(const [key,t] of [...tasks])if(t.at<=time){tasks.delete(key);t.fn()}}}
}
test('rapid local edits collapse into one sync and idle time alone does not start a sync',()=>{
 const c=clock(),calls=[];const s=createSyncSchedule(()=>calls.push(c.now()),c)
 c.tick(600000);assert.equal(calls.length,0)
 s.changed();c.tick(500);s.changed();c.tick(500);s.changed();c.tick(1199)
 assert.equal(calls.length,0)
 c.tick(1);assert.equal(calls.length,1)
})
test('focus and visibility events coalesce; later lifecycle checks are permitted',()=>{
 const c=clock(),calls=[];const s=createSyncSchedule(()=>calls.push(c.now()),c)
 s.resumed();s.resumed();assert.equal(calls.length,1)
 c.tick(29999);s.resumed();assert.equal(calls.length,1)
 c.tick(1);s.resumed();assert.equal(calls.length,2)
})
test('stopping on logout cancels queued syncs and prevents future checks',()=>{
 const c=clock(),calls=[];const s=createSyncSchedule(()=>calls.push('request'),c)
 s.changed();s.stop();c.tick(1200);s.resumed();s.changed();c.tick(60000)
 assert.deepEqual(calls,[])
})

test('keeping local data on logout preserves records, settings and account binding but pauses sync',()=>{
 const local=new Storage([['time-recording-v1','private-records'],['time-recording-categories-v1','private-settings'],['time-recording-before-sync-user','private-copy'],['time-recording-sync-v2',JSON.stringify({userId:'user-a',enabled:true,base:{records:['private']}})]])
 const session=new Storage([['time-recording-session-copy','private']])
 saveLogoutChoice(local,false)
 assert.equal(shouldClearOnLogout(local),false)
 finishLocalLogout(local,session,false,'keep-event')
 assert.equal(local.getItem('time-recording-v1'),'private-records')
 assert.equal(local.getItem('time-recording-categories-v1'),'private-settings')
 assert.equal(local.getItem('time-recording-before-sync-user'),'private-copy')
 const meta=JSON.parse(local.getItem('time-recording-sync-v2'))
 assert.equal(meta.enabled,false);assert.equal(meta.userId,'user-a');assert.deepEqual(meta.base,{records:['private']})
 assert.equal(local.getItem(LOGOUT_EVENT),'keep-event')
 assert.equal(shouldClearOnLogout(local),false,'other tabs must honor the same keep decision')
})
test('clearing on logout overrides a prior keep decision and removes all private copies',()=>{
 const local=new Storage([['time-recording-v1','private'],['another-app','keep']])
 const session=new Storage([['time-recording-session-copy','private']])
 saveLogoutChoice(local,false);saveLogoutChoice(local,true)
 assert.equal(shouldClearOnLogout(local),true)
 finishLocalLogout(local,session,true,'clear-event')
 assert.equal(local.getItem('time-recording-v1'),null)
 assert.equal(session.getItem('time-recording-session-copy'),null)
 assert.equal(local.getItem('another-app'),'keep')
 assert.equal(shouldClearOnLogout(local),true)
})
