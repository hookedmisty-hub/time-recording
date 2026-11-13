import {useId,useState} from 'react'
export default function EncryptionControls({sync}){
 const [pass,setPass]=useState(''),[confirm,setConfirm]=useState(''),[secret,setSecret]=useState(''),[recovery,setRecovery]=useState(false)
 const [change,setChange]=useState(false)
 const [showHelp,setShowHelp]=useState(false)
 const helpId=useId()
 const {security,busy}=sync
 const setUp=async e=>{e.preventDefault();if(pass!==confirm)return sync.setError('两次加密口令不一致。');await sync.setup(pass);setPass('');setConfirm('')}
 const unlock=async e=>{e.preventDefault();await sync.unlock(secret,recovery);setSecret('')}
 const reset=async e=>{e.preventDefault();if(pass!==confirm)return sync.setError('两次加密口令不一致。');await sync.changePassphrase(pass);setPass('');setConfirm('');setChange(false)}
 const download=()=>{
  const text=`时间账本恢复密钥\n账号：${sync.session.user.email}\n恢复密钥：${security.recoveryCode}\n请离线妥善保存，不要分享；持有此密钥及账号访问权限的人可以解密云端账本。\n`
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a')
  a.href=url;a.download='time-recording-recovery-key.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }
 const passwordInputs=<><label>加密口令（至少 12 个字符）<input type="password" autoComplete="new-password" minLength={12} maxLength={512} required value={pass} onChange={e=>setPass(e.target.value)}/></label><label>再次输入加密口令<input type="password" autoComplete="new-password" minLength={12} maxLength={512} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></>
 return <section className="card encryption-controls" aria-label="云端加密设置">
  <div className="encryption-heading">
   <h3>{security.ready?'云端加密已解锁':security.locked?'解锁云端账本':'设置端到端加密'}</h3>
   <button type="button" className="encryption-help-toggle" aria-label="加密与恢复密钥说明" title="加密与恢复密钥说明" aria-expanded={showHelp} aria-controls={helpId} onClick={()=>setShowHelp(!showHelp)}><span aria-hidden="true">?</span></button>
  </div>
  {showHelp&&<div id={helpId} className="encryption-help-panel" role="region" aria-label="加密与恢复密钥说明">
   <p className="import-help">加密口令与登录密码独立，仅在此设备上处理，不会发送给服务器。浏览器本地记录与普通 JSON 导出仍是明文。忘记口令且丢失恢复密钥后，管理员无法恢复云端内容。</p>
   <p className="import-help">每个账号只需首次设置一次。之后重新登录或换设备，使用原加密口令解锁；恢复密钥用于忘记口令时恢复，无需重新生成。</p>
  </div>}
  {security.locked?<form onSubmit={unlock}>
   <div className="unlock-row">
    <label>{recovery?'恢复密钥':'加密口令'}<input type="password" autoComplete="off" required value={secret} onChange={e=>setSecret(e.target.value)}/></label>
    <button type="submit" className="primary" disabled={busy}>解锁</button>
   </div>
   <label className="sync-check unlock-recovery"><input type="checkbox" checked={recovery} onChange={e=>setRecovery(e.target.checked)}/><span>使用恢复密钥解锁</span></label>
  </form>:!security.ready?<form onSubmit={setUp}>{passwordInputs}<button className="primary" disabled={busy}>生成加密设置与恢复密钥</button></form>:<>
   {security.recoveryCode&&<div>
    <p>恢复密钥只在这次设置中展示。请先保存，再继续同步。</p>
    <code className="recovery-code">{security.recoveryCode}</code>
    <button className="secondary" disabled={busy} onClick={download}>下载恢复密钥</button>
    <label className="sync-check"><span>我已将恢复密钥保存在安全的位置</span><input type="checkbox" checked={security.saved} onChange={e=>sync.setSecurity(old=>({...old,saved:e.target.checked}))}/></label>
   </div>}
   {!security.recoveryCode&&<details className="encryption-advanced"><summary>高级设置</summary>
    <p className="import-help">清除本次解锁状态会暂停同步，并清除当前页面的解密密钥。下次使用原加密口令解锁即可；不会删除云端或本地记录，也不会隐藏本地账本。</p>
    <div className="backup-actions"><button className="secondary" disabled={busy} onClick={sync.lock}>清除本次解锁状态</button><button className="secondary" disabled={busy} onClick={()=>setChange(!change)}>修改加密口令</button></div>
   </details>}
   {change&&<form onSubmit={reset}>{passwordInputs}<p className="import-help">可在使用恢复密钥解锁后设置新口令。已有恢复密钥仍有效，已解锁的设备不会被撤销。</p><button className="primary" disabled={busy}>保存新加密口令</button></form>}
  </>}
 </section>
}
