import test from 'node:test'
import assert from 'node:assert/strict'
import {sleepSeries,workStartSeries,routineTimeLabel,defaultRoutineCategories} from '../src/routineStats.js'
const categories=[{id:'休息睡眠',name:'睡觉',kind:'other'},{id:'核心科研',name:'核心',kind:'core'},{id:'工作事务',name:'事务',kind:'other'},{id:'辅助科研',name:'辅助',kind:'research'}]
const r=(date,start,end,category,coreMinutes)=>({date,start,end,category,...(coreMinutes!==undefined?{coreMinutes}:{})})
test('sleep joins midnight-adjacent records and assigns longest sleep to wake date',()=>{
 const records=[r('2026-11-15','23:00','24:00','睡觉'),r('2026-11-16','00:00','07:30','睡觉'),r('2026-11-16','13:00','13:30','睡觉')]
 const result=sleepSeries(records,categories,['2026-11-15','2026-11-16','2026-11-17'],['休息睡眠'])
 assert.deepEqual(result[0],{date:'2026-11-15',bedtime:null,wake:null})
 assert.deepEqual(result[1],{date:'2026-11-16',bedtime:-60,wake:450})
 assert.equal(result[2].wake,null)
 assert.equal(sleepSeries(records,categories,['2026-11-16'],['休息睡眠'],'all')[0].wake,810)
})
test('after-midnight bedtime and missing dates retain actual clock semantics',()=>{
 assert.deepEqual(sleepSeries([r('2026-11-16','01:30','08:00','睡觉')],categories,['2026-11-16'],['休息睡眠'])[0],{date:'2026-11-16',bedtime:90,wake:480})
 assert.equal(routineTimeLabel(-30),'前日23:30')
 assert.equal(routineTimeLabel(0),'00:00')
 assert.equal(routineTimeLabel(1470),'次日00:30')
})
test('work starts use only same-date starts with positive core allocation',()=>{
 const records=[r('2026-11-15','23:00','01:00','核心',90),r('2026-11-16','07:00','08:00','核心',0),r('2026-11-16','09:20','10:00','核心',30),r('2026-11-16','08:10','08:30','事务'),r('2026-11-16','06:00','06:30','辅助',30)]
 assert.deepEqual(workStartSeries(records,categories,['2026-11-16','2026-11-17'],['工作事务']),[{date:'2026-11-16',core:560,business:490},{date:'2026-11-17',core:null,business:null}])
})
test('renamed categories are resolved by stable IDs',()=>{
 assert.deepEqual(defaultRoutineCategories(categories,'sleep'),['休息睡眠'])
 assert.deepEqual(defaultRoutineCategories(categories,'work'),['工作事务'])
})

test('category starts ignore midnight continuations but retain genuine midnight starts',async()=>{
 const {categoryStartSeries}=await import('../src/routineStats.js')
 const records=[{...r('2026-11-15','23:00','24:00','事务'),title:'同一任务'}, {...r('2026-11-16','00:00','01:00','事务'),title:'同一任务'},r('2026-11-16','09:00','10:00','事务')]
 assert.equal(categoryStartSeries(records,categories,['2026-11-16'],['工作事务'])[0]['工作事务'],540)
 assert.equal(categoryStartSeries([r('2026-11-16','00:00','01:00','事务')],categories,['2026-11-16'],['工作事务'])[0]['工作事务'],0)
 assert.equal(categoryStartSeries([r('2026-11-15','23:00','01:00','事务')],categories,['2026-11-16'],['工作事务'])[0]['工作事务'],null)
})
