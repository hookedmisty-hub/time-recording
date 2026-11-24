import {useId,useRef,useState} from 'react'
import {X} from 'lucide-react'
import {parsePlanImport,previewPlanImport} from './plans.js'

const EXAMPLE_PLAN={
 title:'整理资料',
 start:'09:00',
 end:'10:30',
 category:'核心工作',
 project:'项目1',
 deliverable:'整理报告',
 tasks:['阅读材料','记下要点'],
 notes:'先检查已有笔记',
}

function ImportTags({names}){
 const tags=names.filter(Boolean)
 return tags.length>0&&<div className="planlog-block-tags">{tags.map((name,index)=><span key={index}>{name}</span>)}</div>
}

export default function PlanImport({date,plans,categories,projects,deliverables,onImport,onClose}){
 const titleId=useId()
 const fileInput=useRef(null)
 const [text,setText]=useState('')
 const [staged,setStaged]=useState(null)
 const [reading,setReading]=useState(false)
 const [error,setError]=useState('')
 const [copyStatus,setCopyStatus]=useState('')
 const template=JSON.stringify({plans:[{date,...EXAMPLE_PLAN}]},null,2)
 const preview=staged&&previewPlanImport(plans,staged)
 const catalog={categories,projects,deliverables}
 const byDate=new Map()
 for(const plan of preview?.additions??[]){
  if(!byDate.has(plan.date))byDate.set(plan.date,[])
  byDate.get(plan.date).push(plan)
 }

 function stage(value){
  setError('')
  try{setStaged(parsePlanImport(value,date,catalog))}catch(error){setError(error.message)}
 }

 async function readFile(event){
  const file=event.target.files?.[0]
  event.target.value=''
  if(!file)return
  setReading(true)
  setError('')
  try{
   const value=await file.text()
   setText(value)
   stage(value)
  }catch{setError('无法读取该文件，请重试或粘贴 JSON。')}
  finally{setReading(false)}
 }

 async function copyPrompt(){
  try{
   await navigator.clipboard.writeText(`请根据我提供的任务安排计划。请只输出有效 JSON，格式如下。每个时间块用 date（YYYY-MM-DD）标明日期，未指定日期时用 ${date}。使用 24 小时制 HH:MM，跨午夜的计划按天拆开，当天午夜用 24:00。tasks 是可选的待办文字数组，notes 是可选的笔记。category、project、deliverable 是可选项，分别填写已有分类、项目及该项目下交付任务的完整名称。未提供名称时可省略。请用我的任务替换示例。\n\n${template}`)
   setCopyStatus('已复制')
  }catch{setCopyStatus('复制失败，可直接选中下方示例。')}
 }

 function submit(event){
  event.preventDefault()
  if(!preview){stage(text);return}
  if(!preview.additions.length)return
  try{onImport(preview.additions)}catch(error){setError(error.message)}
 }

 return <div className="overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
  <section className="modal fixed-action-modal plan-import" role="dialog" aria-modal="true" aria-labelledby={titleId}
   onKeyDown={event=>{if(event.key==='Escape')onClose()}}>
   <div className="modal-header">
    <h2 id={titleId}>导入计划</h2>
    <button type="button" className="icon-btn" aria-label="关闭计划导入" onClick={onClose}><X size={18}/></button>
   </div>
   <form onSubmit={submit}>
    <div className="modal-scroll-body">
     {preview?<>
      <p className="import-help">将添加 {preview.additions.length} 个时间块。{preview.skipped>0&&`跳过 ${preview.skipped} 个同名且时段相同的时间块。`}</p>
      {[...byDate].map(([day,entries])=><section className="plan-import-day" key={day}>
       <h3><time dateTime={day}>{day}</time></h3>
       <ol className="plan-import-preview">
        {entries.map(plan=><li key={plan.id}>
         <div><time>{plan.start}–{plan.end}</time><strong>{plan.title}</strong></div>
         <ImportTags names={[
          categories.find(category=>category.id===plan.categoryId)?.name,
          projects.find(project=>project.id===plan.projectId)?.name,
          deliverables.find(item=>item.id===plan.deliverableId)?.name,
         ]}/>
         {plan.tasks.length>0&&<ul>{plan.tasks.map(task=><li key={task.id}>{task.text}</li>)}</ul>}
         {plan.notes&&<p>{plan.notes}</p>}
        </li>)}
       </ol>
      </section>)}
     </>:<>
      <textarea autoFocus rows={7} spellCheck={false} aria-label="粘贴 JSON" placeholder="粘贴 JSON" disabled={reading}
       value={text} onChange={event=>{setText(event.target.value);setError('')}}/>
      <input hidden type="file" ref={fileInput} accept=".json,application/json" onChange={readFile}/>
      <button type="button" className="secondary plan-import-file" onClick={()=>fileInput.current.click()} disabled={reading}>
       {reading?'读取中…':'选择 JSON 文件'}
      </button>
      <details className="plan-import-format" onToggle={event=>{
       if(event.currentTarget.open)event.currentTarget.scrollIntoView({block:'start'})
      }}>
       <summary>导入格式</summary>
       <button type="button" className="secondary" onClick={copyPrompt}>复制计划生成指令</button>
       {copyStatus&&<span role="status">{copyStatus}</span>}
       <p className="plan-import-date-help">每个时间块可指定日期。未填写日期时，默认使用文件里的统一日期或当前所选日期。分类、项目和交付任务可填写已有名称，无法匹配的字段会跳过。</p>
       <div className="plan-import-examples">
        <section>
         <h3>JSON 示例</h3>
         <pre>{template}</pre>
        </section>
        <section>
         <h3>时间轴预览 · {date}</h3>
         <div className="planlog-block planlog-planned plan-import-example-block">
          <div className="planlog-block-header">
           <strong>{EXAMPLE_PLAN.title}</strong>
           <div className="planlog-block-meta">
            <small>{EXAMPLE_PLAN.start}–{EXAMPLE_PLAN.end} · 0/{EXAMPLE_PLAN.tasks.length}</small>
            <ImportTags names={[EXAMPLE_PLAN.category,EXAMPLE_PLAN.project]}/>
           </div>
          </div>
          <ul className="planlog-inline-tasks">
           {EXAMPLE_PLAN.tasks.map(task=><li key={task} className="planlog-inline-task">
            <span className="planlog-task-toggle" aria-hidden="true"/>{task}
           </li>)}
          </ul>
         </div>
         <div className="plan-import-example-note">
          <p>交付任务 · {EXAMPLE_PLAN.deliverable}</p>
          <strong>计划笔记</strong>
          <p>{EXAMPLE_PLAN.notes}</p>
         </div>
        </section>
       </div>
      </details>
     </>}
     {error&&<p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="actions">
     {preview?<button type="button" className="secondary" onClick={()=>{setStaged(null);setError('')}}>返回修改</button>
      :<button type="button" className="secondary" onClick={onClose}>取消</button>}
     <button type="submit" className="primary" disabled={preview?!preview.additions.length:reading||!text.trim()}>
      {preview?'确认导入':'预览计划'}
     </button>
    </div>
   </form>
  </section>
 </div>
}
