import {useEffect,useRef,useState} from 'react'
import {cloudClient,accountClient} from './cloudClient.js'
import {readJournal,writeJournal} from './syncTransport.js'
import {clone,mergeJournal,same,validateJournal,directionPlan} from './syncModel.js'
import {createEncryption,unlockEncryption,forgetEncryption,changeEncryptionPassphrase} from './journalCrypto.js'
import {finishLocalLogout,saveLogoutChoice,shouldClearOnLogout,LOGOUT_EVENT,createSyncSchedule,IDLE_SYNC_INTERVAL} from './localSession.js'

const META='time-recording-sync-v2'
const LOCAL_TIME='time-recording-local-updated-at-v1'
const loadLocalTime=()=>{try{const value=localStorage.getItem(LOCAL_TIME);return Number.isFinite(Date.parse(value))?value:null}catch{return null}}
const DATA_KEYS=new Set(['time-recording-v1','time-recording-categories-v1','time-recording-projects-v1','time-recording-deliverables-v1','time-recording-goals-v1','time-recording-todos-v1','time-recording-rewards-v1',META])
const load=()=>{try{return JSON.parse(localStorage.getItem(META)||'null')}catch{return null}}
export function useCloudSync(snapshot,onApply){
 const current=useRef(snapshot),apply=useRef(onApply),running=useRef(false),epoch=useRef(0),pending=useRef(false)
 current.current=snapshot;apply.current=onApply
 const [session,setSession]=useState(null),[meta,setMeta]=useState(load),[busy,setBusy]=useState(false)
 const [status,setStatus]=useState('尚未启用双向同步'),[error,setError]=useState(''),[preview,setPreview]=useState(null)
 const unlocked=useRef(null),cipherCache=useRef(null)
 const [security,setSecurity]=useState({ready:false,locked:null,recoveryCode:'',saved:false})
 const external=useRef(false)
 const loggingOut=useRef(false),schedule=useRef(null)
 const [externalChange,setExternalChange]=useState(false)
 const [localUpdatedAt,setLocalUpdatedAt]=useState(loadLocalTime)
 const observed=useRef(snapshot),localTime=useRef(localUpdatedAt)
 const markTime=value=>{localTime.current=value;setLocalUpdatedAt(value);if(value)localStorage.setItem(LOCAL_TIME,value);else localStorage.removeItem(LOCAL_TIME)}
 useEffect(()=>{
  if(!same(observed.current,snapshot)){
   observed.current=snapshot
   try{markTime(new Date().toISOString())}catch{/* Journal persistence reports storage errors separately. */}
  }
 },[snapshot])
 const sessionRef=useRef(session),metaRef=useRef(meta),securityRef=useRef(security)
 sessionRef.current=session;metaRef.current=meta;securityRef.current=security
 const persist=next=>{localStorage.setItem(META,JSON.stringify(next));metaRef.current=next;setMeta(next)}
 const clearAndReload=(clearLocal=true)=>{
  epoch.current++;pending.current=true;schedule.current?.stop()
  forgetEncryption(unlocked.current);unlocked.current=null;cipherCache.current=null;sessionRef.current=null
  finishLocalLogout(window.localStorage,window.sessionStorage,clearLocal)
  window.location.reload()
 }
 const clearRef=useRef(clearAndReload)
 useEffect(()=>{clearRef.current=clearAndReload})
 useEffect(()=>{
  let active=true
  const invalidate=()=>{epoch.current++}
  cloudClient.auth.getSession().then(({data,error})=>{if(active){if(error)setError(error.message);setSession(data.session)}})
  const {data}=cloudClient.auth.onAuthStateChange((_event,next)=>{
   if(_event==='SIGNED_OUT'&&(sessionRef.current?.user.id||metaRef.current?.userId)&&!loggingOut.current){clearRef.current(shouldClearOnLogout(window.localStorage));return}
   if(sessionRef.current?.user.id!==next?.user.id){cipherCache.current=null;epoch.current++;pending.current=false;forgetEncryption(unlocked.current);unlocked.current=null;setSecurity({ready:false,locked:null,recoveryCode:'',saved:false});setPreview(null);setStatus('账号已变化，请确认同步设置')}
   sessionRef.current=next;setSession(next)
  })
  return()=>{active=false;invalidate();data.subscription.unsubscribe()}
 },[])
 const credentials=async()=>{
  if(loggingOut.current)throw new Error('正在退出登录。')
  if(external.current)throw new Error('另一个标签页修改了本地账本，请刷新此页后继续。')
  const {data,error}=await cloudClient.auth.getSession()
  if(error)throw error
  if(!data.session)throw new Error('请先登录。')
  return {id:data.session.user.id,client:accountClient(data.session.access_token)}
 }
 const readForAccount=async(id,client,key,known)=>{
  const cached=cipherCache.current?.userId===id?cipherCache.current:null
  const remote=await readJournal(client,key,known,cached)
  if(remote.envelope?.data&&sessionRef.current?.user.id===id&&!loggingOut.current)
   cipherCache.current={userId:id,revision:remote.revision,envelope:remote.envelope}
  return remote
 }
 const guard=(id,token)=>{if(epoch.current!==token||sessionRef.current?.user.id!==id)throw new Error('账号或同步状态已变化，已停止本次操作。')}
 useEffect(()=>{
  const changed=event=>{
   if(event.key===LOGOUT_EVENT&&event.newValue){epoch.current++;schedule.current?.stop();forgetEncryption(unlocked.current);unlocked.current=null;window.location.reload();return}
   if(event.key!==null&&!DATA_KEYS.has(event.key))return
   if(event.oldValue===event.newValue)return
   external.current=true;epoch.current++;pending.current=true
   setExternalChange(true);setStatus('另一标签页修改了账本，需要刷新')
  }
  window.addEventListener('storage',changed)
  return()=>window.removeEventListener('storage',changed)
 },[])
 const makePlan=async(mode='merge',automatic=false)=>{
  if(running.current||(automatic&&pending.current))return
  running.current=true;if(!automatic){setBusy(true);setError('')}
  try{
   const {id,client}=await credentials(),token=epoch.current
   const m=metaRef.current
   if(automatic&&(!m?.enabled||m.userId!==id))return
   if(mode!=='restore'&&m&&m.userId!==id)throw new Error('当前本地账本曾关联另一账号。请先导出备份，再选择从当前账号的云端恢复；不会自动上传其他账号的数据。')
   const local=validateJournal(current.current),remote=await readForAccount(id,client,unlocked.current,m?.userId===id?m:null)
   guard(id,token)
   if(remote.locked){pending.current=true;setSecurity({ready:false,locked:remote.envelope,recoveryCode:'',saved:false});setPreview(null);setStatus('云端账本已加密，等待解锁');return}
   // Adopt current wrapping slots so a previously unlocked device cannot undo a
   // passphrase change made on another device when it next saves the journal.
   if(remote.encrypted&&unlocked.current)unlocked.current.header={format:remote.envelope.format,keyId:remote.envelope.keyId,password:remote.envelope.password,recovery:remote.envelope.recovery}
   if(automatic&&!unlocked.current){pending.current=true;setStatus('需要设置加密后才能启用同步');return}
   const base=m?.userId===id?m.base:null
   const merge=directionPlan(base,local,remote.journal,mode)
   if(mode==='restore'&&!remote.journal)throw new Error('云端还没有账本，不能恢复。')
   const identical=same(local,remote.journal)
   const p={id,token,local,remote,base,mode,localUpdatedAt:localTime.current,identical,...merge,allConflicts:merge.conflicts,choices:{}}
   if(identical&&m?.enabled&&m.userId===id){
    if(remote.encrypted&&(remote.revision!==m.revision||!same(m.base,local)))persist({...m,base:clone(local),revision:remote.revision,cloudUpdatedAt:remote.updatedAt,lastSync:new Date().toISOString()})
    pending.current=false
    if(!automatic){setPreview(null);setStatus('本地与云端一致');setError('')}
    return
   }
   if(automatic&&merge.journal&&!merge.conflicts.length&&!merge.error){await commit(p,client,true)}
   else {pending.current=true;setPreview(p);setStatus(merge.conflicts.length?'同步暂停：存在冲突':merge.error?'同步暂停：关联需要处理':'请确认同步预览')}
  }catch(err){setError(err.message);setStatus('同步暂停，本地修改仍保留')}
  finally{running.current=false;if(!automatic)setBusy(false)}
 }
 const inspect=useRef(makePlan)
 useEffect(()=>{inspect.current=makePlan})
 const accountId=session?.user.id
 useEffect(()=>{
  if(accountId)inspect.current(metaRef.current&&metaRef.current.userId!==accountId?'restore':'merge')
 },[accountId])
 const commit=async(p,client,automatic=false)=>{
  guard(p.id,p.token)
  if(!unlocked.current||unlocked.current.userId!==p.id)throw new Error('请先设置加密或解锁云端数据。')
  if(securityRef.current.recoveryCode&&!securityRef.current.saved)throw new Error('请先保存恢复密钥并勾选确认。')
  if(!same(p.local,current.current))throw new Error('预览后本地数据已变化，请重新预览。')
  if(!p.journal)throw new Error('请先处理全部冲突。')
  if(metaRef.current&&metaRef.current.userId!==p.id&&p.mode!=='restore')throw new Error('本地账本属于另一账号，只能选择云端覆盖本地。')
  // Store a recovery copy before the first replace/merge. Failure to save stops sync.
  if(!automatic)localStorage.setItem(`time-recording-before-sync-${p.id}`,JSON.stringify(p.local))
  let revision=p.remote.revision,updatedAt=p.remote.updatedAt
  if(!same(p.journal,p.remote.journal)||!p.remote.encrypted){const result=await writeJournal(client,p.journal,p.remote.revision,unlocked.current,p.remote.legacyToken);revision=result.revision;updatedAt=result.updatedAt;guard(p.id,p.token);cipherCache.current={userId:p.id,revision,envelope:result.envelope}}
  guard(p.id,p.token)
  const rebased=mergeJournal(p.local,current.current,p.journal)
  if(!rebased.journal)throw new Error('上传期间本地又有修改，已保留本地内容，请重新预览合并。')
  // onApply persists all app domains with rollback before updating React state.
  if(!same(rebased.journal,current.current)){apply.current(rebased.journal);current.current=rebased.journal;observed.current=rebased.journal}
  if(same(rebased.journal,p.journal))markTime(updatedAt||localTime.current)
  persist({userId:p.id,enabled:true,encrypted:true,base:clone(p.journal),revision,cloudUpdatedAt:updatedAt,lastSync:new Date().toISOString()})
  pending.current=false;setSecurity(s=>({...s,recoveryCode:''}));setPreview(null);setStatus(same(rebased.journal,p.journal)?'已加密同步':'已同步，本地还有新修改待上传');setError('')
 }
 const confirm=async()=>{
  if(running.current||!preview)return
  running.current=true;setBusy(true);setError('')
  try{const {id,client}=await credentials();if(id!==preview.id)throw new Error('账号已变更，请重新预览。');await commit(preview,client)}
  catch(err){setError(err.message);setStatus('同步暂停，本地修改仍保留')}
  finally{running.current=false;setBusy(false)}
 }
 const choose=(id,side)=>setPreview(old=>{
  if(!old)return old
  const choices={...old.choices,[id]:side}
  return {...old,choices,...mergeJournal(old.base,old.local,old.remote.journal,choices)}
 })
 const setMode=mode=>{
  if(!['merge','upload','restore'].includes(mode))return
  if(mode!=='restore'&&metaRef.current&&metaRef.current.userId!==sessionRef.current?.user.id){setError('本地账本曾关联另一账号，请选择云端覆盖本地。');return}
  setError('');setStatus(mode==='upload'?'请确认本地覆盖云端':mode==='restore'?'请确认云端覆盖本地':'请选择合并方式并确认')
  setPreview(old=>{
   if(!old)return old
   const plan=directionPlan(old.base,old.local,old.remote.journal,mode)
   return {...old,mode,...plan,allConflicts:plan.conflicts,choices:{}}
  })
 }
 const pause=()=>{epoch.current++;pending.current=false;if(metaRef.current)persist({...metaRef.current,enabled:false});setPreview(null);setStatus('已暂停同步')}
 const logout=async(clearLocal=true)=>{
  if(loggingOut.current)return
  loggingOut.current=true;epoch.current++;pending.current=true;schedule.current?.stop();cipherCache.current=null;setBusy(true);setError('');setPreview(null)
  forgetEncryption(unlocked.current);unlocked.current=null
  setSecurity({ready:false,locked:null,recoveryCode:'',saved:false});setStatus(clearLocal?'正在退出并清空本地数据':'正在退出，保留本地数据')
  try{
   saveLogoutChoice(window.localStorage,clearLocal)
   const {error}=await cloudClient.auth.signOut({scope:'local'})
   if(error)throw error
   clearAndReload(clearLocal)
  }catch(err){loggingOut.current=false;setError(`退出或本地清理未完成：${err.message}。请重试。`);setStatus('同步已停止，等待退出');setBusy(false)}
 }
 const lock=()=>{pause();forgetEncryption(unlocked.current);unlocked.current=null;setSecurity({ready:false,locked:null,recoveryCode:'',saved:false});setStatus('云同步已锁定，本地数据仍可使用')}
 const setup=async(passphrase)=>{
  if(running.current)return
  running.current=true;setBusy(true);setError('')
  try{
   const {id,client}=await credentials(),token=epoch.current
   const existing=await readForAccount(id,client)
   guard(id,token)
   if(existing.locked){setSecurity({ready:false,locked:existing.envelope,recoveryCode:'',saved:false});throw new Error('此账号已有加密数据，请解锁，不能重新初始化。')}
   const result=await createEncryption(id,passphrase)
   guard(id,token)
   unlocked.current=result.unlocked
   pending.current=true
   setSecurity({ready:true,locked:null,recoveryCode:result.recoveryCode,saved:false});setStatus('请保存恢复密钥，再预览同步')
  }catch(err){setError(err.message)}finally{running.current=false;setBusy(false)}
 }
 const unlock=async(secret,recovery)=>{
  if(running.current)return
  running.current=true;setBusy(true);setError('')
  try{
   const {id,client}=await credentials(),token=epoch.current,remote=await readForAccount(id,client)
   if(!remote.locked)throw new Error('云端加密状态已变化，请重新预览。')
   const next=await unlockEncryption(remote.envelope,id,secret,recovery)
   guard(id,token);unlocked.current=next;pending.current=false
   setSecurity({ready:true,locked:null,recoveryCode:'',saved:true});setStatus('已解锁，请预览合并或从云端恢复')
  }catch(err){setError(err.message)}finally{running.current=false;setBusy(false)}
 }
 const changePassphrase=async(passphrase)=>{
  if(running.current)return
  running.current=true;setBusy(true);setError('')
  try{
   const {id,client}=await credentials(),token=epoch.current
   if(!unlocked.current||unlocked.current.userId!==id)throw new Error('请先解锁。')
   const remote=await readForAccount(id,client,unlocked.current)
   if(!remote.encrypted)throw new Error('请先完成首次加密同步。')
   guard(id,token)
   const latest={...unlocked.current,header:{format:remote.envelope.format,keyId:remote.envelope.keyId,password:remote.envelope.password,recovery:remote.envelope.recovery}}
   const changed=await changeEncryptionPassphrase(latest,passphrase)
   guard(id,token);const saved=await writeJournal(client,remote.journal,remote.revision,changed);guard(id,token);cipherCache.current={userId:id,revision:saved.revision,envelope:saved.envelope}
   unlocked.current=changed;setStatus('加密口令已更新，恢复密钥仍然有效；已解锁的设备不会被撤销')
  }catch(err){setError(err.message)}finally{running.current=false;setBusy(false)}
 }
 useEffect(()=>{
  if(meta?.enabled&&meta.userId===session?.user.id&&!pending.current&&!running.current&&!same(snapshot,meta.base))
   setStatus(navigator.onLine?'本地有修改，等待加密同步':'离线：修改已保存在本地，联网后继续同步')
  if(meta?.enabled&&meta.userId===session?.user.id&&!pending.current&&!same(snapshot,meta.base))schedule.current?.changed()
 },[snapshot,meta,session?.user.id])
 useEffect(()=>{
  if(!session||!meta?.enabled||meta.userId!==session.user.id)return
  const controller=createSyncSchedule(()=>{if(!loggingOut.current&&navigator.onLine&&document.visibilityState==='visible')makePlan('merge',true)})
  schedule.current=controller
  const resume=()=>{
   if(!navigator.onLine||document.visibilityState!=='visible')return
   if(!same(current.current,metaRef.current.base))controller.changed()
   else controller.resumed()
  }
  const offline=()=>setStatus('离线：修改已保存在本地，联网后继续同步')
  const interval=setInterval(resume,IDLE_SYNC_INTERVAL)
  window.addEventListener('online',resume);window.addEventListener('offline',offline);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume)
  if(!same(current.current,metaRef.current.base))controller.changed()
  return()=>{controller.stop();clearInterval(interval);window.removeEventListener('online',resume);window.removeEventListener('offline',offline);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume)}
 // The polling callbacks use refs so they always read the latest local data.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[session?.user.id,meta?.enabled,meta?.userId])
 return {session,busy,status,error,setError,preview,setPreview,makePlan,confirm,choose,setMode,pause,logout,meta,security,setSecurity,setup,unlock,lock,changePassphrase,externalChange,localUpdatedAt,
  hasUnsyncedChanges:session&&(!meta?.base||!same(snapshot,meta.base)),
  enabled:meta?.enabled&&meta?.userId===session?.user.id,
  cancel:pause}
}
