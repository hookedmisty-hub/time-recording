export const EVENT_PRESETS=[
 {key:'deadline',label:'DDL',color:'#fb7185'},
 {key:'work',label:'工作事件',color:'#34d399'},
 {key:'life',label:'生活事件',color:'#fbbf24'},
 {key:'uncategorized',label:'未分类',color:'#94a3b8'},
]
export const eventPreset=e=>EVENT_PRESETS.find(p=>p.key===(e.kind==='deadline'?'deadline':e.eventKey))||EVENT_PRESETS.find(p=>p.color.toLowerCase()===e.color?.toLowerCase()&&p.key!=='deadline')||EVENT_PRESETS[3]
export const eventColor=e=>eventPreset(e).color
const DATE=/^\d{4}-\d{2}-\d{2}$/
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/
export const calendarDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
export const calendarShift=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return calendarDate(d)}
export const calendarMinutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3))
export const calendarClock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`
export function validateCalendarEvents(items){
 if(!Array.isArray(items))throw new Error('日历事件数据无效。')
 const ids=new Set()
 for(const e of items){
  if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.title!=='string'||!e.title.trim()||e.title.length>160||!['event','deadline'].includes(e.kind)||!DATE.test(e.date)||!Number.isFinite(Date.parse(e.date+'T12:00:00Z'))||new Date(e.date+'T12:00:00Z').toISOString().slice(0,10)!==e.date||typeof e.allDay!=='boolean')throw new Error('事件名称、日期或类型无效。')
  if(!e.allDay&&(!TIME.test(e.start)||(e.kind==='event'&&(!TIME.test(e.end)&&e.end!=='24:00'))||(e.kind==='event'&&calendarMinutes(e.end)<=calendarMinutes(e.start))))throw new Error('请填写有效时间；结束时间必须晚于开始时间。跨日事件请分日添加。')
  if(e.eventKey!=null&&(!EVENT_PRESETS.some(p=>p.key===e.eventKey)||(e.kind==='deadline')!==(e.eventKey==='deadline')))throw new Error('事件分类与类型不符。')
  if(e.note!=null&&(typeof e.note!=='string'||e.note.length>5000))throw new Error('事件说明过长。')
  if(e.color!=null&&!/^#[0-9a-f]{6}$/i.test(e.color))throw new Error('事件颜色无效。')
  ids.add(e.id)
 }
 return structuredClone(items)
}
export function calendarMonth(date){
 const first=date.slice(0,7)+'-01',d=new Date(first+'T12:00:00'),offset=(d.getDay()+6)%7
 const count=new Date(d.getFullYear(),d.getMonth()+1,0).getDate()
 return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>calendarShift(first,i-offset))
}
export function calendarWeek(date){const offset=(new Date(date+'T12:00:00').getDay()+6)%7;return Array.from({length:7},(_,i)=>calendarShift(date,i-offset))}
export function deliverableEvents(items){return items.filter(d=>d.dueAt).map(d=>{const at=new Date(d.dueAt);return {id:'delivery:'+d.id,deliverable:d,kind:'deadline',title:d.name,date:calendarDate(at),start:calendarClock(at.getHours()*60+at.getMinutes()),allDay:false,eventKey:'deadline',color:'#fb7185'}})}
export function recordCalendarSegment(r,date){
 const start=calendarMinutes(r.start),end=calendarMinutes(r.end),overnight=end<start
 if(r.date===date)return {a:start,b:overnight?1440:end}
 if(overnight&&calendarShift(r.date,1)===date&&end>0)return {a:0,b:end}
 return null
}

// Keep the duration and all task metadata when moving a plan.
export function moveCalendarPlan(plan,date,minute=null){
 const duration=calendarMinutes(plan.end)-calendarMinutes(plan.start)
 if(!Number.isFinite(duration)||duration<=0||duration>1440)throw new Error('计划时长无效。')
 const start=minute==null?calendarMinutes(plan.start):Math.max(0,Math.min(1440-duration,Math.round(minute/15)*15))
 return {...plan,date,start:calendarClock(start),end:calendarClock(start+duration)}
}

export function moveCalendarEvent(event,date,minute=null){
 let next={...event,date}
 if(!event.allDay&&minute!=null){
  const duration=event.kind==='deadline'?0:calendarMinutes(event.end)-calendarMinutes(event.start)
  const start=Math.max(0,Math.min(event.kind==='deadline'?1439:1440-duration,Math.round(minute/15)*15))
  next={...next,start:calendarClock(start),...(event.kind==='event'?{end:calendarClock(start+duration)}:{})}
 }
 if(event.deliverable){
  const old=new Date(event.deliverable.dueAt),at=new Date(`${date}T${next.start}:00`)
  if(minute==null)at.setSeconds(old.getSeconds(),old.getMilliseconds())
  if(calendarDate(at)!==date||calendarClock(at.getHours()*60+at.getMinutes())!==next.start)throw new Error('该日期时间在当前时区无效，请选择其他时刻。')
  next.deliverable={...event.deliverable,dueAt:at.toISOString()}
 }
 return next
}
