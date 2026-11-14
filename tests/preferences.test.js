import test from 'node:test'
import assert from 'node:assert/strict'
import {validatePreferences} from '../src/preferences.js'
import {parseBundle} from '../src/backupBundle.js'
import {mergeJournal} from '../src/syncModel.js'
import {DEFAULT_CATEGORIES} from '../src/categories.js'
import {DEFAULT_PROJECTS} from '../src/projects.js'
import {defaultRewards} from '../src/rewards.js'
test('custom subtitle validates, survives backup and independent sync edits',()=>{
 assert.deepEqual(validatePreferences({subtitle:'  专注当下  '}),{subtitle:'专注当下'})
 assert.throws(()=>validatePreferences({subtitle:' '}))
 assert.throws(()=>validatePreferences({subtitle:'x'.repeat(161)}))
 const base={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards()}
 const local={...base,preferences:{subtitle:'专注当下'}}
 assert.equal(parseBundle(JSON.stringify({...local,version:'1.4'})).settings.preferences.subtitle,'专注当下')
 assert.equal(parseBundle(JSON.stringify({...base,version:'1.4'})).settings.preferences,undefined)
 const remote=structuredClone(base);remote.goals['2026-11-14']={text:'完成计划',minutes:300}
 const merged=mergeJournal(base,local,remote)
 assert.equal(merged.journal.preferences.subtitle,'专注当下')
 assert.equal(merged.journal.goals['2026-11-14'].minutes,300)
 const conflict=mergeJournal(local,{...local,preferences:{subtitle:'A'}},{...local,preferences:{subtitle:'B'}})
 assert.equal(conflict.conflicts[0].id,'preferences')
})
