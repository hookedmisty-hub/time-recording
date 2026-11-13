import {restoreDeviceEncryption} from './journalCrypto.js'
const DATABASE='time-recording-device-unlock-v1',STORE='keys'
const enc=new TextEncoder()
const context=(userId,keyId)=>enc.encode(`device-unlock-v1|${userId}|${keyId}`)
function openDatabase(){
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB)return reject(new Error('此浏览器不支持记住解锁，请继续使用手动解锁。'))
  const request=indexedDB.open(DATABASE,1)
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'userId'})
  request.onsuccess=()=>resolve(request.result)
  request.onerror=()=>reject(new Error('无法访问此设备的解锁存储。'))
  request.onblocked=()=>reject(new Error('解锁存储被占用，请关闭其他账本页面后重试。'))
 })
}
async function transaction(mode,action){
 const db=await openDatabase()
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),request=action(tx.objectStore(STORE))
  tx.oncomplete=()=>resolve(request.result)
  tx.onabort=tx.onerror=()=>reject(new Error('无法保存或清除设备解锁信息。'))
 })}finally{db.close()}
}
export async function rememberDeviceUnlock(unlocked){
 // Store a non-exportable wrapping key plus encrypted DEK; never the passphrase.
 const wrappingKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])
 const iv=crypto.getRandomValues(new Uint8Array(12))
 const box=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context(unlocked.userId,unlocked.keyId)},wrappingKey,unlocked.raw)
 await transaction('readwrite',store=>store.put({userId:unlocked.userId,keyId:unlocked.keyId,wrappingKey,iv,box}))
}
export async function forgetDeviceUnlock(userId){await transaction('readwrite',store=>store.delete(userId))}
export async function clearDeviceUnlocks(){if(globalThis.indexedDB)await transaction('readwrite',store=>store.clear())}
export async function restoreRememberedUnlock(userId,envelope){
 const saved=await transaction('readonly',store=>store.get(userId))
 if(!saved)return null
 try{
  if(saved.keyId!==envelope.keyId)throw new Error()
  const raw=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv,additionalData:context(userId,saved.keyId)},saved.wrappingKey,saved.box))
  return await restoreDeviceEncryption(envelope,userId,saved.keyId,raw)
 }catch{await forgetDeviceUnlock(userId);return null}
}
