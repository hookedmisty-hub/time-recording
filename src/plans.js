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
