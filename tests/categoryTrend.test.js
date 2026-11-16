import test from 'node:test'
import assert from 'node:assert/strict'
import {trendDays,categoryTrendTotals} from '../src/categoryTrend.js'
test('weekly and calendar month ranges handle year boundaries and leap years',()=>{
 assert.deepEqual([trendDays('2027-01-03','week')[0],trendDays('2027-01-03','week').at(-1)],['2026-12-28','2027-01-03'])
 assert.equal(trendDays('2028-02-15','month').length,29)
 assert.equal(trendDays('2026-11-16','month').length,30)
 assert.equal(trendDays('2026-11-16','month')[0],'2026-11-01')
})
test('category lines preserve allocated core, auxiliary remainder and ordinary time',()=>{
 const categories=[{id:'核心科研',name:'核心',kind:'core'},{id:'辅助科研',name:'辅助',kind:'research'},{id:'a',name:'会议',kind:'research'},{id:'b',name:'运动',kind:'other'}]
 const result=categoryTrendTotals([{category:'核心',segmentCore:45,segmentAuxiliary:15,segmentMinutes:60},{category:'会议',segmentCore:0,segmentAuxiliary:30,segmentMinutes:30},{category:'运动',segmentMinutes:20}],categories)
 assert.deepEqual(result,{'核心科研':45,'辅助科研':15,a:30,b:20})
})
