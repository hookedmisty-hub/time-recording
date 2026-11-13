export const clockMinutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3))
export const recordMinutes=r=>clockMinutes(r.end)-clockMinutes(r.start)+(r.end<r.start?1440:0)
// Cumulative rounding keeps all date slices equal to the original integer total.
export function researchAllocation(record,type,offset=0,length=recordMinutes(record)){
 if(!['core','research'].includes(type))return {core:0,research:0}
 const total=recordMinutes(record)
 if(!(total>0))return {core:0,research:0}
 const core=type==='research'?0:Number.isInteger(record.coreMinutes)?Math.min(total,Math.max(0,record.coreMinutes)):total
 const allocated=Math.round((offset+length)*core/total)-Math.round(offset*core/total)
 return {core:allocated,research:length-allocated}
}
