import PlanImport from './PlanImport.jsx'
import LogTasks from './LogTasks.jsx'
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {Plus,Trash2,X,Pencil,Upload} from 'lucide-react'
import TemporalInput, {withStartTime} from './TemporalInput.jsx'
import {planMinutes,savePlan,planLanes,planLogAction,planOverlapsRecord,tasksForLog,assignPlanTask} from './plans.js'
const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
export default function PlanLog({date,today,plans=[],records,daily,categories,projects,deliverables,onChange,onLog,onEditLog,onLogTasks,recordEditor=null,recordAnchor=null,onDismissRecord,openRequest=null,onRequestHandled}){
 const [draft,setDraft]=useState(null),[text,setText]=useState(''),[error,setError]=useState(''),[now,setNow]=useState(()=>new Date())
 const [showPlanImport,setShowPlanImport]=useState(false)
 const [importResult,setImportResult]=useState(null)
 const [taskEdit,setTaskEdit]=useState(null)
 const [logChoices,setLogChoices]=useState(null)
 const [selected,setSelected]=useState(null),[zoom,setZoom]=useState(3.6)
 useEffect(()=>{if(openRequest){setDraft(structuredClone(openRequest));setText('');setError('');setTaskEdit(null);setLogChoices(null);onRequestHandled?.()}},[openRequest,onRequestHandled])
 const selectedPlan=plans.find(p=>p.id===selected&&p.date===date)
 const quickStatus=(p,t,status,logId)=>{const next=assignPlanTask(p,t.id,status,logId);if(draft?.id===p.id)setDraft(next);if(plans.some(x=>x.id===p.id)){try{persist(savePlan(plans,next))}catch(e){setError(e.message)}}}


 const zoomPosition=useRef(null)
 const [panelSpace,setPanelSpace]=useState(520)
 const [panelHeight,setPanelHeight]=useState(0)
 const anchorPlan=recordAnchor||draft||selectedPlan
 const scroller=useRef(null),editorRef=useRef(null),detailRef=useRef(null),previousSelected=useRef(null)
 useLayoutEffect(()=>{
  const panel=editorRef.current
  if(!panel)return
  const observer=new ResizeObserver(()=>setPanelHeight(Math.ceil(panel.getBoundingClientRect().height)))
  observer.observe(panel)
  return()=>observer.disconnect()
 },[draft?.id,Boolean(recordEditor)])
 useLayoutEffect(()=>{
  if(zoomPosition.current!==null&&scroller.current){
   scroller.current.scrollTop=Math.max(0,(anchorPlan?panelSpace:0)+zoomPosition.current*zoom)
   zoomPosition.current=null
   return
  }
  if(anchorPlan&&scroller.current&&((draft||recordEditor)?editorRef.current:detailRef.current)){
   const panel=(draft||recordEditor)?editorRef.current:detailRef.current
   const needed=Math.max(520,Math.ceil(panel.offsetHeight+24))
   if(needed!==panelSpace){setPanelSpace(needed);return}
   scroller.current.scrollTop=Math.max(0,panelSpace+planMinutes(anchorPlan.start)*zoom-panel.offsetHeight-24)
   panel.scrollIntoView({block:'nearest',inline:'nearest'})
  }else if(previousSelected.current&&scroller.current){scroller.current.scrollTop=Math.max(0,scroller.current.scrollTop-panelSpace)}
  previousSelected.current=anchorPlan?.id||null
 },[anchorPlan?.id,Boolean(draft),Boolean(recordEditor),zoom,panelSpace,panelHeight])
 useEffect(()=>{
  if(!draft&&!selectedPlan&&!recordEditor)return
  const outside=e=>{
   const target=e.target
   if(!(target instanceof Element)||target.closest('.planlog-inline-editor,.planlog-inline-log-editor,.planlog-anchored-detail,.planlog-block,.planlog-toolbar,button,input,select,textarea,a,.overlay,.temporal-control'))return
   if(recordEditor){onDismissRecord();return}
   if(draft){
    const saved=plans.find(p=>p.id===draft.id)
    const changed=saved?JSON.stringify(saved)!==JSON.stringify(draft):Boolean(draft.title.trim()||draft.tasks.length||text.trim())
    if(changed&&!window.confirm('计划尚未保存，确定收起并放弃修改吗？'))return
   }
   setDraft(null);setSelected(null);setText('');setError('')
  }
  document.addEventListener('click',outside)
  return()=>document.removeEventListener('click',outside)
 },[draft,selectedPlan,plans,text,recordEditor,onDismissRecord])
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer)},[])
 const scrollNow=()=>{if(scroller.current)scroller.current.scrollTop=Math.max(0,(anchorPlan?panelSpace:0)+(date===today?new Date().getHours()*60+new Date().getMinutes():480)*zoom-120)}
 useEffect(()=>{scrollNow()},[date]) // Changing scale preserves the visible time, not the current clock time.
 const toggleZoom=()=>{if(scroller.current)zoomPosition.current=(scroller.current.scrollTop-(anchorPlan?panelSpace:0))/zoom;setZoom(z=>z===1.8?3.6:1.8)}
 const persist=next=>{try{onChange(next);setError('');return true}catch(e){setError(e.message);return false}}
 const open=p=>{setLogChoices(null);setTaskEdit(null);setDraft(structuredClone(p));setText('');setError('')}
 const importPlans=additions=>{
  onChange([...plans,...additions])
  setShowPlanImport(false)
  setImportResult({date,count:additions.length})
  const firstVisible=additions.find(plan=>plan.date===date)
  if(firstVisible&&scroller.current&&!anchorPlan)scroller.current.scrollTop=Math.max(0,planMinutes(firstVisible.start)*zoom-80)
 }
 const create=(start='09:00')=>open({id:crypto.randomUUID(),date,title:'',start,end:clock(Math.min(1440,planMinutes(start)+60)),categoryId:'',projectId:'',deliverableId:'',tasks:[],createdAt:new Date().toISOString()})
 const submit=e=>{e.preventDefault();try{if(persist(savePlan(plans,{...draft,title:draft.title.trim()})))setDraft(null)}catch(e){setError(e.message)}}
 const changeTask=(p,taskId,patch,remove=false)=>{const next={...p,tasks:remove?p.tasks.filter(t=>t.id!==taskId):p.tasks.map(t=>t.id===taskId?{...t,...patch}:t)};setDraft(next);if(plans.some(x=>x.id===p.id)){try{if(!persist(savePlan(plans,next)))return false}catch(e){setError(e.message);return false}}return true}
 const taskList=(p,editable=false,logId=null)=><div className="planlog-inline-tasks">{(logId?tasksForLog(p,logId,records):p.tasks).map(t=><div key={t.id} className={`planlog-inline-task planlog-task-${t.status}`}><button type="button" className="planlog-task-toggle" aria-label={`${t.text}：${{pending:'未完成',done:'完成',cancelled:'不做了',deferred:'已延期'}[t.status]}，点击切换`} disabled={t.status==='deferred'} onClick={e=>{e.stopPropagation();quickStatus(p,t,{pending:'done',done:'cancelled',cancelled:'pending'}[t.status],logId)}}>{t.status==='done'?'✓':t.status==='cancelled'?'':t.status==='deferred'?'→':''}</button>{editable&&taskEdit?.planId===p.id&&taskEdit.id===t.id?<input autoFocus className="planlog-task-text-input" aria-label="编辑待办文字" maxLength={200} value={taskEdit.text} onChange={e=>setTaskEdit({...taskEdit,text:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(taskEdit.text.trim()&&changeTask(p,t.id,{text:taskEdit.text.trim()}))setTaskEdit(null)}if(e.key==='Escape'){e.preventDefault();setTaskEdit(null)}}} onBlur={()=>{if(taskEdit.text.trim()&&changeTask(p,t.id,{text:taskEdit.text.trim()}))setTaskEdit(null)}}/>:<span>{t.text}</span>}{editable&&<div className="planlog-task-tools"><button type="button" className="icon-btn" aria-label={`编辑待办：${t.text}`} onClick={()=>setTaskEdit({planId:p.id,id:t.id,text:t.text})}><Pencil size={13}/></button><button type="button" className="icon-btn" aria-label={`删除待办：${t.text}`} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(window.confirm(`删除待办“${t.text}”？`)){changeTask(p,t.id,{},true);setTaskEdit(null)}}}><Trash2 size={13}/></button></div>}</div>)}</div>
 const category=p=>categories.find(c=>c.id===p.categoryId)
 const tags=(categoryName,projectName)=><div className="planlog-block-tags">{categoryName&&<span>{categoryName}</span>}{projectName&&<span>{projectName}</span>}</div>
 const blocks=planLanes(plans.filter(p=>p.date===date).map(p=>({id:p.id,a:planMinutes(p.start),b:planMinutes(p.end),p})))
 const logs=planLanes(daily.map(r=>({id:r.id,a:r.segmentStart,b:r.segmentEnd,r})))
 const log=p=>{const action=planLogAction(p,records);if(action.type==='edit'){onEditLog(action.records[0]);setDraft(null);setLogChoices(null);return}if(action.type==='choose'){setLogChoices({planId:p.id,records:action.records});return}const c=category(p),project=projects.find(x=>x.id===p.projectId),d=deliverables.find(x=>x.id===p.deliverableId);onLog({title:p.title,date:p.date,start:p.start,end:p.end,planId:p.id,...(c?{category:c.name}:{}),...(project?{project:project.name}:{}),...(d?{deliverableId:d.id}:{})});setDraft(null)}
 return <section className={`card planlog${zoom===1.8?" planlog-standard":""}`}><div className="planlog-toolbar"><div><h2>PLAN &amp; LOG</h2><p>点击计划块直接查看与编辑；待办方框可快速标记完成或不做了。</p></div><div className="backup-actions"><button className="secondary" onClick={toggleZoom}>{zoom===1.8?'放大时间轴':'标准时间轴'}</button><button className="secondary" onClick={scrollNow}>{date===today?'回到现在':'上午 8 点'}</button><button type="button" className="secondary" onClick={()=>{setImportResult(null);setShowPlanImport(true)}}><Upload size={15}/>导入计划</button><button className="secondary" onClick={()=>create()}><Plus size={15}/>添加计划</button></div></div>

 {importResult?.date===date&&<p className="import-message" role="status">已导入 {importResult.count} 个计划时间块。</p>}
 {showPlanImport&&<PlanImport key={date} date={date} plans={plans} categories={categories} projects={projects} deliverables={deliverables} onImport={importPlans} onClose={()=>setShowPlanImport(false)}/>}
 <div className="planlog-head"><strong>PLAN · 计划</strong><span>时间</span><strong>LOG · 记录</strong></div>
 <div className="planlog-scroll" ref={scroller}><div className="planlog-canvas" style={{height:1440*zoom,marginTop:anchorPlan?panelSpace:0,'--hour-height':`${60*zoom}px`}}> {draft&&!recordEditor&&<section ref={editorRef} style={{top:planMinutes(draft.start)*zoom}} className="modal fixed-action-modal planlog-inline-editor planlog-unified" role="region" aria-label="计划查看与编辑"><form onSubmit={submit}><div className="planlog-unified-heading"><input autoFocus required aria-label="计划名称" maxLength={160} placeholder="计划名称" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/><button type="button" className="icon-btn" aria-label="关闭计划" onClick={()=>setDraft(null)}><X size={18}/></button></div><div className="modal-scroll-body"><details className="planlog-meta-disclosure"><summary aria-label="展开时间与关联设置"><span>{Number(draft.date.slice(5,7))}月{Number(draft.date.slice(8))}日 · {draft.start}–{draft.end}</span>{draft.categoryId&&<span className="planlog-meta-tag">{categories.find(c=>c.id===draft.categoryId)?.name||'分类已移除'}</span>}{draft.projectId&&<span className="planlog-meta-tag">{projects.find(p=>p.id===draft.projectId)?.name||'项目已移除'}</span>}{draft.deliverableId&&<span className="planlog-meta-tag">{deliverables.find(d=>d.id===draft.deliverableId)?.name||'交付任务已移除'}</span>}<Pencil size={13}/></summary><div className="planlog-meta-expanded"><div className="planlog-meta-fields"><label>日期<TemporalInput required type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><label>开始时间<TemporalInput required type="time" value={draft.start} onChange={e=>{
  const start=e.target.value
  setDraft(current=>withStartTime(current,start))
 }}/></label><label>结束时间<TemporalInput required type="time" value={draft.end==='24:00'?'00:00':draft.end} onChange={e=>setDraft({...draft,end:e.target.value==='00:00'?'24:00':e.target.value})}/></label></div><div className="planlog-meta-fields planlog-catalog-fields"><label>分类<select value={draft.categoryId} onChange={e=>setDraft({...draft,categoryId:e.target.value})}><option value="">不指定</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>项目<select value={draft.projectId} onChange={e=>setDraft({...draft,projectId:e.target.value,deliverableId:''})}><option value="">不指定</option>{projects.filter(p=>!p.archived||p.id===draft.projectId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>交付任务<select value={draft.deliverableId} onChange={e=>setDraft({...draft,deliverableId:e.target.value})}><option value="">不指定</option>{deliverables.filter(d=>d.projectId===draft.projectId).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div></div></details>{logChoices?.planId===draft.id&&<div className="planlog-log-choices"><strong>选择要编辑的实际记录</strong>{logChoices.records.map(r=><button type="button" className="secondary" key={r.id} onClick={()=>{onEditLog(r);setDraft(null);setLogChoices(null)}}>{r.date} {r.start}–{r.end} · {r.title}</button>)}<button type="button" className="icon-btn" aria-label="关闭记录选择" onClick={()=>setLogChoices(null)}><X size={14}/></button></div>}<div className="planlog-unified-content"><section><h3>PLAN · 待办内容</h3>{taskList(draft,true)}<div className="todo-form"><button type="button" className="secondary" aria-label="添加计划待办" disabled={!text.trim()||draft.tasks.length>=30} onClick={()=>{const next={...draft,tasks:[...draft.tasks,{id:crypto.randomUUID(),text:text.trim(),status:'pending'}]};setDraft(next);setText('');if(plans.some(p=>p.id===next.id)){try{persist(savePlan(plans,next))}catch(e){setError(e.message)}}}}><Plus size={15}/></button><input aria-label="计划待办内容" maxLength={200} placeholder="添加一件待办" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(text.trim()&&draft.tasks.length<30){const next={...draft,tasks:[...draft.tasks,{id:crypto.randomUUID(),text:text.trim(),status:'pending'}]};setDraft(next);setText('');if(plans.some(p=>p.id===next.id)){try{persist(savePlan(plans,next))}catch(e){setError(e.message)}}}}}}/></div></section><section><h3>笔记</h3><textarea aria-label="计划笔记" maxLength={20000} rows={6} placeholder="记下思路、参考链接或下次继续的位置" value={draft.notes||''} onChange={e=>setDraft({...draft,notes:e.target.value})}/></section></div>{error&&<p role="alert" className="form-error">{error}</p>}</div><div className="actions">{plans.some(p=>p.id===draft.id)&&<button type="button" className="icon-btn" aria-label="删除计划" onClick={()=>{if(window.confirm('删除此计划？关联的实际记录仍保留。')&&persist(plans.filter(p=>p.id!==draft.id)))setDraft(null)}}><Trash2 size={16}/></button>}<button type="button" className="secondary" disabled={!draft.title.trim()} onClick={()=>{try{if(persist(savePlan(plans,draft)))log(draft)}catch(e){setError(e.message)}}}>LOG</button><button type="button" className="secondary" onClick={()=>setDraft(null)}>取消</button><button type="submit" className="primary">保存</button></div></form></section>}
{recordEditor&&<section ref={editorRef} className="planlog-inline-log-editor" style={{top:planMinutes(recordAnchor.start)*zoom}} aria-label="就地编辑实际记录">{recordEditor}</section>}<div className="planlog-half planlog-left" onDoubleClick={e=>{if(e.target!==e.currentTarget)return;const minutes=Math.min(1410,Math.floor((e.clientY-e.currentTarget.getBoundingClientRect().top)/30)*30);create(clock(minutes))}}>{Array.from({length:24},(_,h)=><button className="planlog-empty-slot" key={h} style={{top:h*60*zoom,height:60*zoom}} aria-label={`添加${h}点计划`} onClick={()=>create(clock(h*60))}/>)}{blocks.map(({p,a,b,lane,columns})=><div key={p.id} className="planlog-block planlog-planned" onClick={e=>{if(e.target.closest('button,.planlog-inline-tasks'))return;open(p)}} style={{top:a*zoom,height:(b-a)*zoom,left:`calc(${lane/columns*100}% + 5px)`,width:`calc(${100/columns}% - 10px)`,'--block-color':category(p)?.color||'#a78bfa'}} title={p.title}><div className="planlog-block-header"><button type="button" className="planlog-block-title" onClick={()=>open(p)}>{p.title}</button><div className="planlog-block-meta"><small>{p.start}–{p.end}{p.tasks.length?` · ${p.tasks.filter(t=>t.status==='done').length}/${p.tasks.length}`:''}</small>{tags(category(p)?.name,projects.find(x=>x.id===p.projectId)?.name)}</div></div>{zoom>1.8&&taskList(p)}</div>)}</div>
 <div className="planlog-axis">{Array.from({length:25},(_,h)=><span key={h} style={{top:h*60*zoom}}>{clock(h*60)}</span>)}</div>
 <div className="planlog-half planlog-right">{Array.from({length:24},(_,h)=>{const a=h*60,b=a+60;const busy=daily.filter(r=>r.segmentStart<b&&r.segmentEnd>a).sort((x,y)=>x.segmentStart-y.segmentStart);let cursor=a;const gaps=[];for(const r of busy){if(r.segmentStart>cursor)gaps.push([cursor,r.segmentStart]);cursor=Math.max(cursor,r.segmentEnd)}if(cursor<b)gaps.push([cursor,b]);return gaps.map(([start,end])=><button type="button" className="planlog-empty-slot" key={`${start}-${end}`} style={{top:start*zoom,height:(end-start)*zoom}} aria-label={`添加实际记录 ${clock(start)}–${clock(end)}`} onClick={()=>{setDraft(null);onLog({date,start:clock(start),end:clock(end)})}}/>)})}{logs.map(({r,a,b,lane,columns})=><div key={r.id} className="planlog-block planlog-actual" style={{top:a*zoom,height:(b-a)*zoom,left:`calc(${lane/columns*100}% + 5px)`,width:`calc(${100/columns}% - 10px)`,'--block-color':categories.find(c=>c.name===r.category)?.color||'#94a3b8'}} ><div className="planlog-block-header"><button type="button" className="planlog-block-title" onClick={()=>onEditLog(r)}>{r.title}</button><div className="planlog-block-meta"><small>{clock(a)}–{clock(b)} · {b-a} 分钟</small>{tags(r.category,r.project)}</div></div>{zoom>1.8&&plans.filter(p=>planOverlapsRecord(p,r)).map(p=><div key={p.id}>{taskList(p,false,r.id)}</div>)}{zoom>1.8&&<LogTasks compact tasks={r.logTasks} onChange={tasks=>onLogTasks(r.id,tasks)}/>}</div>)}</div>
 {date===today&&<div className="planlog-now" style={{top:(now.getHours()*60+now.getMinutes())*zoom}}/>}</div></div>

 {error&&!draft&&<p role="alert" className="form-error">{error}</p>}

 </section>
}
