import {workCategory} from './categories.js'
export function trendDays(date,period){
 const anchor=new Date(`${date}T12:00:00`)
 const dateText=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
 const count=period==='month'?new Date(anchor.getFullYear(),anchor.getMonth()+1,0).getDate():7
 return Array.from({length:count},(_,i)=>{
  const d=new Date(anchor)
  d.setDate(period==='month'?i+1:anchor.getDate()-6+i)
  return dateText(d)
 })
}
export function categoryTrendTotals(segments,categories){
 const result=Object.fromEntries(categories.map(c=>[c.id,0]))
 const auxiliary=workCategory(categories,'research')
 for(const record of segments){
  const category=categories.find(c=>c.name===record.category)
  if(!category)continue
  if(category.kind==='core'){
   result[category.id]+=record.segmentCore
   if(auxiliary)result[auxiliary.id]=(result[auxiliary.id]||0)+record.segmentAuxiliary
  }else result[category.id]+=category.kind==='research'?record.segmentAuxiliary:record.segmentMinutes
 }
 return result
}
