import {isWorkRole} from './categories.js'
import {eventPreset} from './historyCalendar.js'
import {useEffect} from 'react'
import {X,Pencil} from 'lucide-react'
import {planOverlapsRecord,tasksForLog} from './plans.js'
export default function CalendarDetail({detail,plans,records,categories,projects,deliverables,onClose,onEdit}){
 const {kind,item}=detail
 const logCategory=kind==='log'?categories.find(c=>c.name===item.category):undefined
 useEffect(()=>{const close=e=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[onClose])
 const tasks=(items,label)=><section className="calendar-detail-section"><h3>{label}</h3>{items?.length?<ul>{items.map(t=><li key={t.id} className={`planlog-task-${t.status}`}><span aria-hidden="true">{t.status==='done'?'✓':t.status==='cancelled'?'—':'□'}</span> {t.text}</li>)}</ul>:<p className="import-help">暂无待办</p>}</section>
 const tags=(category,project)=><div className="calendar-tags">{category&&<span>{category}</span>}{project&&<span>{project}</span>}</div>
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal calendar-detail" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title"><div className="modal-header"><h2 id="calendar-detail-title">{item.title}</h2><button type="button" className="icon-btn" aria-label="关闭详情" onClick={onClose}><X size={18}/></button></div><div className="calendar-detail-body"><p className="calendar-detail-meta">{{plan:'计划',log:'实际记录',event:item.kind==='deadline'?'截止事项':'日程',deliverable:'交付任务截止'}[kind]} · {item.date} · {item.allDay?'全天':`${item.start}${['plan','log'].includes(kind)||item.kind==='event'?`–${item.end}${item.end<item.start?'（次日）':''}`:''}`}</p>
 {kind==='plan'&&<>{tags(categories.find(c=>c.id===item.categoryId)?.name,projects.find(p=>p.id===item.projectId)?.name)}{item.deliverableId&&<p>{deliverables.find(d=>d.id===item.deliverableId)?.name}</p>}{tasks(item.tasks,'计划待办')}<section className="calendar-detail-section"><h3>计划笔记</h3><p>{item.notes||'暂无笔记'}</p></section></>}
 {kind==='log'&&<>{tags(item.category,isWorkRole(logCategory?.kind)?item.project:undefined)}{item.deliverableId&&<p>{deliverables.find(d=>d.id===item.deliverableId)?.name}</p>}{plans.filter(p=>planOverlapsRecord(p,item)).map(p=><section key={p.id}>{tasks(tasksForLog(p,item.id,records),`关联计划 · ${p.title}`)}{p.notes&&<div className="calendar-detail-section"><h3>计划笔记</h3><p>{p.notes}</p></div>}</section>)}{item.logTasks?.length>0&&tasks(item.logTasks,'LOG 独立待办')}<section className="calendar-detail-section"><h3>实际备注</h3><p>{item.note||'暂无备注'}</p></section></>}
 {kind==='event'&&<p className="calendar-event-category" style={{color:eventPreset(item).color}}>{eventPreset(item).label}</p>}
 {kind==='event'&&<section className="calendar-detail-section"><h3>说明</h3><p>{item.note||'暂无说明'}</p></section>}
 {kind==='deliverable'&&<><p>所属项目：{projects.find(p=>p.id===item.deliverable.projectId)?.name}</p><p>{item.deliverable.completedAt?`完成于 ${new Date(item.deliverable.completedAt).toLocaleString()}`:'尚未完成'}</p>{item.deliverable.milestoneName&&<section className="calendar-detail-section"><h3>阶段成果</h3><p>{item.deliverable.milestoneName}{item.deliverable.milestoneAt?` · ${new Date(item.deliverable.milestoneAt).toLocaleString()}`:' · 未达成'}</p></section>}</>}
 </div><div className="actions">{kind!=='log'&&<button type="button" className="secondary" onClick={onEdit}><Pencil size={14}/>编辑</button>}<button type="button" className="primary" onClick={onClose}>关闭</button></div></section></div>
}
