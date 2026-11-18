import {researchAllocation} from './research.js'
const DAY=1440
const dayStart=date=>Date.parse(`${date}T00:00:00Z`)/60000
const clock=text=>Number(text.slice(0,2))*60+Number(text.slice(3))
export function routineClock(value){
 const minute=((Math.round(value)%DAY)+DAY)%DAY
 return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`
}
export function routineTimeLabel(value){
 const offset=Math.floor(value/DAY)
 return `${offset<0?(offset===-1?'前日':`前${-offset}日`):offset>0?(offset===1?'次日':`后${offset}日`):''}${routineClock(value)}`
}
export function sleepTimeLabel(value){
 const minute=((Math.round(value)%DAY)+DAY)%DAY
 const hour=Math.floor(minute/60)
 return `${hour%12||12}:${String(minute%60).padStart(2,'0')} ${hour>=12?'PM':'AM'}`
}
export function sleepSeries(records,categories,days,ids,mode='longest'){
 const names=new Set(categories.filter(c=>ids.includes(c.id)).map(c=>c.name))
 const intervals=records.filter(r=>names.has(r.category)).map(r=>{
  const start=dayStart(r.date)+clock(r.start),end=dayStart(r.date)+clock(r.end)+(r.end<r.start?DAY:0)
  return {start,end}
 }).filter(x=>Number.isFinite(x.start)&&x.end>x.start).sort((a,b)=>a.start-b.start)
 const blocks=[]
 for(const interval of intervals){
  const last=blocks.at(-1)
  if(last&&interval.start<=last.end)last.end=Math.max(last.end,interval.end)
  else blocks.push({...interval})
 }
 return days.map(date=>{
  const start=dayStart(date),candidates=blocks.filter(b=>b.end>=start&&b.end<start+DAY)
  if(!candidates.length)return {date,bedtime:null,wake:null}
  const block=mode==='all'?{start:Math.min(...candidates.map(b=>b.start)),end:Math.max(...candidates.map(b=>b.end))}:candidates.reduce((best,b)=>b.end-b.start>best.end-best.start?b:best)
  return {date,bedtime:block.start-start,wake:block.end-start}
 })
}
export function workStartSeries(records,categories,days,businessIds){
 const kinds=new Map(categories.map(c=>[c.name,c.kind]))
 const business=new Set(categories.filter(c=>businessIds.includes(c.id)).map(c=>c.name))
 return days.map(date=>{
  const own=records.filter(r=>r.date===date)
  const first=list=>list.length?Math.min(...list.map(r=>clock(r.start))):null
  return {date,core:first(own.filter(r=>kinds.get(r.category)==='core'&&researchAllocation(r,'core').core>0)),business:first(own.filter(r=>business.has(r.category)))}
 })
}
export function defaultRoutineCategories(categories,type){
 const stable=type==='sleep'?['休息睡眠']:['工作事务']
 const found=categories.filter(c=>stable.includes(c.id))
 if(found.length)return found.map(c=>c.id)
 return categories.filter(c=>type==='sleep'?/睡眠|睡觉|sleep/i.test(c.name):/工作事务/.test(c.name)).map(c=>c.id)
}

export function categoryStartSeries(records,categories,days,ids){
 const selected=categories.filter(c=>ids.includes(c.id))
 return days.map(date=>{
  const row={date}
  for(const c of selected){
   const starts=records.filter(r=>r.date===date&&r.category===c.name&&(c.kind!=='core'||researchAllocation(r,'core').core>0)).filter(r=>{
    if(r.start!=='00:00')return true
    const midnight=dayStart(date)
    return !records.some(previous=>previous!==r&&previous.category===r.category&&previous.project===r.project&&previous.title===r.title&&dayStart(previous.date)<midnight&&dayStart(previous.date)+clock(previous.end)+(previous.end<previous.start?DAY:0)>=midnight)
   }).map(r=>clock(r.start))
   row[c.id]=starts.length?Math.min(...starts):null
  }
  return row
 })
}
