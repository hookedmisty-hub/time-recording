import {useState} from 'react'
import {cloudClient as client} from './cloudClient.js'
import EncryptionControls from './EncryptionControls.jsx'

export default function CloudAccount({onClose,sync}){
 const {session,busy,preview,status,error,setError}=sync
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [authBusy,setAuthBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [showLogout,setShowLogout]=useState(false)
 const formatTime=value=>value?new Date(value).toLocaleString(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'未知（尚未记录）'
 const newer=preview?.localUpdatedAt&&preview?.remote.updatedAt?Math.sign(Date.parse(preview.localUpdatedAt)-Date.parse(preview.remote.updatedAt)):0
 const modeLabel={upload:'本地覆盖云端',restore:'云端覆盖本地',merge:'合并'}
 const conflictLabel=id=>({categories:'分类设置',projects:'项目设置',rewards:'奖励设置'}[id]||id.replace('records/','记录：').replace('deliverables/','交付任务：').replace('goals/','每日目标：').replace('todos/','待办：'))
 const [confirmError,setConfirmError]=useState('')
 const blockedReason=busy?'正在读取或同步，请稍候。':
  !preview?.journal?'请先完成恢复预览或处理全部合并冲突。':
  !sync.security.ready?(sync.security.locked?'请先解锁云端账本。':'当前页面尚未持有加密密钥。请在上方设置加密；刷新页面或更换标签页后需要重新设置或解锁。'):
  sync.security.recoveryCode&&!sync.security.saved?'请在上方勾选“我已将恢复密钥保存在安全的位置”。':''
 const confirmSync=()=>{
  if(blockedReason){setConfirmError(blockedReason);return}
  setConfirmError('');sync.confirm()
 }
 const userId=session?.user.id
 const authenticate=async(event)=>{
  event.preventDefault()
  setAuthBusy(true);setError('');setMessage('')
  try{
   const registering=event.nativeEvent.submitter?.value==='register'
   const result=registering?
    await client.auth.signUp({email:email.trim(),password}):
    await client.auth.signInWithPassword({email:email.trim(),password})
   if(result.error)throw result.error
   setPassword('')
   if(registering&&!result.data.session)setMessage('注册已提交。请查收确认邮件，再返回这里登录。')
  }catch(err){setError(err.message)}
  finally{setAuthBusy(false)}
 }
 return <div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="account-title" inert={showLogout} aria-hidden={showLogout||undefined}>
  <div className="modal-header"><h2 id="account-title">账号与云同步</h2><button className="close" disabled={busy||authBusy} onClick={onClose} aria-label="关闭账号设置">✕</button></div>
  {session?<>
   <p>已登录 {session.user.email}</p>
   <p role="status">{status}</p>
   <EncryptionControls sync={sync}/>

   {sync.meta?.lastSync&&<p className="import-help">上次成功：{new Date(sync.meta.lastSync).toLocaleString()}</p>}
   <div className="account-actions">
    <button className="secondary" disabled={busy||authBusy} onClick={()=>sync.makePlan(sync.meta&&sync.meta.userId!==userId?'restore':'merge')}>检查更新</button>
    <button className="secondary" disabled={busy||authBusy||!sync.enabled} onClick={sync.pause}>暂停同步</button>
    <button className="secondary" disabled={busy||authBusy} onClick={()=>setShowLogout(true)}>退出登录</button>
   </div>
   {preview&&<section className="card sync-choice" aria-label="同步选择">
    <h3>{preview.identical?'本地与云端一致':'本地与云端尚未同步'}</h3>
    {!preview.identical&&<>
     <div className="sync-times">
      <div className={newer>0?'is-newer':''}><span>本地更新时间 {newer>0&&<b>较新</b>}</span><time dateTime={preview.localUpdatedAt||undefined}>{formatTime(preview.localUpdatedAt)}</time></div>
      <div className={newer<0?'is-newer':''}><span>云端更新时间 {newer<0&&<b>较新</b>}</span><time dateTime={preview.remote.updatedAt||undefined}>{preview.remote.journal?formatTime(preview.remote.updatedAt):'尚无数据'}</time></div>
     </div>
     <fieldset className="sync-directions" disabled={busy||authBusy}><legend>选择同步方式</legend>
      {['upload','restore','merge'].map(mode=><label key={mode} className={preview.mode===mode?'selected':''}><input type="radio" name="sync-direction" disabled={mode!=='restore'&&Boolean(sync.meta&&sync.meta.userId!==userId)} value={mode} checked={preview.mode===mode} onChange={()=>{setConfirmError('');sync.setMode(mode)}}/>{modeLabel[mode]}</label>)}
     </fieldset>
     <p className="import-help">{preview.mode==='upload'?'以本地账本完整替换云端，包括本地的删除结果。':preview.mode==='restore'?'以云端账本完整替换本地，本地独有内容不会上传。':'合并两端修改；同一项发生冲突时由你选择保留版本。'}</p>
    </>}
    {preview.mode==='merge'&&(preview.allConflicts||preview.conflicts).length>0&&<details className="sync-conflict-list"><summary>处理合并冲突（尚有 {preview.conflicts.length} 项）</summary>
     {(preview.allConflicts||preview.conflicts).map(c=><div className="sync-conflict" key={c.id}>
      <label>{conflictLabel(c.id)}<select aria-label={`冲突 ${c.id}`} value={preview.choices[c.id]||''} onChange={e=>sync.choose(c.id,e.target.value)}>
       <option value="">请选择保留的版本</option><option value="local">保留本地{c.local===undefined?'（删除）':''}</option><option value="remote">保留云端{c.remote===undefined?'（删除）':''}</option>
      </select></label>
      <details><summary>查看此项差异</summary><p>本地</p><pre>{c.local===undefined?'已删除':JSON.stringify(c.local,null,2)}</pre><p>云端</p><pre>{c.remote===undefined?'已删除':JSON.stringify(c.remote,null,2)}</pre></details>
     </div>)}
    </details>}
    {preview.error&&<p role="alert">合并后关联不一致：{preview.error} 请选择覆盖方式或重新检查同步。</p>}
    <details className="sync-help"><summary>同步说明</summary>
     <p className="import-help">本地修改后延迟同步；空闲每 5 分钟轻量检查版本。点击“检查更新”无需等待，可选择云端覆盖本地或合并。同步前保留本地副本；冲突时暂停。</p>
     {!preview.remote.encrypted&&<p className="import-help">首次加密会将云端旧明文条目迁移为密文；已有数据库历史备份不受此操作控制。</p>}
    </details>
    {blockedReason&&<p className="form-error" id="sync-confirm-help">{blockedReason}</p>}
    {confirmError&&confirmError!==blockedReason&&<p className="form-error" role="alert">{confirmError}</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="backup-actions"><button className="primary" disabled={busy||authBusy||!preview.journal} aria-describedby={blockedReason?'sync-confirm-help':undefined} onClick={confirmSync}>{busy?'正在处理…':preview.identical?'启用加密同步':`确认${modeLabel[preview.mode]}`}</button><button className="secondary" disabled={busy||authBusy} onClick={sync.cancel}>取消并暂停</button></div>
   </section>}
  </>:<form onSubmit={authenticate}>
   <p className="import-help">使用邮箱注册时间账本账号。该账号用于在各设备访问自己的数据。</p>
   <label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>密码<input type="password" autoComplete="current-password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <div className="actions">
    <button className="secondary" type="submit" value="register" disabled={busy||authBusy}>注册账号</button>
    <button className="primary" type="submit" value="login" disabled={busy||authBusy}>登录</button>
   </div>
  </form>}
  {message&&<p role="status">{message}</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </section>
 {showLogout&&<div className="overlay logout-confirm-overlay" onClick={e=>{if(e.target===e.currentTarget&&!busy)setShowLogout(false)}} onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();setShowLogout(false)}}}>
  <section className="modal logout-confirm" role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-description">
   <h2 id="logout-confirm-title">退出时是否清空本地数据？</h2>
   <p id="logout-confirm-description">云端数据均会保留。选择保留本地后，退出账号仍可在此浏览器查看这些记录。</p>
   {sync.hasUnsyncedChanges&&<p className="form-error">有尚未同步的本地内容，清空后无法从云端恢复这些修改。需要保留时请先导出备份。</p>}
   <div className="logout-options">
    <button className="secondary" disabled={busy} onClick={()=>sync.logout(false)}>保留本地并退出</button>
    <button className="secondary" disabled={busy} onClick={()=>sync.logout(true)}>清空本地并退出</button>
    <button className="secondary logout-cancel" autoFocus disabled={busy} onClick={()=>setShowLogout(false)}>取消</button>
   </div>
   {error&&<p className="form-error" role="alert">{error}</p>}
  </section>
 </div>}
 </div>
}
