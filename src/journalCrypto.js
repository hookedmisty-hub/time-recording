// Web Crypto primitives only; no key or passphrase is transmitted to the server.
const ITERATIONS=600000,FORMAT='journal-e2ee-v1'
const enc=new TextEncoder(),dec=new TextDecoder()
const random=n=>crypto.getRandomValues(new Uint8Array(n))
const b64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
function un64(text,max=16*1024*1024){
 if(typeof text!=='string'||!text.length||text.length>max||!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('加密数据格式无效。')
 return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))
}
const aes=raw=>crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt'])
const aad=(userId,keyId,purpose)=>enc.encode(`${FORMAT}|${userId}|${keyId}|${purpose}`)
async function derive(passphrase,salt){
 const material=await crypto.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveKey'])
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])
}
async function seal(key,bytes,additionalData){
 const iv=random(12),box=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,bytes)
 return {iv:b64(iv),box:b64(new Uint8Array(box))}
}
async function open(key,value,additionalData){
 const iv=un64(value?.iv,32),box=un64(value?.box)
 if(iv.length!==12)throw new Error('加密数据格式无效。')
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData},key,box))
}
function checkPassphrase(value){if(typeof value!=='string'||value.length<12||value.length>512)throw new Error('加密口令需要 12–512 个字符，请使用独立且不易猜测的长口令。')}
function checkEnvelope(e){
 if(e?.format!==FORMAT||typeof e.keyId!=='string'||e.keyId.length>80||e.password?.iterations!==ITERATIONS||un64(e.password?.salt,32).length!==16||!e.recovery)throw new Error('不支持的加密格式。')
}
export async function createEncryption(userId,passphrase){
 checkPassphrase(passphrase)
 const raw=random(32),recoveryRaw=random(32),salt=random(16),keyId=crypto.randomUUID()
 const passwordKey=await derive(passphrase,salt),recoveryKey=await aes(recoveryRaw)
 const header={format:FORMAT,keyId,password:{salt:b64(salt),iterations:ITERATIONS,...await seal(passwordKey,raw,aad(userId,keyId,'password'))},recovery:await seal(recoveryKey,raw,aad(userId,keyId,'recovery'))}
 const recoveryCode=b64(recoveryRaw);recoveryRaw.fill(0)
 return {unlocked:{userId,keyId,raw,key:await aes(raw),header},recoveryCode}
}
export async function unlockEncryption(envelope,userId,secret,recovery=false){
 checkEnvelope(envelope)
 try{
  const key=recovery?await aes(un64(secret.trim(),64)):await derive(secret,un64(envelope.password.salt,32))
  const raw=await open(key,recovery?envelope.recovery:envelope.password,aad(userId,envelope.keyId,recovery?'recovery':'password'))
  if(raw.length!==32)throw new Error()
  const unlocked={userId,keyId:envelope.keyId,raw,key:await aes(raw),header:{format:FORMAT,keyId:envelope.keyId,password:envelope.password,recovery:envelope.recovery}}
  // Verify the journal before accepting a key, not just the wrapping slot.
  await decryptJournal(envelope,unlocked)
  return unlocked
 }catch{throw new Error('无法解锁：口令或恢复密钥不正确，或云端数据已损坏。')}
}
export async function encryptJournal(journal,unlocked){
 return {...unlocked.header,data:await seal(unlocked.key,enc.encode(JSON.stringify(journal)),aad(unlocked.userId,unlocked.keyId,'journal'))}
}
export async function decryptJournal(envelope,unlocked){
 checkEnvelope(envelope)
 if(envelope.keyId!==unlocked?.keyId)throw new Error('加密密钥已变化，请重新解锁。')
 try{return JSON.parse(dec.decode(await open(unlocked.key,envelope.data,aad(unlocked.userId,unlocked.keyId,'journal'))))}
 catch{throw new Error('数据解密失败，未修改本地内容。')}
}
export async function changeEncryptionPassphrase(unlocked,passphrase){
 checkPassphrase(passphrase)
 const salt=random(16),key=await derive(passphrase,salt)
 return {...unlocked,header:{...unlocked.header,password:{salt:b64(salt),iterations:ITERATIONS,...await seal(key,unlocked.raw,aad(unlocked.userId,unlocked.keyId,'password'))}}}
}
export function forgetEncryption(unlocked){if(unlocked?.raw)unlocked.raw.fill(0)}
