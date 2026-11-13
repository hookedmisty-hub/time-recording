import test from 'node:test'
import assert from 'node:assert/strict'
import {researchAllocation} from '../src/research.js'

test('core categories split entered minutes; auxiliary categories never contribute core time',()=>{
 const record={start:'23:30',end:'00:30',coreMinutes:45}
 assert.deepEqual(researchAllocation(record,'core'),{core:45,research:15})
 assert.deepEqual(researchAllocation(record,'research'),{core:0,research:60})
 const slices=[researchAllocation(record,'core',0,30),researchAllocation(record,'core',30,30)]
 assert.equal(slices.reduce((n,x)=>n+x.core,0),45)
 assert.deepEqual(researchAllocation(record,'research',30,30),{core:0,research:30})
 assert.deepEqual(researchAllocation(record,'other'),{core:0,research:0})
})
