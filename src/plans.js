const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
export const planMinutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3))
export function validatePlans(value){
 if(!Array.isArray(value))throw new Error('计划数据无效。')
 const ids=new Set(),taskIds=new Set()
 for(const p of value){
  if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||!validDate(p.date)||typeof p.title!=='string'||!p.title.trim()||p.title.length>160||!TIME.test(p.start)||!(TIME.test(p.end)||p.end==='24:00')||planMinutes(p.end)<=planMinutes(p.start)||!Array.isArray(p.tasks)||p.tasks.length>30)throw new Error('计划内容无效；结束时间应晚于开始时间。跨日计划请按日期分开创建。')
  for(const field of ['categoryId','projectId','deliverableId'])if(p[field]!=null&&typeof p[field]!=='string')throw new Error('计划关联无效。')
  if(p.notes!=null&&(typeof p.notes!=='string'||p.notes.length>20000))throw new Error('计划笔记过长或无效。')
  ids.add(p.id)
  for(const t of p.tasks){if(!t||typeof t.id!=='string'||!t.id||taskIds.has(t.id)||typeof t.text!=='string'||!t.text.trim()||t.text.length>200||!['pending','done','cancelled','deferred'].includes(t.status)||(t.deferredTo!=null&&!validDate(t.deferredTo)))throw new Error('计划待办无效。');if(t.statusAt!=null&&!Number.isFinite(Date.parse(t.statusAt)))throw new Error('待办操作时间无效。');if(t.history!=null&&(!Array.isArray(t.history)||t.history.some(h=>!h||!['pending','done','cancelled','deferred'].includes(h.status)||!Number.isFinite(Date.parse(h.at)))))throw new Error('待办执行历史无效。');if(t.executionLogId!=null&&(typeof t.executionLogId!=='string'||!t.executionLogId))throw new Error('待办关联记录无效。');taskIds.add(t.id)}
 }
 return structuredClone(value)
}
export function savePlan(plans,plan){return validatePlans(plans.some(p=>p.id===plan.id)?plans.map(p=>p.id===plan.id?plan:p):[...plans,plan])}
export function parsePlanImport(text, selectedDate, {categories=[],projects=[],deliverables=[]}={}){
 const categoryIds=new Map(categories.map(category=>[category.name,category.id]))
 const projectsByName=new Map(projects.map(project=>[project.name,project.id]))
 const projectIds=new Set(projectsByName.values())
 const input=text.trim()
 const fencedJson=input.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
 let payload
 try{payload=JSON.parse(fencedJson?.[1]??input)}catch{
  throw new Error('JSON 格式无效，请检查后重试。')
 }
 const entries=Array.isArray(payload)?payload:payload?.plans
 if(!Array.isArray(entries)||!entries.length)throw new Error('请提供至少一个计划时间块。')
 const defaultDate=payload.date===undefined?selectedDate:payload.date
 if(!validDate(defaultDate))throw new Error('日期无效，请使用 YYYY-MM-DD 格式。')
 const createdAt=new Date().toISOString()
 return entries.map((entry,index)=>{
  const prefix=`第 ${index+1} 个时间块`
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error(`${prefix}应包含名称、开始时间和结束时间。`)
  const date=entry.date===undefined?defaultDate:entry.date
  if(!validDate(date))throw new Error(`${prefix}的日期无效，请使用 YYYY-MM-DD 格式。`)
  if(typeof entry.start!=='string'||typeof entry.end!=='string')throw new Error(`${prefix}的开始和结束时间应使用 HH:MM 格式。`)
  const tasks=entry.tasks===undefined?[]:entry.tasks
  if(!Array.isArray(tasks))throw new Error(`${prefix}的待办应是文字数组。`)
  const categoryName=typeof entry.category==='string'?entry.category.trim():''
  const projectName=typeof entry.project==='string'?entry.project.trim():''
  const deliverableName=typeof entry.deliverable==='string'?entry.deliverable.trim():''
  const projectId=projectsByName.get(projectName)
  const matches=deliverableName?deliverables.filter(item=>
   item.name===deliverableName&&projectIds.has(item.projectId)&&(!projectName||item.projectId===projectId)
  ):[]
  const deliverable=matches.length===1?matches[0]:null
  const plan={
   id:crypto.randomUUID(),
   date,
   title:typeof entry.title==='string'?entry.title.trim():entry.title,
   start:entry.start,
   end:entry.end,
   notes:entry.notes,
   categoryId:categoryIds.get(categoryName)??'',
   projectId:projectId??deliverable?.projectId??'',
   deliverableId:deliverable?.id??'',
   tasks:tasks.map(text=>({id:crypto.randomUUID(),text:typeof text==='string'?text.trim():text,status:'pending'})),
   createdAt,
  }
  try{return validatePlans([plan])[0]}catch(error){throw new Error(`${prefix}：${error.message}`)}
 })
}
export function previewPlanImport(existing, imported){
 const key=plan=>JSON.stringify([plan.date,plan.start,plan.end,plan.title.trim()])
 const keys=new Set(existing.map(key))
 const additions=[]
 for(const plan of imported){
  const identity=key(plan)
  if(keys.has(identity))continue
  keys.add(identity)
  additions.push(plan)
 }
 additions.sort((a,b)=>a.date.localeCompare(b.date)||planMinutes(a.start)-planMinutes(b.start)||planMinutes(a.end)-planMinutes(b.end))
 return {additions,skipped:imported.length-additions.length}
}

export function deferPlanTask(plans,plan,taskId,date){
 if(!validDate(date)||date<=plan.date)throw new Error('请选择晚于原计划的日期。')
 const task=plan.tasks.find(t=>t.id===taskId);if(!task||task.status==='deferred')throw new Error('该待办无法再次延期。')
 const nextId=crypto.randomUUID(),nextTaskId=crypto.randomUUID()
 const source={...plan,tasks:plan.tasks.map(t=>t.id===taskId?{...t,status:'deferred',deferredTo:date,statusAt:new Date().toISOString(),history:[...(t.history||[]),{status:'deferred',at:new Date().toISOString()}]}:t)}
 const next={...plan,id:nextId,date,title:plan.title,tasks:[{id:nextTaskId,text:task.text,status:'pending'}],fromPlanId:plan.id,createdAt:new Date().toISOString()}
 return {plans:savePlan(savePlan(plans,source),next),source}
}
// Place overlapping blocks into separate columns rather than covering each other.
export function planLanes(blocks){
 const sorted=[...blocks].sort((a,b)=>a.a-b.a||a.b-b.b),groups=[]
 for(const block of sorted){let group=groups.at(-1);if(!group||block.a>=group.end){group={end:block.b,blocks:[],ends:[]};groups.push(group)}
  let lane=group.ends.findIndex(end=>end<=block.a);if(lane<0)lane=group.ends.length;group.ends[lane]=block.b;group.end=Math.max(group.end,block.b);group.blocks.push({...block,lane})
 }
 return groups.flatMap(g=>g.blocks.map(b=>({...b,columns:g.ends.length})))
}

// Compare absolute local calendar times; touching endpoints are not overlap.
export function planOverlapsRecord(plan,record){
 const interval=x=>{
  const [y,m,d]=x.date.split('-').map(Number)
  const start=planMinutes(x.start),end=planMinutes(x.end)
  return [new Date(y,m-1,d,0,start).getTime(),new Date(y,m-1,d+(end<start?1:0),0,end).getTime()]
 }
 const [a,b]=interval(plan),[c,d]=interval(record)
 return a<d&&c<b
}
export function planLogAction(plan,records){
 const linked=records.filter(r=>planOverlapsRecord(plan,r)).sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`)||a.id.localeCompare(b.id))
 return {type:linked.length===0?'create':linked.length===1?'edit':'choose',records:linked}
}

export function tasksForLog(plan,logId,records){
 const linked=planLogAction(plan,records).records
 return plan.tasks.filter(t=>t.status==='pending'||(t.executionLogId||linked[0]?.id)===logId)
}
export function assignPlanTask(plan,taskId,status,logId){
 const at=new Date().toISOString()
 return {...plan,tasks:plan.tasks.map(t=>t.id===taskId?{...t,status,executionLogId:status==='pending'?undefined:logId,statusAt:at,history:[...(t.history||[]),{status,at,...(logId?{logId}:{})}]}:t)}
}
export function validateLogTasks(tasks){
 if(tasks==null)return []
 if(!Array.isArray(tasks)||tasks.length>30)throw new Error('LOG 待办无效。')
 const ids=new Set()
 for(const t of tasks){if(!t||typeof t.id!=='string'||!t.id||ids.has(t.id)||typeof t.text!=='string'||!t.text.trim()||t.text.length>200||!['pending','done','cancelled'].includes(t.status)||(t.statusAt!=null&&!Number.isFinite(Date.parse(t.statusAt))))throw new Error('LOG 待办无效。');ids.add(t.id)}
 return structuredClone(tasks)
}
