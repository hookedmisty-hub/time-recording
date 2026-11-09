export const CATEGORY_KEY='time-recording-categories-v1'
export const DEFAULT_CATEGORIES=[
  {id:'核心科研',name:'核心工作',color:'#a78bfa',kind:'core'},
  {id:'辅助科研',name:'辅助工作',color:'#60a5fa',kind:'research'},
  ...[['学习成长','#34d399'],['生活事务','#fb923c'],['健康运动','#2dd4bf'],['娱乐社交','#f472b6'],['休息睡眠','#94a3b8'],['未分类','#64748b']].map(([name,color])=>({id:name,name,color,kind:'other'})),
]
export const isUncategorized=category=>category.id==='未分类'||category.name.trim()==='未分类'
export function keepUncategorizedLast(categories){
  return [...categories.filter(c=>!isUncategorized(c)),...categories.filter(isUncategorized)]
}
export const isWorkRole=kind=>kind==='core'||kind==='research'
export function workCategory(categories,kind){
  return categories.find(c=>c.kind===kind)||DEFAULT_CATEGORIES.find(c=>c.kind===kind)
}
export function loadCategories(records){
  let categories=DEFAULT_CATEGORIES
  try{const saved=JSON.parse(localStorage.getItem(CATEGORY_KEY));if(Array.isArray(saved)&&saved.length&&saved.every(c=>typeof c.id==='string'&&typeof c.name==='string'&&c.name.trim()&&/^#[0-9a-f]{6}$/i.test(c.color))&&new Set(saved.map(c=>c.name)).size===saved.length)categories=saved}catch{/* use defaults */}
  return includeCategories(categories,records)
}
export function includeCategories(categories,records){
  const result=[...categories]
  for(const r of records)if(!result.some(c=>c.name===r.category))result.push({id:crypto.randomUUID(),name:r.category,color:r.categoryColor||'#64748b',kind:r.categoryKind||(r.category==='核心科研'?'core':r.category==='辅助科研'?'research':'other')})
  for(const kind of ['core','research']){
    if(result.some(c=>c.kind===kind))continue
    const fallback=workCategory([],kind)
    const existing=result.find(c=>c.name===fallback.name)
    if(existing)result[result.indexOf(existing)]={...existing,kind}
    else result.push({...fallback,id:result.some(c=>c.id===fallback.id)?crypto.randomUUID():fallback.id})
  }
  return keepUncategorizedLast(result)
}
export function splitHourly(gaps){
  return gaps.flatMap(g=>{const result=[];for(let start=g.start;start<g.end;){const end=Math.min(g.end,(Math.floor(start/60)+1)*60);result.push({start,end});start=end}return result})
}
export function migrateCategories(records,original,draft,replacements){
  return records.map(r=>{let id=original.find(c=>c.name===r.category)?.id;const seen=new Set();while(replacements[id]&&!seen.has(id)){seen.add(id);id=replacements[id]}const target=draft.find(c=>c.id===id);return target?{...r,category:target.name}:r})
}
