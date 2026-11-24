import {useId,useState} from 'react'
import {Pencil,Target,X} from 'lucide-react'
import {effectiveGoal,GOAL_KEY,loadJSON} from './rewards.js'

const pretty=minutes=>`${Math.floor(minutes/60)}小时${minutes%60?`${minutes%60}分`:''}`

export default function DailyGoal({date,minutes,onGoalsChange}){
 const formId=useId()
 const [saved,setSaved]=useState(()=>loadJSON(GOAL_KEY,{})[date]||null)
 const [text,setText]=useState('')
 const [hours,setHours]=useState('')
 const [editing,setEditing]=useState(false)
 const [error,setError]=useState('')
 const target=effectiveGoal(saved)
 const editLabel=editing?'收起目标编辑':saved?'修改目标':'设置目标'
 const editButtonStyle=editing||saved?'icon-btn':'secondary'

 function toggleEditing(){
  setText(saved?.text||'')
  setHours(String(target/60))
  setError('')
  setEditing(!editing)
 }

 function save(event){
  event.preventDefault()
  const value=Number(hours)
  if(!hours||!Number.isFinite(value)||value<5||value>24||!Number.isInteger(value*60)){
   setError('请输入至少 5 且不超过 24 小时的目标，精确到分钟。')
   return
  }
  const next={text:text.trim(),minutes:Math.round(value*60)}
  try{
   const all=JSON.parse(localStorage.getItem(GOAL_KEY)||'{}')
   const goals={...all,[date]:next}
   localStorage.setItem(GOAL_KEY,JSON.stringify(goals))
   onGoalsChange(goals)
   setSaved(next)
   setEditing(false)
   setError('')
  }catch{
   setError('目标保存失败，浏览器存储不可用。')
  }
 }

 function clear(){
  try{
   const all=JSON.parse(localStorage.getItem(GOAL_KEY)||'{}')
   delete all[date]
   localStorage.setItem(GOAL_KEY,JSON.stringify(all))
   onGoalsChange(all)
   setSaved(null)
   setEditing(false)
   setError('')
  }catch{
   setError('清除失败，浏览器存储不可用。')
  }
 }

 return <section className="card daily-goal">
  <div className="daily-goal-summary">
   <h2 className="daily-goal-title"><Target size={17} aria-hidden="true"/> 工作目标</h2>
   <div className="daily-goal-progress">
    <span><strong>{pretty(minutes)}</strong> <span className="goal-target">/ {pretty(target)}</span></span>
    <progress aria-label="工作目标完成进度" max={target} value={Math.min(minutes,target)}/>
    {minutes>=target&&<span className="daily-goal-met">已达标</span>}
   </div>
   <button type="button" className={`${editButtonStyle} daily-goal-edit`} aria-expanded={editing} aria-controls={formId}
    aria-label={editLabel} title={editLabel} onClick={toggleEditing}>
    {editing?<X size={17} aria-hidden="true"/>:saved?<Pencil size={15} aria-hidden="true"/>:editLabel}
   </button>
  </div>
  {saved?.text&&<p className="daily-goal-note">
   <span aria-hidden="true">🎯</span>
   <span>{saved.text}</span>
  </p>}
  {editing&&<form id={formId} className="goal-form" onSubmit={save}>
   <label>简短目标<input aria-label="当日工作目标" maxLength={160} placeholder="例如：完成今天的工作计划" value={text} onChange={e=>setText(e.target.value)}/></label>
   <label>工作总时长目标（小时）<input aria-label="工作小时目标" required type="number" min="5" max="24" step="any" value={hours} onChange={e=>setHours(e.target.value)}/></label>
   <div className="daily-goal-actions">
    {saved&&<button type="button" className="secondary" onClick={clear}>清除目标</button>}
    <button className="primary" type="submit">保存目标</button>
   </div>
  </form>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </section>
}
