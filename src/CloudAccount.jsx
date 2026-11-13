import {useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import {planMigration,readCloud,uploadInitial} from './cloudMigration.js'

const client=createClient(
 'https://tzelzjjoupexnukkoplr.supabase.co',
 'sb_publishable_R-hUZb57rNVSKmBUwT5UKQ_M8L7Ch4y'
)

export default function CloudAccount({onClose,snapshot}){
 const [session,setSession]=useState(null)
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const [preview,setPreview]=useState(null)
 useEffect(()=>{
  let active=true
  client.auth.getSession().then(({data,error})=>{
   if(!active)return
   if(error)setError(error.message)
   setSession(data.session)
  })
  const {data}=client.auth.onAuthStateChange((_event,next)=>{setSession(next);setPreview(null);setMessage('')})
  return ()=>{active=false;data.subscription.unsubscribe()}
 },[])
 const authenticate=async(event)=>{
  event.preventDefault()
  setBusy(true);setError('');setMessage('')
  try{
   const registering=event.nativeEvent.submitter?.value==='register'
   const result=registering?
    await client.auth.signUp({email:email.trim(),password}):
    await client.auth.signInWithPassword({email:email.trim(),password})
   if(result.error)throw result.error
   setPassword('')
   if(registering&&!result.data.session)setMessage('注册已提交。请查收确认邮件，再返回这里登录。')
  }catch(err){setError(err.message)}
  finally{setBusy(false)}
 }
 const checkAccess=async()=>{
  setBusy(true);setError('');setMessage('')
  try{
   const result=await client.from('journal_entities').select('entity_id').limit(1)
   if(result.error)throw result.error
   setMessage('账号与数据库连接正常。可以预览并上传已有数据。')
  }catch(err){setError(err.message)}
  finally{setBusy(false)}
 }
 const previewUpload=async()=>{
  setBusy(true);setError('');setMessage('');setPreview(null)
  try{
   const {data:{user},error}=await client.auth.getUser()
   if(error)throw error
   if(!user)throw new Error('请先登录。')
   const copy=structuredClone(snapshot)
   const plan=planMigration(copy,await readCloud(client))
   setPreview({snapshot:copy,plan,userId:user.id})
  }catch(err){setError(err.message)}finally{setBusy(false)}
 }
 const confirmUpload=async()=>{
  setBusy(true);setError('');setMessage('')
  try{
   const {data:{user},error}=await client.auth.getUser()
   if(error)throw error
   if(user?.id!==preview.userId)throw new Error('登录账号已变更，请重新预览。')
   const result=await uploadInitial(client,preview.snapshot,(done,total)=>setMessage(`正在上传 ${done} / ${total} 项，请勿关闭此窗口。`))
   setPreview(null)
   setMessage(`首次上传已完成并校验：新增 ${result.uploaded} 项，跳过 ${result.skipped} 项相同内容。本地数据已保留。后续自动同步尚未启用。`)
  }catch(err){setError(`${err.message} 本地数据未修改。可以重新预览后重试。`)}finally{setBusy(false)}
 }
 return <div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
  <div className="modal-header"><h2 id="account-title">账号与云同步</h2><button className="close" disabled={busy} onClick={onClose} aria-label="关闭账号设置">✕</button></div>
  {session?<>
   <p>已登录 {session.user.email}</p>
   <p className="import-help">首次使用可以把当前浏览器已有的数据上传到此账号。本地数据会保留。自动同步与云端恢复正在接入。</p>
   <div className="backup-actions">
    <button className="primary" disabled={busy} onClick={checkAccess}>检查数据库连接</button>
    <button className="secondary" disabled={busy} onClick={previewUpload}>预览已有数据上传</button>
    <button className="secondary" disabled={busy} onClick={async()=>{const {error}=await client.auth.signOut();if(error)setError(error.message)}}>退出登录</button>
   </div>
   {preview&&<section className="card" aria-label="首次上传预览">
    <h3>上传到当前账号</h3>
    <p>{preview.snapshot.records.length} 条记录 · {preview.snapshot.categories.length} 个分类 · {preview.snapshot.projects.length} 个项目 · {preview.snapshot.deliverables.length} 个交付任务</p>
    <p>{Object.keys(preview.snapshot.goals).length} 天目标 · {Object.values(preview.snapshot.todos).reduce((n,items)=>n+items.length,0)} 条待办 · {preview.snapshot.rewards.wishlist.length} 个心愿 · {preview.snapshot.rewards.redemptions.length} 条兑换历史</p>
    <p className="import-help">包括项目归档与排序、分类排序、完整奖励规则与历史、休息日及交付任务的时间和关联。</p>
    <p>新增 {preview.plan.additions.length} 项 · 已有相同内容 {preview.plan.duplicates.length} 项 · 冲突 {preview.plan.conflicts.length} 项</p>
    {preview.plan.conflicts.length>0?<p role="alert">云端已有不同内容，暂不能进行首次上传。需要先处理合并，当前不会覆盖任何内容。</p>:<button className="primary" disabled={busy} onClick={confirmUpload}>确认上传到此账号</button>}
    <button className="secondary" disabled={busy} onClick={()=>setPreview(null)}>取消</button>
   </section>}
  </>:<form onSubmit={authenticate}>
   <p className="import-help">使用邮箱注册时间账本账号。该账号用于在各设备访问自己的数据。</p>
   <label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>密码<input type="password" autoComplete="current-password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <div className="actions">
    <button className="secondary" type="submit" value="register" disabled={busy}>注册账号</button>
    <button className="primary" type="submit" value="login" disabled={busy}>登录</button>
   </div>
  </form>}
  {message&&<p role="status">{message}</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </section></div>
}
