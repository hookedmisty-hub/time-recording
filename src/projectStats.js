import {researchAllocation} from './research.js'
const DAY=1440
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3))
export function summarizeProjects(records,categories,projects,{start,end,kind='all'}={}){
 const kinds=new Map(categories.map(c=>[c.name,c.kind]))
 const totals=new Map(projects.map(p=>[p.name,{name:p.name,core:0,research:0,total:0}]))
 const lower=start?Date.parse(`${start}T00:00:00Z`)/60000:-Infinity
 const upper=end?Date.parse(`${end}T00:00:00Z`)/60000+DAY:Infinity
 for(const r of records){
  const type=kinds.get(r.category)
  if(!['core','research'].includes(type))continue
  const base=Date.parse(`${r.date}T00:00:00Z`)/60000
  const a=base+minutes(r.start),b=base+minutes(r.end)+(r.end<r.start?DAY:0)
  const amount=Math.max(0,Math.min(b,upper)-Math.max(a,lower))
  if(!Number.isFinite(amount)||!amount)continue
  const name=r.project||'未指定项目'
  if(!totals.has(name))totals.set(name,{name,core:0,research:0,total:0})
  const allocation=researchAllocation(r,type,Math.max(a,lower)-a,amount)
  const row=totals.get(name);const core=kind==='research'?0:allocation.core,aux=kind==='core'?0:allocation.research;row.core+=core;row.research+=aux;row.total+=core+aux
 }
 return [...totals.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name))
}
