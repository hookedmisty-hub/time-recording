export const TODO_KEY='time-recording-todos-v1'
export function validateTodos(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('待办备份格式无效。')
 const result={}
 for(const [date,items] of Object.entries(value)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date||!Array.isArray(items)||items.length>5)throw new Error('每天最多 5 条待办，日期必须有效。')
  const seen=new Set()
  result[date]=items.map(item=>{
   if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id)||typeof item.text!=='string'||!item.text.trim()||item.text.length>160||typeof item.done!=='boolean')throw new Error('待办内容或完成状态无效。')
   seen.add(item.id);return {id:item.id,text:item.text.trim(),done:item.done}
  })
 }
 return result
}
export function loadTodos(){try{return validateTodos(JSON.parse(localStorage.getItem(TODO_KEY)||'{}'))}catch{return {}}}
