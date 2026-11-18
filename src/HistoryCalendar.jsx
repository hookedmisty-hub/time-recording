import CalendarPlanEditor from './CalendarPlanEditor.jsx'
import CalendarDetail from './CalendarDetail.jsx'
import {useEffect,useRef,useState} from 'react'
import {ChevronLeft,ChevronRight,Plus,X,Trash2,CalendarDays,Flag} from 'lucide-react'
import TemporalInput from './TemporalInput.jsx'
import {EVENT_PRESETS,eventPreset,eventColor,moveCalendarEvent,moveCalendarPlan,calendarDate,calendarShift,calendarMonth,calendarWeek,calendarMinutes,calendarClock,deliverableEvents,recordCalendarSegment,validateCalendarEvents} from './historyCalendar.js'
import {planLanes,savePlan} from './plans.js'
const weekdays=['一','二','三','四','五','六','日']
export default function HistoryCalendar({date,onDateChange,events=[],onEventsChange,plans=[],records,categories,projects,deliverables,onOpenDeliverable,onDeliverableChange,onPlansChange,onViewChange,children}){
 const [view,setView]=useState('month'),[draft,setDraft]=useState(null),[error,setError]=useState('')
 const [now,setNow]=useState(()=>new Date())
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer)},[])
 useEffect(()=>{onViewChange?.(view)},[view,onViewChange])
 const [detail,setDetail]=useState(null)
 const [planDraft,setPlanDraft]=useState(null)
 const createPlan=(day,start)=>setPlanDraft({id:crypto.randomUUID(),date:day,title:'',start,end:calendarClock(Math.min(1440,calendarMinutes(start)+60)),categoryId:'',projectId:'',deliverableId:'',tasks:[],createdAt:new Date().toISOString()})
 const dragRef=useRef(null),suppressClick=useRef(0)
 const [dragId,setDragId]=useState(null),[dropPreview,setDropPreview]=useState(null),[moveMessage,setMoveMessage]=useState('')
 const startPlanDrag=(event,plan,mode,kind='plan')=>{
  if(event.pointerType!=='mouse'||event.button!==0)return
  dragRef.current={id:plan.id,kind,mode,x:event.clientX,y:event.clientY,offset:mode==='week'?event.clientY-event.currentTarget.getBoundingClientRect().top:0,active:false,target:null}
 }
 useEffect(()=>{
  const targetAt=event=>{
   const drag=dragRef.current;if(!drag)return null
   const cell=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-calendar-day]')
   const item=drag.kind==='plan'?plans.find(p=>p.id===drag.id):[...events,...deliverableEvents(deliverables)].find(e=>e.id===drag.id)
   const validCell=cell&&(cell.dataset.calendarMode===drag.mode||(drag.mode==='week-date'&&cell.dataset.calendarMode.startsWith('week')))
   if(!validCell||!item)return null
   const minute=drag.mode==='week'?event.clientY-cell.getBoundingClientRect().top-drag.offset:null
   const moved=drag.kind==='plan'?moveCalendarPlan(item,cell.dataset.calendarDay,minute):moveCalendarEvent(item,cell.dataset.calendarDay,minute)
   return {...moved,dragKind:drag.kind}

  }
  const move=event=>{
   const drag=dragRef.current;if(!drag)return
   if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return
   drag.active=true;event.preventDefault();setDragId(`${drag.kind}:${drag.id}`)
   const target=targetAt(event);drag.target=target
   setDropPreview(old=>old?.date===target?.date&&old?.start===target?.start&&old?.end===target?.end?old:target)
  }
  const finish=event=>{
   const drag=dragRef.current;if(!drag)return
   if(drag.active){
    try{
     const item=drag.kind==='plan'?plans.find(p=>p.id===drag.id):[...events,...deliverableEvents(deliverables)].find(e=>e.id===drag.id)
     const moved=targetAt(event)
     if(item&&moved){
      const {dragKind,...next}=moved
      if(next.date!==item.date||next.start!==item.start){
       if(drag.kind==='plan')onPlansChange(savePlan(plans,next))
       else if(next.deliverable)onDeliverableChange(next.deliverable)
       else onEventsChange(validateCalendarEvents(events.map(e=>e.id===next.id?next:e)))
      }
      setMoveMessage(`已移动「${item.title}」至 ${next.date}${next.allDay?' 全天':` ${next.start}${next.kind==='deadline'?'':`–${next.end}`}`}`)
     }
    }catch(error){setMoveMessage(error.message)}

    suppressClick.current=Date.now()+400
   }
   dragRef.current=null;setDragId(null);setDropPreview(null)
  }
  const cancel=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(dragRef.current?.active)suppressClick.current=Date.now()+400;dragRef.current=null;setDragId(null);setDropPreview(null)}
  document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',cancel)
  return()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',cancel)}
 },[plans,events,deliverables,onPlansChange,onEventsChange,onDeliverableChange])
 const openPlanDetail=plan=>{if(Date.now()>=suppressClick.current)setDetail({kind:'plan',item:plan})}
 const weekScroll=useRef(null)
 const [highlightId,setHighlightId]=useState(null)
 useEffect(()=>{if(!highlightId)return;const timer=setTimeout(()=>setHighlightId(null),1800);return()=>clearTimeout(timer)},[highlightId])
 const jumpToDeadline=e=>{const scroller=weekScroll.current;if(!scroller)return;const block=Array.from(scroller.querySelectorAll('[data-calendar-event]')).find(node=>node.dataset.calendarEvent===e.id);if(!block)return;const frame=scroller.getBoundingClientRect(),target=block.getBoundingClientRect(),head=scroller.querySelector('.calendar-week-head')?.getBoundingClientRect().height||70;scroller.scrollTo({top:Math.max(0,scroller.scrollTop+target.top-frame.top-head-50),left:Math.max(0,scroller.scrollLeft+target.left-frame.left-(frame.width-target.width)/2),behavior:'smooth'});setHighlightId(e.id)}
 useEffect(()=>{if(view==='week'&&weekScroll.current)weekScroll.current.scrollTop=450},[view,date])
 const all=[...events,...deliverableEvents(deliverables)].sort((a,b)=>(a.allDay?'':a.start).localeCompare(b.allDay?'':b.start)||a.title.localeCompare(b.title))
 const create=(day=date)=>{setError('');setDraft({id:crypto.randomUUID(),title:'',date:day,kind:'event',allDay:false,start:'09:00',end:'10:00',note:'',eventKey:'uncategorized',color:'#94a3b8'})}
 const open=e=>{if(Date.now()>=suppressClick.current)setDetail({kind:e.deliverable?'deliverable':'event',item:e})}
 const editDetail=()=>{const {kind,item}=detail;setDetail(null);if(kind==='plan')setPlanDraft(item);else if(kind==='deliverable')onOpenDeliverable(item.deliverable);else if(kind==='event'){setError('');setDraft({...item,eventKey:eventPreset(item).key,color:eventColor(item)})}}
 const save=e=>{e.preventDefault();try{const item={...draft,title:draft.title.trim(),eventKey:eventPreset(draft).key,color:eventColor(draft)};onEventsChange(validateCalendarEvents(events.some(x=>x.id===item.id)?events.map(x=>x.id===item.id?item:x):[...events,item]));setDraft(null)}catch(e){setError(e.message)}}
 const move=n=>{if(view==='month'){const d=new Date(date.slice(0,7)+'-01T12:00:00');d.setMonth(d.getMonth()+n);onDateChange(calendarDate(d))}else onDateChange(calendarShift(date,n*(view==='week'?7:1)))}
 const eventButton=(e,top=false)=><button type="button" key={e.id} draggable={false} onPointerDown={event=>{if(view!=='day')startPlanDrag(event,e,view==='month'?'month':'week-date','event')}} className={`calendar-event ${dragId===`event:${e.id}`?'is-dragging':''} ${e.kind==='deadline'?'is-deadline':''}`} style={{'--event-color':eventColor(e)}} onClick={()=>{if(Date.now()<suppressClick.current)return;top&&e.kind==='deadline'&&!e.allDay?jumpToDeadline(e):open(e)}}>{e.kind==='deadline'?<Flag size={12} aria-hidden="true"/>:<CalendarDays size={12} aria-hidden="true"/>}<span>{e.kind==='deadline'?`DDL${e.allDay?'':` ${e.start}`}`:e.allDay?'全天':e.start}</span> {e.title}</button>
 const week=calendarWeek(date)
 const tags=(category,project)=><div className="calendar-tags">{category&&<span>{category}</span>}{project&&<span>{project}</span>}</div>
 const dayBlocks=day=>{
  const p=plans.filter(p=>p.date===day).map(p=>({id:'plan:'+p.id,a:calendarMinutes(p.start),b:calendarMinutes(p.end),title:p.title,kind:'PLAN',color:categories.find(c=>c.id===p.categoryId)?.color||'#a78bfa',category:categories.find(c=>c.id===p.categoryId)?.name,project:projects.find(x=>x.id===p.projectId)?.name,plan:p,open:()=>openPlanDetail(p)}))
  const r=records.flatMap(r=>{const segment=recordCalendarSegment(r,day);return segment?[{id:'log:'+r.id,...segment,title:r.title,kind:'LOG',color:categories.find(c=>c.name===r.category)?.color||'#94a3b8',category:r.category,project:r.project,open:()=>setDetail({kind:'log',item:r})}]:[]})
  const e=all.filter(e=>e.date===day&&!e.allDay).map(e=>({id:e.id,a:calendarMinutes(e.start),b:e.kind==='deadline'?Math.min(1440,calendarMinutes(e.start)+30):calendarMinutes(e.end),title:e.title,kind:e.kind==='deadline'?'DDL':'日程',color:eventColor(e),event:e,open:()=>open(e)}))
  const lanes=[...planLanes(p).map(x=>({...x,side:0})),...planLanes(r).map(x=>({...x,side:1})),...planLanes(e).map(x=>({...x,side:null}))]
  return lanes.map(x=><button type="button" key={x.id} draggable={false} onPointerDown={event=>{if(x.plan)startPlanDrag(event,x.plan,'week');else if(x.event)startPlanDrag(event,x.event,'week','event')}} data-calendar-event={x.id} className={`calendar-week-block${highlightId===x.id?' is-highlighted':''} ${x.kind==='PLAN'?'is-plan':''} ${dragId===(x.plan?`plan:${x.plan.id}`:x.event?`event:${x.event.id}`:'')?'is-dragging':''} ${x.side===null?'is-schedule':''}`} style={{top:x.a,height:Math.max(30,x.b-x.a),left:`calc(${x.side===null?x.lane/x.columns*100:x.side*50+x.lane/x.columns*50}% + 2px)`,width:`calc(${(x.side===null?100:50)/x.columns}% - 4px)`,'--event-color':x.color}} onClick={x.open}><strong className={x.side===null?'calendar-schedule-title':undefined}>{x.side===null&&(x.kind==='DDL'?<Flag size={13} aria-hidden="true"/>:<CalendarDays size={13} aria-hidden="true"/>)}{x.title}</strong>{tags(x.category,x.project)}</button>)
 }
 return <><div className="history-calendar-shell"><section className="card history-calendar"><div className="calendar-tab-bar"><div className="calendar-view-switch">{[['month','月'],['week','周'],['day','日']].map(([id,name])=><button type="button" className={`calendar-tab ${view===id?'active':''}`} aria-pressed={view===id} key={id} onClick={()=>setView(id)}>{name}视图</button>)}</div><div className="calendar-tab-actions">{view==='week'&&<button type="button" className="calendar-tab" onClick={()=>createPlan(date,'09:00')}><Plus size={15}/>添加计划</button>}<button type="button" className="calendar-tab calendar-add-event" onClick={()=>create()}><Plus size={15}/>添加事件</button></div></div><div className="history-calendar-toolbar"><div className="calendar-navigation"><button type="button" className="icon-btn" aria-label="上一段日期" onClick={()=>move(-1)}><ChevronLeft size={18}/></button><strong>{view==='month'?date.slice(0,7):view==='week'?`${week[0]} — ${week[6]}`:date}</strong><button type="button" className="icon-btn" aria-label="下一段日期" onClick={()=>move(1)}><ChevronRight size={18}/></button><button type="button" className="secondary" onClick={()=>onDateChange(calendarDate())}>回到今天</button><TemporalInput aria-label="日历日期" type="date" value={date} onChange={e=>{if(e.target.value)onDateChange(e.target.value)}}/></div></div>
 <div className="calendar-event-key" aria-label="事件配色说明">{EVENT_PRESETS.map(p=><span key={p.key}><i style={{background:p.color}}/>{p.label}</span>)}</div>
 {moveMessage&&<span className="calendar-move-announcement" role="status">{moveMessage}</span>}
 {view==='month'&&<div className="calendar-month-scroll"><div className="calendar-month-grid">{weekdays.map(d=><div className="calendar-weekday" key={d}>{d}</div>)}{calendarMonth(date).map(day=><div key={day} data-calendar-day={day} data-calendar-mode="month" className={`calendar-month-day ${dropPreview?.date===day?'is-drop-target':''} ${day.slice(0,7)!==date.slice(0,7)?'outside-month':''} ${day===calendarDate()?'is-today':''}`}><div className="calendar-day-heading"><button type="button" aria-label={`查看${day}`} onClick={()=>{onDateChange(day);setView('day')}}>{Number(day.slice(8))}</button><button type="button" className="icon-btn" aria-label={`在${day}添加事件`} onClick={()=>create(day)}><Plus size={12}/></button></div><div className="calendar-month-events">{all.filter(e=>e.date===day).map(e=>eventButton(e))}</div></div>)}</div></div>}
 {view==='week'&&<><div className="calendar-week-scroll" ref={weekScroll}><div className="calendar-week-inner"><div className="calendar-week-head"><div/>{week.map(day=><div key={day} data-calendar-day={day} data-calendar-mode="week-date" className={day===calendarDate()?'is-today':''}><button type="button" onClick={()=>{onDateChange(day);setView('day')}}>{day.slice(5)} · {weekdays[new Date(day+'T12:00:00').getDay()===0?6:new Date(day+'T12:00:00').getDay()-1]}</button><div>{all.filter(e=>e.date===day&&(e.allDay||e.kind==='deadline')).map(e=>eventButton(e,true))}</div></div>)}</div><div className="calendar-week-body"><div className="calendar-week-axis">{Array.from({length:25},(_,h)=><span key={h} style={{top:h*60}}>{calendarClock(h*60)}</span>)}</div>{week.map(day=><div className="calendar-week-day" key={day} data-calendar-day={day} data-calendar-mode="week">{Array.from({length:24},(_,h)=><button type="button" key={h} className="calendar-plan-slot" style={{top:h*60}} aria-label={`在${day} ${calendarClock(h*60)}添加计划`} onClick={()=>createPlan(day,calendarClock(h*60))}/>)}{dayBlocks(day)}{dropPreview?.date===day&&dragId&&<div className={`calendar-plan-drop-preview ${dropPreview.dragKind==='event'?'is-event-preview':''}`} style={{top:dropPreview.allDay?0:calendarMinutes(dropPreview.start),height:dropPreview.kind==='deadline'||dropPreview.allDay?30:calendarMinutes(dropPreview.end)-calendarMinutes(dropPreview.start)}}>{dropPreview.allDay?'全天':dropPreview.kind==='deadline'?dropPreview.start:`${dropPreview.start}–${dropPreview.end}`}</div>}{day===calendarDate(now)&&<div className="calendar-now-line" style={{top:now.getHours()*60+now.getMinutes()}} aria-label={`当前时间 ${calendarClock(now.getHours()*60+now.getMinutes())}`} role="img"><span/></div>}</div>)}</div></div></div></>}
 {view==='day'&&<div className="calendar-day-events">{all.filter(e=>e.date===date).length?all.filter(e=>e.date===date).map(e=>eventButton(e)):<p className="import-help">这一天暂无日程。</p>}</div>}</section></div>{view==='day'&&children}
 {planDraft&&<CalendarPlanEditor plan={planDraft} plans={plans} categories={categories} projects={projects} deliverables={deliverables} onSave={onPlansChange} onClose={()=>setPlanDraft(null)}/>}
 {detail&&<CalendarDetail detail={detail} plans={plans} records={records} categories={categories} projects={projects} deliverables={deliverables} onClose={()=>setDetail(null)} onEdit={editDetail}/>}
 {draft&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDraft(null)}}><section className="modal fixed-action-modal calendar-event-editor" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title"><div className="modal-header"><h2 id="calendar-event-title">{events.some(e=>e.id===draft.id)?'编辑事件':'添加事件'}</h2><button type="button" className="icon-btn" aria-label="关闭事件编辑" onClick={()=>setDraft(null)}><X size={18}/></button></div><form onSubmit={save}><div className="modal-scroll-body"><label>名称<input autoFocus required maxLength={160} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="例如：会议、提交材料"/></label><div className="form-row"><label>类型<select value={draft.kind} onChange={e=>{const preset=e.target.value==='deadline'?EVENT_PRESETS[0]:eventPreset(draft).key==='deadline'?EVENT_PRESETS[3]:eventPreset(draft);setDraft({...draft,kind:e.target.value,eventKey:preset.key,color:preset.color})}}><option value="event">定时事件</option><option value="deadline">截止事项（DDL）</option></select></label><label>日期<TemporalInput required type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label></div><label className="midnight-option"><input type="checkbox" checked={draft.allDay} onChange={e=>setDraft({...draft,allDay:e.target.checked})}/>全天</label>{!draft.allDay&&<div className="form-row"><label>{draft.kind==='deadline'?'截止时间':'开始时间'}<TemporalInput required type="time" value={draft.start} onChange={e=>setDraft({...draft,start:e.target.value})}/></label>{draft.kind==='event'&&<label>结束时间<TemporalInput required type="time" value={draft.end==='24:00'?'00:00':draft.end} onChange={e=>setDraft({...draft,end:e.target.value==='00:00'?'24:00':e.target.value})}/></label>}</div>}<fieldset className="event-preset-picker"><legend>事件分类与颜色</legend><div>{EVENT_PRESETS.map(p=><button type="button" key={p.key} aria-pressed={eventPreset(draft).key===p.key} style={{'--event-color':p.color}} onClick={()=>setDraft({...draft,eventKey:p.key,color:p.color,kind:p.key==='deadline'?'deadline':'event'})}><span style={{background:p.color}}/>{p.label}</button>)}</div></fieldset><label>说明（可选）<textarea rows={3} maxLength={5000} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>{error&&<p role="alert" className="form-error">{error}</p>}</div><div className="actions">{events.some(e=>e.id===draft.id)&&<button type="button" className="icon-btn" aria-label="删除事件" onClick={()=>{if(window.confirm('删除这个日历事件？')){onEventsChange(events.filter(e=>e.id!==draft.id));setDraft(null)}}}><Trash2 size={16}/></button>}<button type="button" className="secondary" onClick={()=>setDraft(null)}>取消</button><button type="submit" className="primary">保存事件</button></div></form></section></div>}</>
}
