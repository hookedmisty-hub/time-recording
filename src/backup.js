import {recordMinutes} from './research.js'
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/
export function parseBackup(text) {
  let data
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw new Error('文件不是有效的 JSON。') }
  if (!Array.isArray(data)) throw new Error('备份必须是记录数组，请选择本应用导出的 JSON 文件。')
  return data.map((r, i) => {
    const fail = message => { throw new Error(`第 ${i + 1} 条记录：${message}`) }
    if (!r || typeof r !== 'object' || Array.isArray(r)) fail('必须是记录对象。')
    if (typeof r.id !== 'string' || !r.id.trim()) fail('缺少有效的记录 ID。')
    if (typeof r.title !== 'string' || !r.title.trim()) fail('活动名称不能为空。')
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(`${r.date}T00:00:00Z`)) || new Date(`${r.date}T00:00:00Z`).toISOString().slice(0,10) !== r.date) fail('日期无效。')
    if (typeof r.start !== 'string' || !TIME.test(r.start)) fail('开始时间无效。')
    if (typeof r.end !== 'string' || (!TIME.test(r.end) && r.end !== '24:00') || r.start === r.end) fail('结束时间无效或与开始时间相同。')
    if (typeof r.category !== 'string' || !r.category.trim() || r.category.length>40) fail('分类无效。')
    if (r.categoryColor != null && (typeof r.categoryColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(r.categoryColor))) fail('分类颜色无效。')
    if (r.categoryKind != null && !['core','research','other'].includes(r.categoryKind)) fail('分类用途无效。')
    if (r.project != null && typeof r.project !== 'string') fail('研究项目必须是文本。')
    if (r.coreMinutes != null && (!Number.isInteger(r.coreMinutes)||r.coreMinutes<0||r.coreMinutes>recordMinutes(r))) fail('核心科研分钟数必须是 0 到活动总分钟数之间的整数。')
    if (r.note != null && typeof r.note !== 'string') fail('备注必须是文本。')
    return {id:r.id,title:r.title,date:r.date,start:r.start,end:r.end,category:r.category,project:r.project ?? '',note:r.note ?? '',...(r.coreMinutes!=null?{coreMinutes:r.coreMinutes}:{}),...(r.categoryColor?{categoryColor:r.categoryColor}:{}),...(r.categoryKind?{categoryKind:r.categoryKind}:{})}
  })
}
const interval = r => {
  const mins = t => Number(t.slice(0,2))*60+Number(t.slice(3))
  const base = Date.parse(`${r.date}T00:00:00`)/60000
  return [base+mins(r.start),base+mins(r.end)+(r.end<r.start?1440:0)]
}
const sameRecord = (a,b) => ['title','date','start','end','category','project','note','coreMinutes'].every(key=>(a[key]??'')===(b[key]??''))
export function planImport(existing, incoming, choices={}) {
  const current = new Map(existing.map(r=>[r.id,r])), seen = new Set(), additions=[], conflicts=[], updates=[]
  let duplicates=0, fileDuplicates=0
  for (const r of incoming) {
    if(seen.has(r.id)){fileDuplicates++;continue}
    seen.add(r.id)
    const old=current.get(r.id)
    if(!old){additions.push(r);continue}
    if(sameRecord(old,r)){duplicates++;continue}
    conflicts.push({current:old,incoming:r})
    if(choices[r.id]==='incoming')updates.push(r)
  }
  const replacements=new Map(updates.map(r=>[r.id,r]))
  const merged=[...existing.map(r=>replacements.get(r.id)||r),...additions]
  const starts=merged.map(interval).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)).sort((a,b)=>a[0]-b[0])
  let overlaps=false,end=-Infinity
  for(const [a,b] of starts){if(a<end)overlaps=true;end=Math.max(end,b)}
  return {additions,duplicates,fileDuplicates,conflicts,updates,merged,overlaps}
}
