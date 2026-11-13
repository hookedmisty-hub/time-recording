import {canonical} from './cloudMigration.js'
import {parseBundle} from './backupBundle.js'

export const same = (a,b) => canonical(a) === canonical(b)
export const clone = value => structuredClone(value)
export function directionPlan(base,local,remote,mode,choices={}){
 if(mode==='upload')return {journal:validateJournal(local),conflicts:[],error:null}
 if(mode==='restore')return remote?{journal:validateJournal(remote),conflicts:[],error:null}:{journal:null,conflicts:[],error:'云端还没有账本。'}
 return remote?mergeJournal(base,local,remote,choices):{journal:validateJournal(local),conflicts:[],error:null}
}

export function validateJournal(value) {
  if (!value || ['records','categories','projects','deliverables'].some(k=>!Array.isArray(value[k])) ||
    !value.goals || !value.todos || !value.rewards) throw new Error('同步数据不完整。')
  parseBundle(JSON.stringify({...value,version:'1.4'}))
  if (new Set(value.records.map(r=>r.id)).size!==value.records.length) throw new Error('记录 ID 重复。')
  for (const kind of ['core','research']) if(!value.categories.some(c=>c.kind===kind)) throw new Error('缺少核心或辅助用途分类。')
  if (!value.categories.some(c=>c.id==='未分类') || !value.projects.some(p=>p.id==='未分类')) throw new Error('缺少未分类。')
  for (const r of value.records) {
    if (!value.categories.some(c=>c.name===r.category) || (r.project&&!value.projects.some(p=>p.name===r.project)))
      throw new Error('记录关联的分类或项目不存在，请处理相关冲突。')
  }
  return clone(value)
}

// Catalogs and rewards are merged as units: renaming/deleting a catalog also changes
// record references, and a reward settlement must never be merged field by field.
export function journalEntities(s) {
  const out = new Map()
  for (const field of ['records','deliverables']) for (const item of s[field]) out.set(`${field}/${item.id}`,item)
  for (const field of ['goals','todos']) for (const [id,item] of Object.entries(s[field])) out.set(`${field}/${id}`,item)
  for (const field of ['categories','projects','rewards']) out.set(field,s[field])
  return out
}

export function mergeJournal(base,local,remote,choices={}) {
  const b=base?journalEntities(base):new Map(), l=journalEntities(local), r=journalEntities(remote)
  const result=new Map(),conflicts=[]
  for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])) {
    const bv=b.get(id),lv=l.get(id),rv=r.get(id)
    let chosen
    if(same(lv,rv)) chosen=lv
    else if(base&&same(lv,bv)) chosen=rv
    else if(base&&same(rv,bv)) chosen=lv
    else if(!base&&!l.has(id)) chosen=rv
    else if(!base&&!r.has(id)) chosen=lv
    else if(choices[id]==='local') chosen=lv
    else if(choices[id]==='remote') chosen=rv
    else {conflicts.push({id,local:lv,remote:rv});continue}
    if(chosen!==undefined)result.set(id,chosen)
  }
  if(conflicts.length)return {conflicts,journal:null,error:null}
  const journal={records:[],deliverables:[],goals:{},todos:{}}
  for(const [id,item] of result) {
    const slash=id.indexOf('/')
    if(slash<0)journal[id]=clone(item)
    else {const field=id.slice(0,slash),key=id.slice(slash+1);if(Array.isArray(journal[field]))journal[field].push(clone(item));else journal[field][key]=clone(item)}
  }
  // Record ordering carries no meaning. This also keeps clients stable after merging.
  journal.records.sort((a,b)=>a.id.localeCompare(b.id))
  journal.deliverables.sort((a,b)=>a.id.localeCompare(b.id))
  try{return {conflicts:[],journal:validateJournal(journal),error:null}}
  catch(error){return {conflicts:[],journal:null,error:error.message}}
}

export function legacyJournal(rows) {
  if(!rows.length)return null
  const active=rows.filter(r=>!r.deleted)
  const list=type=>active.filter(r=>r.entity_type===type).map(r=>r.payload)
  const ordered=type=>{
    const values=list(type),order=active.find(r=>r.entity_type==='order'&&r.entity_id===`${type}s`)?.payload||[]
    return values.sort((a,b)=>(order.indexOf(a.id)<0?Infinity:order.indexOf(a.id))-(order.indexOf(b.id)<0?Infinity:order.indexOf(b.id)))
  }
  return validateJournal({records:list('record'),categories:ordered('category'),projects:ordered('project'),deliverables:list('deliverable'),
    goals:Object.fromEntries(active.filter(r=>r.entity_type==='goal').map(r=>[r.entity_id,r.payload])),
    todos:Object.fromEntries(active.filter(r=>r.entity_type==='todo').map(r=>[r.entity_id,r.payload])),rewards:active.find(r=>r.entity_type==='rewards')?.payload})
}

export const summary = s => `${s.records.length} 条记录 · ${s.categories.length} 个分类 · ${s.projects.length} 个项目 · ${s.deliverables.length} 个交付任务 · ${Object.keys(s.goals).length} 天目标 · ${Object.values(s.todos).reduce((n,a)=>n+a.length,0)} 条待办 · ${s.rewards.wishlist.length} 个心愿`
