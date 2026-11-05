export const CATEGORY_KEY='time-recording-categories-v1'
export const DEFAULT_CATEGORIES=['核心科研','辅助科研','工作事务','学习成长','生活事务','健康运动','娱乐社交','休息睡眠','未分类'].map((name,i)=>({id:name,name,color:['#a78bfa','#60a5fa','#fbbf24','#34d399','#fb923c','#2dd4bf','#f472b6','#94a3b8','#64748b'][i],kind:i===0?'core':i===1?'research':'other'}))
export function loadCategories(records){
  let categories=DEFAULT_CATEGORIES
  try{const saved=JSON.parse(localStorage.getItem(CATEGORY_KEY));if(Array.isArray(saved)&&saved.length&&saved.every(c=>typeof c.id==='string'&&typeof c.name==='string'&&c.name.trim()&&/^#[0-9a-f]{6}$/i.test(c.color))&&new Set(saved.map(c=>c.name)).size===saved.length)categories=saved}catch{/* use defaults */}
  return includeCategories(categories,records)
}
export function includeCategories(categories,records){
  const result=[...categories]
  for(const r of records)if(!result.some(c=>c.name===r.category))result.push({id:crypto.randomUUID(),name:r.category,color:r.categoryColor||'#64748b',kind:r.categoryKind||'other'})
  return result
}
export function splitHourly(gaps){
  return gaps.flatMap(g=>{const result=[];for(let start=g.start;start<g.end;){const end=Math.min(g.end,(Math.floor(start/60)+1)*60);result.push({start,end});start=end}return result})
}
export function migrateCategories(records,original,draft,replacements){
  return records.map(r=>{let id=original.find(c=>c.name===r.category)?.id;const seen=new Set();while(replacements[id]&&!seen.has(id)){seen.add(id);id=replacements[id]}const target=draft.find(c=>c.id===id);return target?{...r,category:target.name}:r})
}
