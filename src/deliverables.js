export const DELIVERABLE_KEY='time-recording-deliverables-v1'
const zonedTime=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function validateTime(value){
 if(value==null)return null
 if(typeof value!=='string'||!zonedTime.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('交付项时间无效，必须包含时区。')
 return value
}

export function validateDeliverables(items,projects){
 if(!Array.isArray(items))throw new Error('交付项列表无效。')
 const ids=new Set()
 const projectIds=new Set(projects.filter(p=>p.name!=='未分类'&&p.name!=='其他').map(p=>p.id))
 return items.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id.trim()||ids.has(item.id)||!projectIds.has(item.projectId)||
   typeof item.name!=='string'||!item.name.trim()||item.name.length>100||
   typeof item.milestoneName!=='string'||item.milestoneName.length>100)throw new Error('交付项名称、ID 或所属项目无效。')
  ids.add(item.id)
  const milestoneAt=validateTime(item.milestoneAt)
  if(milestoneAt&&!item.milestoneName.trim())throw new Error('已达成的阶段成果需要名称。')
  return {...item,name:item.name.trim(),milestoneName:item.milestoneName.trim(),dueAt:validateTime(item.dueAt),milestoneAt,completedAt:validateTime(item.completedAt)}
 })
}

export function loadDeliverables(projects){
 try{return validateDeliverables(JSON.parse(localStorage.getItem(DELIVERABLE_KEY)||'[]'),projects)}
 catch{return []}
}

// A named project can have different IDs in backups created on different devices.
export function mergeDeliverables(projects,localProjects,localItems,incomingProjects,incomingItems,restoreSettings){
 const mergedProjects=[...projects]
 const items=new Map()
 function add(item,sourceProjects,incoming){
  const source=sourceProjects.find(p=>p.id===item.projectId)
  if(!source)throw new Error('找不到交付项所属项目。')
  let target=mergedProjects.find(p=>p.id===source.id)||mergedProjects.find(p=>p.name===source.name)
  if(!target){target=source;mergedProjects.push(target)}
  const previous=items.get(item.id)
  if(previous&&previous.projectId!==target.id)throw new Error('交付项 ID 对应了不同的项目，无法合并。')
  if(!previous||(incoming&&restoreSettings))items.set(item.id,{...item,projectId:target.id})
 }
 for(const item of localItems)add(item,localProjects,false)
 for(const item of incomingItems)add(item,incomingProjects,true)
 return {projects:mergedProjects,deliverables:[...items.values()]}
}
