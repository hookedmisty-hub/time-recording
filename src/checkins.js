export const emptyCheckins=()=>({items:[],events:[]})
export function validateCheckins(value){
 if(!value||!Array.isArray(value.items)||!Array.isArray(value.events))throw new Error('打卡数据无效。')
 const ids=new Set(),eventIds=new Set()
 for(const x of value.items){
  if(!x||typeof x.id!=='string'||!x.id||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||x.name.length>80||!/^#[0-9a-f]{6}$/i.test(x.color)||!['once','multiple'].includes(x.mode)||!Number.isInteger(x.target)||x.target<1||x.target>10000||(x.mode==='once'&&x.target>7)||typeof x.archived!=='boolean')throw new Error('打卡项目无效。')
  if(x.dailyLimit!=null&&(!Number.isInteger(x.dailyLimit)||x.dailyLimit<1||x.dailyLimit>10000))throw new Error('每日上限无效。')
  checkinRuleValid(x)
  if(x.rules!==undefined){if(!Array.isArray(x.rules)||x.rules.some((r,i)=>!r||!/^\d{4}-\d{2}-\d{2}$/.test(r.from)||!Number.isFinite(Date.parse(r.from))||(i>0&&r.from<=x.rules[i-1].from)))throw new Error('打卡规则历史无效。');x.rules.forEach(checkinRuleValid)}
  ids.add(x.id)
 }

 for(const e of value.events){
  if(!e||typeof e.id!=='string'||!e.id||eventIds.has(e.id)||!ids.has(e.itemId)||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||new Date(e.date+'T12:00:00Z').toISOString().slice(0,10)!==e.date||typeof e.createdAt!=='string'||!Number.isFinite(Date.parse(e.createdAt)))throw new Error('打卡记录无效。')
  eventIds.add(e.id)

 }
 return structuredClone(value)
}
export function weekBounds(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {start,end:d.toISOString().slice(0,10)}}
export function checkinCount(data,itemId,date,weekly=false){const {start,end}=weekBounds(date);return data.events.filter(e=>e.itemId===itemId&&(weekly?e.date>=start&&e.date<=end:e.date===date)).length}
export function addCheckin(data,itemId,date,today){const item=data.items.find(x=>x.id===itemId);if(!item||item.archived||date>today)throw new Error('无法为该项目或未来日期打卡。');if(item.mode==='once'&&checkinCount(data,itemId,date))return data;return validateCheckins({...data,events:[...data.events,{id:crypto.randomUUID(),itemId,date,createdAt:new Date().toISOString()}]})}
export function undoCheckin(data,itemId,date){const event=data.events.filter(e=>e.itemId===itemId&&e.date===date).at(-1);return event?{...data,events:data.events.filter(e=>e.id!==event.id)}:data}

export function setCheckinCount(data,itemId,date,count,today){
 const item=data.items.find(x=>x.id===itemId)
 if(!item||item.archived||date>today)throw new Error('无法为该项目或未来日期打卡。')
 if(!Number.isInteger(count)||count<0)throw new Error('请输入非负整数。')
 const rule=checkinRule(item,date),limit=checkinLimit(rule)
 const current=checkinCount(data,itemId,date)
 if(current>limit&&count===current)return data
 const nextCount=count>limit?0:count
 const existing=data.events.filter(e=>e.itemId===itemId&&e.date===date)
 const kept=existing.slice(0,nextCount)
 const added=Array.from({length:Math.max(0,nextCount-kept.length)},()=>({id:crypto.randomUUID(),itemId,date,createdAt:new Date().toISOString()}))
 return validateCheckins({...data,events:[...data.events.filter(e=>e.itemId!==itemId||e.date!==date),...kept,...added]})
}

export function checkinLimit(rule){return rule.mode==='once'?1:(rule.dailyLimit??rule.target)}
export function checkinRule(item,date){const week=weekBounds(date).start;return item.rules?.filter(r=>r.from<=week).at(-1)||item}
function checkinRuleValid(rule){
 if(!['once','multiple'].includes(rule.mode)||!Number.isInteger(rule.target)||rule.target<1||rule.target>10000||(rule.dailyLimit!=null&&(!Number.isInteger(rule.dailyLimit)||rule.dailyLimit<1||rule.dailyLimit>10000)))throw new Error('打卡目标设置无效。')
 if(rule.target>checkinLimit(rule)*7)throw new Error(`按每日上限，每周最多可完成 ${checkinLimit(rule)*7} 次，请调整每周目标或每日上限。`)
}
export function updateCheckinItem(data,item,today){
 checkinRuleValid(item)
 const old=data.items.find(x=>x.id===item.id),from=weekBounds(today).start
 const rule={from,mode:item.mode,target:item.target,dailyLimit:item.dailyLimit??null}
 const baseline=old?.rules?.length?old.rules:[{from:'0001-01-01',mode:old?.mode||item.mode,target:old?.target||item.target,dailyLimit:old?.dailyLimit??null}]
 const next={...item,rules:[...baseline.filter(r=>r.from<from),rule]}
 return validateCheckins({...data,items:old?data.items.map(x=>x.id===item.id?next:x):[...data.items,next]})
}
