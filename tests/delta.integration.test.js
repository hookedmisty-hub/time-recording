// Run with PGLITE_MODULE pointing to @electric-sql/pglite, or install that package locally.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createEncryption,unlockEncryption,encryptJournal,changeEncryptionPassphrase} from '../src/journalCrypto.js'
import {readJournal,writeJournal} from '../src/syncTransport.js'
import {mergeJournal} from '../src/syncModel.js'
import {DEFAULT_CATEGORIES} from '../src/categories.js'
import {DEFAULT_PROJECTS} from '../src/projects.js'
import {defaultRewards} from '../src/rewards.js'
let PGlite
try{({PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'))}catch{/* Optional integration runtime; see supabase/DELTA_SYNC.md. */}
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',pass='synthetic-integration-passphrase'
const empty=()=>({records:[],categories:structuredClone(DEFAULT_CATEGORIES),projects:structuredClone(DEFAULT_PROJECTS),deliverables:[],goals:{},todos:{},rewards:defaultRewards()})
const record=id=>({id,title:`Private activity ${id}`,date:'2026-11-13',start:'09:00',end:'10:00',category:'核心工作',project:'项目1',coreMinutes:45})
test('PostgreSQL encrypted delta transport and migration', {skip:!PGlite},async t=>{
 const db=new PGlite();t.after(()=>db.close())
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon;`)
 for(const file of ['001_sync.sql','002_encrypted_sync.sql','003_sync_receipt.sql','004_delta_sync.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'))
 await db.query('insert into auth.users(id) values($1),($2)',[uid,other])
 let queue=Promise.resolve()
 function client(userId,role='authenticated'){
  const calls=[]
  const query=(sql,args=[])=>{
   const job=queue.then(async()=>{
    await db.exec(`begin; set local role ${role};`)
    try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[userId||'']);const result=await db.query(sql,args);await db.exec('commit');return {data:result.rows}}
    catch(e){await db.exec('rollback');return {error:{code:e.code,message:e.message}}}
   });queue=job.then(()=>{});return job
  }
  return {calls,query,from(table){assert.equal(table,'journal_entities');return {select(columns){const filters=[];return {eq(k,v){filters.push([k,v]);return this},async maybeSingle(){const {data,error}=await query(`select ${columns} from public.journal_entities where ${filters.map(([k],i)=>`${k}=$${i+1}`).join(' and ')}`,filters.map(([,v])=>v));return {data:data?.[0]??null,error}}}}}},async rpc(name,args={}){
   assert.match(name,/^(journal_legacy_token|save_encrypted_journal_receipt|journal_delta_capability|read_journal_delta|save_journal_delta)$/)
   calls.push({name,args:structuredClone(args)})
   const {data,error}=await query(`select public.${name}(${Object.keys(args).map((key,i)=>`${key}=>$${i+1}`).join(',')}) as result`,Object.values(args));return {data:data?.[0]?.result,error}
  }}
 }
 const a=client(uid),b=client(uid),outsider=client(other),anon=client('', 'anon')
 const {unlocked,recoveryCode}=await createEncryption(uid,pass)
 const initial=empty();initial.records=Array.from({length:240},(_,i)=>record(String(i).padStart(4,'0')))
 initial.deliverables=[{id:'d',projectId:'项目1',name:'Private delivery',milestoneName:'Draft',dueAt:'2026-12-01T10:00:00+08:00',milestoneAt:null,completedAt:null}]
 initial.records[0].deliverableId='d'
 initial.goals['2026-11-12']={text:'Private goal',minutes:300}
 initial.todos['2026-11-12']=[{id:'todo',text:'Private todo',done:false}]
 initial.rewards.wishlist=[{id:'wish',name:'Private wish',cents:5000,url:''}]
 // Seed the exact encrypted full-bundle format used in production before migration.
 await writeJournal(a,initial,0,unlocked,await a.rpc('journal_legacy_token').then(r=>r.data))
 const old=await readJournal(a,unlocked)
 assert.equal(old.envelope.syncFormat,undefined)
 const migration=await writeJournal(a,initial,old.revision,unlocked,null,old)
 assert.equal(migration.delta,true)
 assert.equal(a.calls.at(-1).args.p_changes.length,246)
 assert.equal(JSON.stringify(a.calls.at(-1).args).includes('Private activity'),false)
 const locked=await readJournal(b)
 assert.equal(locked.locked,true)
 const keyB=await unlockEncryption(locked.envelope,uid,pass)
 const full=await readJournal(b,keyB,null,{revision:locked.revision,envelope:locked.envelope})
 assert.equal(full.journal.records.length,240)
 assert.deepEqual(full.journal,initial,'all domains, reward state, task links and timezones survive migration')
 assert.equal(b.calls.filter(c=>c.name==='read_journal_delta').length,2,'first download paginated')
 const known={encrypted:true,revision:full.revision,base:full.journal}
 const next=structuredClone(full.journal);next.records[0].title='changed private title'
 const unchanged=await readJournal(a,unlocked,{encrypted:true,revision:full.revision,base:full.journal})
 assert.equal(unchanged.envelope.syncFormat,'journal-delta-v1','unchanged checks preserve the delta header without an external cache')
 const changed=await writeJournal(a,next,full.revision,unlocked,null,unchanged)
 assert.equal(a.calls.at(-1).args.p_changes.length,1,'only one encrypted record uploaded')
 const downloaded=await readJournal(b,keyB,known,{revision:full.revision,envelope:full.envelope})
 assert.equal(downloaded.journal.records[0].title,'changed private title')
 assert.equal(b.calls.at(-1).args.p_since,full.revision)
 const deltaResponse=await b.rpc('read_journal_delta',{p_revision:changed.revision,p_since:full.revision,p_after:'',p_limit:200})
 assert.equal(deltaResponse.data.items.length,1,'only one encrypted record downloaded')
 const readCount=b.calls.length
 await readJournal(b,keyB,{encrypted:true,revision:downloaded.revision,base:downloaded.journal},{revision:downloaded.revision,envelope:downloaded.envelope})
 assert.equal(b.calls.length,readCount,'unchanged revision makes no item RPC')
 await assert.rejects(writeJournal(b,initial,full.revision,keyB,null,full),/其他设备/)
 const deleted=structuredClone(downloaded.journal);deleted.records.shift()
 await writeJournal(a,deleted,downloaded.revision,unlocked,null,downloaded)
 const afterDelete=await readJournal(b,keyB,{encrypted:true,revision:downloaded.revision,base:downloaded.journal})
 assert.equal(afterDelete.journal.records.length,239)
 assert.equal(mergeJournal(downloaded.journal,downloaded.journal,afterDelete.journal).journal.records.length,239)
 const staleEdit=structuredClone(downloaded.journal);staleEdit.records[0].title='offline concurrent edit'
 assert.equal(mergeJournal(downloaded.journal,staleEdit,afterDelete.journal).conflicts.length,1,'edit/delete requires choice')
 // Distinct offline edits merge, then upload just the local difference from latest cloud.
 const local=structuredClone(afterDelete.journal);local.records.push(record('offline-added'))
 const remoteNext=structuredClone(afterDelete.journal);remoteNext.goals['2026-11-13']={text:'private goal',minutes:300}
 await writeJournal(a,remoteNext,afterDelete.revision,unlocked,null,afterDelete)
 const newer=await readJournal(b,keyB,{encrypted:true,revision:afterDelete.revision,base:afterDelete.journal})
 const merged=mergeJournal(afterDelete.journal,local,newer.journal)
 assert.equal(merged.conflicts.length,0)
 await writeJournal(b,merged.journal,newer.revision,keyB,null,newer)
 assert.equal(b.calls.at(-1).args.p_changes.length,1)
 const beforePassword=await readJournal(a,unlocked)
 const newKey=await changeEncryptionPassphrase(unlocked,'another-synthetic-passphrase')
 await writeJournal(a,beforePassword.journal,beforePassword.revision,newKey,null,beforePassword)
 assert.equal(a.calls.at(-1).args.p_changes.length,0,'password rewrap uploads no records')
 const newLocked=await readJournal(b)
 await assert.rejects(unlockEncryption(newLocked.envelope,uid,pass),/无法解锁/)
 await unlockEncryption(newLocked.envelope,uid,'another-synthetic-passphrase')
 await unlockEncryption(newLocked.envelope,uid,recoveryCode,true)
 assert.equal((await outsider.query('select * from public.journal_entities')).data.length,0)
 assert.ok((await outsider.rpc('read_journal_delta',{p_revision:newLocked.revision})).error)
 assert.ok((await anon.rpc('read_journal_delta',{p_revision:newLocked.revision})).error)
 assert.ok((await a.query('select * from public.journal_delta_items')).error,'direct table reads denied')
 const downgrade=await a.rpc('save_encrypted_journal_receipt',{p_payload:await encryptJournal(initial,unlocked),p_revision:newLocked.revision})
 assert.ok(downgrade.error,'old clients cannot overwrite migrated account')
 const brokenClient={...a,async rpc(name,args){const result=await a.rpc(name,args);if(name==='read_journal_delta'&&result.data?.items.length)result.data.items.pop();return result}}
 await assert.rejects(readJournal(brokenClient,newKey),/完整性/)
 const tamperedClient={...a,async rpc(name,args){const result=await a.rpc(name,args);if(name==='read_journal_delta'&&result.data?.items.length)result.data.items[0].revision++;return result}}
 await assert.rejects(readJournal(tamperedClient,newKey),/验证失败|版本无效/)
 // Mid-pagination writes invalidate the read rather than installing a mixed snapshot.
 let raced=false
 const raceClient={...a,async rpc(name,args){const result=await a.rpc(name,args);if(name==='read_journal_delta'&&!raced){raced=true;const r=await readJournal(a,newKey);await writeJournal(a,r.journal,r.revision,newKey,null,r)}return result}}
 await assert.rejects(readJournal(raceClient,newKey),/读取期间/)
 // A failed transaction must leave both item rows and the head unchanged.
 const lastRemote=await readJournal(a,newKey)
 const countBefore=(await db.query('select count(*) as n from public.journal_delta_items where user_id=$1',[uid])).rows[0].n
 const failure=await a.rpc('save_journal_delta',{p_payload:lastRemote.envelope,p_revision:lastRemote.revision,p_changes:[{token:'A'.repeat(43),payload:{iv:'x',box:'x'}},{token:'B'.repeat(43),payload:{}}]})
 assert.ok(failure.error)
 assert.equal((await readJournal(a,newKey)).revision,lastRemote.revision)
 assert.equal((await db.query('select count(*) as n from public.journal_delta_items where user_id=$1',[uid])).rows[0].n,countBefore)
 // A brand-new account can start directly in delta format, isolated from account A.
 const otherKey=await createEncryption(other,pass)
 const token=(await outsider.rpc('journal_legacy_token')).data
 const fresh=await writeJournal(outsider,empty(),0,otherKey.unlocked,token,{revision:0,journal:null})
 assert.equal(fresh.delta,true)
 assert.equal((await readJournal(outsider,otherKey.unlocked)).journal.records.length,0)
 console.log('Verified migration, paging, one-item transfer, deletion, stale CAS, offline merge, key rewrap, recovery, RLS, downgrade, rollback and integrity guards.')
})
