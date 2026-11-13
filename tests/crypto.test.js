import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createEncryption,unlockEncryption,encryptJournal,decryptJournal,changeEncryptionPassphrase} from '../src/journalCrypto.js'
import {readJournal,writeJournal} from '../src/syncTransport.js'
import {DEFAULT_CATEGORIES} from '../src/categories.js'
import {DEFAULT_PROJECTS} from '../src/projects.js'
import {defaultRewards} from '../src/rewards.js'
import {mergeJournal} from '../src/syncModel.js'
const pass='synthetic-only-test-passphrase',uid='synthetic-user-a'
const journal={records:[],categories:DEFAULT_CATEGORIES,projects:DEFAULT_PROJECTS,deliverables:[],goals:{},todos:{},rewards:defaultRewards()}
test('ciphertext can be unlocked on a second device with password or recovery',async()=>{
 const {unlocked,recoveryCode}=await createEncryption(uid,pass)
 const content={privateTitle:'机密笔记',nested:{hours:8}},envelope=await encryptJournal(content,unlocked)
 assert.equal(JSON.stringify(envelope).includes('机密笔记'),false)
 assert.equal(JSON.stringify(envelope).includes(pass),false)
 assert.equal(JSON.stringify(envelope).includes(recoveryCode),false)
 const deviceB=await unlockEncryption(envelope,uid,pass)
 const deviceC=await unlockEncryption(envelope,uid,recoveryCode,true)
 assert.deepEqual(await decryptJournal(envelope,deviceB),content)
 assert.deepEqual(await decryptJournal(envelope,deviceC),content)
 const again=await encryptJournal(content,unlocked)
 assert.notEqual(envelope.data.iv,again.data.iv)
 assert.notEqual(envelope.data.box,again.data.box)
})
test('wrong password/account/key and ciphertext tampering fail closed',async()=>{
 const {unlocked}=await createEncryption(uid,pass),envelope=await encryptJournal(journal,unlocked)
 await assert.rejects(unlockEncryption(envelope,uid,'incorrect-test-password'),/无法解锁/)
 await assert.rejects(unlockEncryption(envelope,'another-user',pass),/无法解锁/)
 const damaged=structuredClone(envelope);damaged.data.box=(damaged.data.box[0]==='A'?'B':'A')+damaged.data.box.slice(1)
 await assert.rejects(decryptJournal(damaged,unlocked),/解密失败/)
 const wrong=await createEncryption(uid,pass)
 await assert.rejects(decryptJournal(envelope,wrong.unlocked),/密钥已变化/)
})
test('recovery unlock can replace passphrase without losing data',async()=>{
 const original=await createEncryption(uid,pass),envelope=await encryptJournal(journal,original.unlocked)
 const recovered=await unlockEncryption(envelope,uid,original.recoveryCode,true)
 const changed=await changeEncryptionPassphrase(recovered,'replacement-test-passphrase')
 const next=await encryptJournal(journal,changed)
 await assert.rejects(unlockEncryption(next,uid,pass),/无法解锁/)
 const unlocked=await unlockEncryption(next,uid,'replacement-test-passphrase')
 assert.deepEqual(await decryptJournal(next,unlocked),journal)
 await unlockEncryption(next,uid,original.recoveryCode,true)
 // Already unlocked devices retain access; changing a password is not device revocation.
 assert.deepEqual(await decryptJournal(next,original.unlocked),journal)
})
test('locked cloud is distinct from an empty journal; transport only sends ciphertext',async()=>{
 let row
 const client={from(){return {select(){return {eq(){return this},maybeSingle:async()=>({data:row})}}}},async rpc(name,args){
  assert.equal(name,'save_encrypted_journal_receipt');assert.equal(args.p_payload.journal,undefined)
  assert.equal(args.p_payload.data.box.includes('核心工作'),false)
  row={revision:1,deleted:false,payload:args.p_payload};return {data:row}
 }}
 const {unlocked}=await createEncryption(uid,pass)
 await writeJournal(client,journal,0,unlocked)
 const locked=await readJournal(client)
 assert.equal(locked.locked,true);assert.equal(locked.journal,null)
 const restored=await readJournal(client,await unlockEncryption(row.payload,uid,pass))
 assert.deepEqual(restored.journal,journal)
})
test('weak initialization and unbounded KDF parameters are rejected',async()=>{
 await assert.rejects(createEncryption(uid,'short'),/12/)
 const {unlocked}=await createEncryption(uid,pass),envelope=await encryptJournal({},unlocked)
 envelope.password.iterations=999999999
 await assert.rejects(unlockEncryption(envelope,uid,pass),/不支持/)
})
test('two encrypted devices reconcile offline edits, additions and deletion after reconnect',async()=>{
 let row,offline=false,fullReads=0
 const client={from(){return {select(columns){if(columns==='*')fullReads++;return {eq(){return this},maybeSingle:async()=>offline?{error:new Error('offline')}:{data:structuredClone(row)}}}}},async rpc(_name,args){
  if(offline)return {error:new Error('offline')}
  if((row?.revision||0)!==args.p_revision)return {error:{code:'40001'}}
  row={payload:args.p_payload,revision:(row?.revision||0)+1,deleted:false};return {data:structuredClone(row)}
 }}
 const a=await createEncryption(uid,pass)
 const start=structuredClone(journal)
 const record=id=>({id,title:id,date:'2026-11-13',start:'10:00',end:'11:00',category:'核心工作',project:'项目1'})
 start.records=[record('first')]
 await writeJournal(client,start,0,a.unlocked)
 const bKey=await unlockEncryption(row.payload,uid,pass)
 const baseA=(await readJournal(client,a.unlocked)).journal,baseB=(await readJournal(client,bKey)).journal
 const aLocal=structuredClone(baseA);aLocal.records[0].title='offline edit'
 offline=true
 await assert.rejects(readJournal(client,a.unlocked),/offline/)
 assert.equal(aLocal.records[0].title,'offline edit')
 offline=false
 const bLocal=structuredClone(baseB);bLocal.records.push(record('second'))
 await writeJournal(client,bLocal,1,bKey)
 const cloud=await readJournal(client,a.unlocked),combined=mergeJournal(baseA,aLocal,cloud.journal)
 assert.equal(combined.journal.records.length,2)
 await writeJournal(client,combined.journal,cloud.revision,a.unlocked)
 const bRemote=await readJournal(client,bKey),bCombined=mergeJournal(baseB,bLocal,bRemote.journal).journal
 assert.equal(bCombined.records.find(r=>r.id==='first').title,'offline edit')
 const bDeleted=structuredClone(bCombined);bDeleted.records=bDeleted.records.filter(r=>r.id!=='first')
 await writeJournal(client,bDeleted,bRemote.revision,bKey)
 const final=await readJournal(client,a.unlocked)
 assert.deepEqual(mergeJournal(combined.journal,combined.journal,final.journal).journal.records.map(r=>r.id),['second'])
 const before=fullReads
 await readJournal(client,a.unlocked,{encrypted:true,base:final.journal,revision:final.revision})
 assert.equal(fullReads,before,'unchanged revision should not download full encrypted journal')
})

test('unlock and manual checks reuse ciphertext, but always verify the current revision',async()=>{
 const setup=await createEncryption(uid,pass)
 let row={revision:1,updated_at:'2026-11-13T20:00:00Z',payload:await encryptJournal(journal,setup.unlocked),deleted:false},full=0,heads=0
 const client={from(){return {select(columns){if(columns==='*')full++;else heads++;return {eq(){return this},maybeSingle:async()=>({data:columns==='*'?structuredClone(row):{revision:row.revision,deleted:row.deleted,updated_at:row.updated_at}})}}}}}
 const locked=await readJournal(client)
 const cached={revision:locked.revision,envelope:locked.envelope}
 const key=await unlockEncryption(locked.envelope,uid,pass)
 assert.deepEqual((await readJournal(client,key,null,cached)).journal,journal)
 await readJournal(client,key,null,cached)
 assert.equal(full,1);assert.equal(heads,2)
 row={...row,revision:2,payload:await encryptJournal({...journal,goals:{'2026-11-13':{text:'新目标',minutes:300}}},key)}
 const newer=await readJournal(client,key,null,cached)
 assert.equal(full,2);assert.equal(newer.journal.goals['2026-11-13'].text,'新目标')
 row.deleted=true
 await assert.rejects(readJournal(client,key,null,cached),/标记删除/)
})
test('encrypted save accepts a metadata-only receipt and keeps the sent ciphertext in memory',async()=>{
 const {unlocked}=await createEncryption(uid,pass)
 let sent
 const client={async rpc(name,args){assert.equal(name,'save_encrypted_journal_receipt');sent=args.p_payload;return {data:{revision:9,updated_at:'2026-11-13T21:00:00Z'}}}}
 const saved=await writeJournal(client,journal,8,unlocked)
 assert.equal(saved.revision,9);assert.equal(saved.updatedAt,'2026-11-13T21:00:00Z')
 assert.equal(saved.envelope,sent)
 assert.deepEqual(await decryptJournal(saved.envelope,unlocked),journal)
})
