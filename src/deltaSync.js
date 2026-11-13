import {journalEntities,same,validateJournal} from './syncModel.js'
import {encryptJournal,decryptJournal,encryptSyncItem,decryptSyncItem,syncDigest} from './journalCrypto.js'
export const DELTA_FORMAT='journal-delta-v1'
const PAGE_SIZE=200
export const isDelta=envelope=>envelope?.syncFormat===DELTA_FORMAT
const capabilities=new WeakMap()
export async function supportsDelta(client){
 if(capabilities.has(client))return capabilities.get(client)
 const {data,error}=await client.rpc('journal_delta_capability')
 // An old server can keep serving the old format until its migration is installed.
 if(error){if(['PGRST202','42883'].includes(error.code)){capabilities.set(client,false);return false}throw error}
 if(data!==1)throw new Error('云端增量同步版本不支持。')
 capabilities.set(client,true);return true
}
function journalFromEntities(map){
 const journal={records:[],deliverables:[],goals:{},todos:{}}
 for(const [path,value] of map){
  if(['categories','projects','rewards'].includes(path)){journal[path]=value;continue}
  const slash=path.indexOf('/'),field=path.slice(0,slash),id=path.slice(slash+1)
  if(slash<0||!id||!['records','deliverables','goals','todos'].includes(field)||['__proto__','constructor','prototype'].includes(id))throw new Error('未知增量记录类型。')
  if(Array.isArray(journal[field])){if(value?.id!==id)throw new Error('增量记录关联无效。');journal[field].push(value)}
  else Object.defineProperty(journal[field],id,{value,writable:true,enumerable:true,configurable:true})
 }
 journal.records.sort((a,b)=>a.id.localeCompare(b.id));journal.deliverables.sort((a,b)=>a.id.localeCompare(b.id))
 return validateJournal(journal)
}
export async function readDelta(client,head,unlocked,known){
 if(!unlocked)return {revision:head.revision,updatedAt:head.updated_at||null,journal:null,locked:true,envelope:head.payload}
 const index=await decryptJournal(head.payload,unlocked)
 if(index?.format!==DELTA_FORMAT||!Number.isSafeInteger(index.migrationRevision)||index.migrationRevision<1||index.migrationRevision>head.revision||typeof index.digest!=='string')throw new Error('增量索引无效。')
 const incremental=known?.encrypted&&known.base&&Number.isSafeInteger(known.revision)&&known.revision>=index.migrationRevision&&known.revision<=head.revision
 const since=incremental?known.revision:0
 const map=incremental?journalEntities(validateJournal(known.base)):new Map()
 let after='',last='',hasMore=true;const tokens=new Set(),paths=new Set()
 do{
  const {data,error}=await client.rpc('read_journal_delta',{p_revision:head.revision,p_since:since,p_after:after,p_limit:PAGE_SIZE})
  if(error){if(error.code==='40001')throw new Error('云端在读取期间有更新，请重新检查同步。');throw error}
  if(!data||data.revision!==head.revision||!Array.isArray(data.items)||data.items.length>PAGE_SIZE)throw new Error('增量同步响应不完整。')
  for(const item of data.items){
   if(item.revision<=since||item.revision>head.revision||tokens.has(item.token)||item.token<=last)throw new Error('增量同步版本无效。')
   tokens.add(item.token);last=item.token
   const body=await decryptSyncItem(item,unlocked)
   if(paths.has(body.path))throw new Error('增量记录重复。')
   paths.add(body.path)
   if(body.deleted)map.delete(body.path);else map.set(body.path,body.value)
  }
  if(typeof data.more!=='boolean')throw new Error('增量分页无效。')
  hasMore=data.more
  if(!hasMore)break
  if(!data.items.length)throw new Error('增量分页无效。')
  after=last
 }while(hasMore)
 if(await syncDigest(map)!==index.digest)throw new Error('增量账本完整性校验失败，请重新检查同步。')
 const journal=journalFromEntities(map)
 unlocked.deltaHead={revision:head.revision,envelope:head.payload}
 return {revision:head.revision,updatedAt:head.updated_at||null,journal,encrypted:true,envelope:head.payload,delta:true}
}
export async function writeDelta(client,journal,revision,unlocked,remote,legacyToken){
 const migrating=!isDelta(remote?.envelope)
 let migrationRevision=revision+1
 if(!migrating){
  const index=await decryptJournal(remote.envelope,unlocked)
  if(index?.format!==DELTA_FORMAT||!Number.isSafeInteger(index.migrationRevision))throw new Error('增量索引无效。')
  migrationRevision=index.migrationRevision
 }
 const current=journalEntities(journal),base=migrating?new Map():journalEntities(validateJournal(remote.journal))
 const changes=[]
 for(const path of new Set([...current.keys(),...base.keys()])){
  if(!migrating&&same(current.get(path),base.get(path)))continue
  changes.push(await encryptSyncItem(path,current.get(path),revision+1,unlocked))
 }
 const envelope={...await encryptJournal({format:DELTA_FORMAT,migrationRevision,digest:await syncDigest(current)},unlocked),syncFormat:DELTA_FORMAT}
 const {data,error}=await client.rpc('save_journal_delta',{p_payload:envelope,p_revision:revision,p_changes:changes,p_legacy_token:legacyToken??null})
 if(error){if(error.code==='40001')throw new Error('云端已被其他设备修改，请重新预览同步。');throw error}
 if(!data||data.revision!==revision+1)throw new Error('服务器没有确认增量同步结果，请重试。')
 unlocked.deltaHead={revision:data.revision,envelope}
 return {revision:data.revision,updatedAt:data.updated_at||null,envelope,delta:true}
}
