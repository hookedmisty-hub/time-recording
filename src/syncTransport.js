import {readCloud} from './cloudMigration.js'
import {legacyJournal,validateJournal} from './syncModel.js'
import {encryptJournal,decryptJournal} from './journalCrypto.js'
export const BUNDLE_ID='journal-v2'
async function legacyToken(client){const {data,error}=await client.rpc('journal_legacy_token');if(error)throw error;return data}
function encryptedResult(data,unlocked){
 if(!unlocked)return {revision:data.revision,updatedAt:data.updated_at||null,journal:null,locked:true,envelope:data.payload}
 return decryptJournal(data.payload,unlocked).then(journal=>({revision:data.revision,updatedAt:data.updated_at||null,journal:validateJournal(journal),encrypted:true,envelope:data.payload}))
}
export async function readJournal(client,unlocked,known,cached) {
  if((unlocked&&known?.encrypted&&known.base)||cached?.envelope){
    const {data,error}=await client.from('journal_entities').select('revision,deleted,updated_at').eq('entity_type','order').eq('entity_id',BUNDLE_ID).maybeSingle()
    if(error)throw error
    if(data?.deleted)throw new Error('云端账本已被标记删除，请先核查。')
    if(data&&unlocked&&known?.encrypted&&data.revision===known.revision)
      return {revision:data.revision,updatedAt:data.updated_at||null,journal:validateJournal(known.base),encrypted:true,envelope:cached?.revision===data.revision?cached.envelope:unlocked.header}
    if(data&&cached?.envelope&&data.revision===cached.revision)
      return encryptedResult({...data,payload:cached.envelope},unlocked)
  }
  const {data,error}=await client.from('journal_entities').select('*').eq('entity_type','order').eq('entity_id',BUNDLE_ID).maybeSingle()
  if(error)throw error
  if(data){
    if(data.deleted)throw new Error('云端账本已被标记删除，请先核查。')
    if(data.payload?.format==='journal-e2ee-v1'){
      return encryptedResult(data,unlocked)
    }
    if(data.payload?.format!=='journal-v2'||!Number.isSafeInteger(data.revision))throw new Error('云端同步格式不支持。')
    return {revision:data.revision,updatedAt:data.updated_at||null,journal:validateJournal(data.payload.journal),legacy:false,legacyToken:await legacyToken(client)}
  }
  const token=await legacyToken(client)
  const rows=(await readCloud(client)).filter(r=>!(r.entity_type==='order'&&r.entity_id===BUNDLE_ID))
  const legacy=legacyJournal(rows)
  const updatedAt=rows.reduce((latest,r)=>Number.isFinite(Date.parse(r.updated_at))&&(!latest||Date.parse(r.updated_at)>Date.parse(latest))?r.updated_at:latest,null)
  if(token!==await legacyToken(client))throw new Error('云端旧数据在读取期间发生变化，请重新预览。')
  return {revision:0,updatedAt,journal:legacy,legacy:Boolean(legacy),legacyToken:token}
}
export async function writeJournal(client,journal,revision,unlocked,token=null) {
  validateJournal(journal)
  // One CAS write commits all related domains together. No partial project/record updates.
  const envelope=unlocked?await encryptJournal(journal,unlocked):null
  const {data,error}=unlocked?await client.rpc('save_encrypted_journal_receipt',{p_payload:envelope,p_revision:revision,p_legacy_token:token}):
    await client.rpc('save_journal_entity',{p_type:'order',p_id:BUNDLE_ID,p_payload:{format:'journal-v2',journal},p_revision:revision,p_deleted:false})
  if(error){if(error.code==='40001')throw new Error('云端已被其他设备修改，请重新预览同步。');throw error}
  if(!data||!Number.isSafeInteger(data.revision))throw new Error('服务器没有确认同步结果，请重试。')
  return {revision:data.revision,updatedAt:data.updated_at||null,...(envelope?{envelope}:{})}
}
