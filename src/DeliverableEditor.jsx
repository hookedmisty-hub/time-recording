import TemporalInput from './TemporalInput.jsx'
import {Check,Pencil,X} from 'lucide-react'
import {useState} from 'react'

function localInput(value){
 if(!value)return ''
 const instant=new Date(value)
 const local=new Date(instant.getTime()-instant.getTimezoneOffset()*60000)
 return local.toISOString().slice(0,16)
}

function fromLocal(value){
 if(!value)return null
 const date=new Date(value)
 if(!Number.isFinite(date.getTime())||localInput(date.toISOString())!==value){
  throw new Error('该时间在本机时区无效，请选择其他时间。')
 }
 return date.toISOString()
}

export default function DeliverableEditor({project,items,records,onChange}){
 const [draft,setDraft]=useState(null)
 const [error,setError]=useState('')
 const pending=items.filter(item=>!item.completedAt)
 const completed=items.filter(item=>item.completedAt)
 const savedItem=items.find(item=>item.id===draft?.id)
 const update=patch=>{setDraft(old=>({...old,...patch}));setError('')}
 const open=item=>{setDraft(item);setError('')}
 const save=e=>{
  e.preventDefault()
  const name=draft.name.trim(),milestoneName=draft.milestoneName.trim()
  if(!name)return setError('请输入交付项名称。')
  const fields=new FormData(e.currentTarget)
  const item={...draft,name,milestoneName}
  try{
   for(const key of ['dueAt','milestoneAt','completedAt']){
    const value=fields.get(key)
    item[key]=value===localInput(draft[key])?draft[key]:fromLocal(value)
   }
  }catch(err){return setError(err.message)}
  if(item.milestoneAt&&!milestoneName)return setError('请填写阶段成果名称，或清除达成时间。')
  try{onChange(item)}catch{return setError('保存失败，请检查浏览器存储后重试。')}
  open(null)
 }
 const setTime=(event,key,value)=>{
  event.currentTarget.form.elements.namedItem(key).value=localInput(value)
  update({[key]:value})
 }
 const timeField=(label,key,markLabel,clearLabel)=><div className="deliverable-time-field">
  <label htmlFor={draft.id+'-'+key}>{label}</label>
  <div className="deliverable-time-controls">
   <TemporalInput id={draft.id+'-'+key} name={key} type="datetime-local" defaultValue={localInput(draft[key])}/>
   {markLabel&&<button type="button" className="deliverable-time-action mark" aria-label={markLabel} title={markLabel+'（记为现在）'} onClick={e=>setTime(e,key,new Date().toISOString())}>
    <Check size={16} aria-hidden="true"/>
   </button>}
   <button type="button" className="deliverable-time-action" aria-label={clearLabel??'清除'+label} title={clearLabel??'清除'+label} onClick={e=>setTime(e,key,null)}>
    <X size={15} aria-hidden="true"/>
   </button>
  </div>
 </div>
 const itemRow=item=><div className="category-row deliverable-item" key={item.id}>
  <div className="deliverable-item-copy">
   <strong>{item.name}</strong>
   <p className="deliverable-item-meta">{item.dueAt?`截止 ${localInput(item.dueAt).replace('T',' ')} · `:''}{item.milestoneAt?`${item.milestoneName} ${localInput(item.milestoneAt).replace('T',' ')} · `:''}{item.completedAt?`完成 ${localInput(item.completedAt).replace('T',' ')}`:'进行中'} · {records.filter(r=>r.deliverableId===item.id).length} 条记录</p>
  </div>
  <button type="button" className="icon-btn deliverable-edit" aria-label={`编辑 ${item.name}`} title="编辑交付项" disabled={Boolean(draft)} onClick={()=>open(item)}>
   <Pencil size={16} aria-hidden="true"/>
  </button>
 </div>
 const add=()=>open({id:crypto.randomUUID(),projectId:project.id,name:'',dueAt:null,milestoneName:'',milestoneAt:null,completedAt:null})
 return <section className="card">
  <div className="card-title"><h2>{project.name}{project.archived?'（已归档）':''}</h2>
   <button className="secondary" disabled={Boolean(draft)} onClick={add}>＋ 新增交付项</button>
  </div>
  {draft?<form className="category-row deliverable-form" key={draft.id} onSubmit={save}>
   <div className="deliverable-fields">
   <label>交付项名称<input required maxLength={100} value={draft.name} onChange={e=>update({name:e.target.value})}/></label>
   {timeField('截止时间（DDL）','dueAt','', '清除截止时间')}
   </div>
   <div className="deliverable-progress">
    <details className="deliverable-option" open={Boolean(savedItem?.milestoneName||savedItem?.milestoneAt)}>
     <summary>阶段成果（可选）</summary>
     <div className="deliverable-option-fields">
      <div className="deliverable-fields">
       <label>阶段成果名称<input maxLength={100} placeholder="例如：初稿可读" value={draft.milestoneName} onChange={e=>update({milestoneName:e.target.value})}/></label>
       {timeField('阶段成果达成时间','milestoneAt','标记阶段成果达成','清除达成时间')}
      </div>
     </div>
    </details>
    <details className="deliverable-option" open={Boolean(savedItem?.completedAt)}>
     <summary>最终完成（可选）</summary>
     <div className="deliverable-option-fields">
      {timeField('交付项完成时间','completedAt','标记交付项完成','清除完成时间')}
      <p className="import-help">需要提交的交付项，请填写实际提交时间。</p>
     </div>
    </details>
   </div>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="actions"><button type="button" className="secondary" onClick={()=>open(null)}>取消编辑</button><button className="primary">保存交付项</button></div>
  </form>:null}
  {pending.length>0?<div className="category-list deliverable-list">{pending.map(itemRow)}</div>:<p className="import-help">暂无进行中的交付项。</p>}
  {completed.length>0&&<details className="archived-projects">
   <summary>已完成（{completed.length}）</summary>
   <div className="category-list deliverable-list">{completed.map(itemRow)}</div>
  </details>}
 </section>
}
