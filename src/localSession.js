export const LOGOUT_EVENT='time-recording-logout-event'
export const IDLE_SYNC_INTERVAL=5*60*1000
const LOGOUT_CHOICE='time-recording-logout-choice'
export function saveLogoutChoice(storage,clearLocal){storage.setItem(LOGOUT_CHOICE,clearLocal?'clear':'keep')}
export function shouldClearOnLogout(storage){return storage.getItem(LOGOUT_CHOICE)!=='keep'}
export function finishLocalLogout(local,session,clearLocal,eventId=`${Date.now()}-${crypto.randomUUID()}`){
 if(clearLocal){clearLocalJournal(local,session,eventId);return}
 // Keep the account binding and merge baseline, but never resume uploads signed out.
 const raw=local.getItem('time-recording-sync-v2')
 if(raw){const meta=JSON.parse(raw);local.setItem('time-recording-sync-v2',JSON.stringify({...meta,enabled:false}))}
 local.setItem(LOGOUT_EVENT,eventId)
}
// Clear app-owned data only. Other apps on the same github.io origin are untouched.
export function clearLocalJournal(local,session,eventId=`${Date.now()}-${crypto.randomUUID()}`){
 local.setItem(LOGOUT_EVENT,eventId)
 for(const storage of [local,session]){
  if(!storage)continue
  const keys=Array.from({length:storage.length},(_,i)=>storage.key(i))
  for(const key of keys)if(key?.startsWith('time-recording-')&&key!==LOGOUT_EVENT)storage.removeItem(key)
 }
}

// Local changes debounce; foreground/reconnect events coalesce, and idle polling
// only checks every five minutes. Network/version handling stays in the sync controller.
export function createSyncSchedule(run,{setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}={}){
 let timer=null,lastCheck=-Infinity,stopped=false
 const invoke=()=>{timer=null;if(stopped)return;lastCheck=now();run()}
 return {
  changed(){if(stopped)return;if(timer!==null)clearTimer(timer);timer=setTimer(invoke,1200)},
  resumed(){if(stopped||timer!==null||now()-lastCheck<30000)return;invoke()},
  stop(){stopped=true;if(timer!==null)clearTimer(timer);timer=null},
 }
}
