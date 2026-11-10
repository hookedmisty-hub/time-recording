import {validateTodos} from './todos.js'
import {parseBackup} from './backup.js'
import {validateDeliverables} from './deliverables.js'
import {defaultRewards,REWARD_START,COUPON_MIN_CENTS,couponCost,DEFAULT_REWARD_RULE} from './rewards.js'
const dateValid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(`${d}T00:00:00Z`))&&new Date(`${d}T00:00:00Z`).toISOString().slice(0,10)===d
const integerIn=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max
const ruleValid=r=>r&&['USD','CNY'].includes(r.currency)&&integerIn(r.rate,1,100000000)&&
 integerIn(r.coreBonus,0,100)&&integerIn(r.streakMax,0,100)&&integerIn(r.streakStep,0,r.streakMax)&&
 integerIn(r.couponMinimum,0,100000000)&&integerIn(r.couponPercent,1,100)
function validateRewardRules(rewards){
 const {rule,pending,settlement}=rewards
 if(rule!==undefined&&!ruleValid(rule))throw new Error('奖励规则无效。')
 if(pending!==undefined&&(!pending||!dateValid(pending.date)||pending.date<REWARD_START||
  !ruleValid(pending.rule)||pending.rule.currency!==(rule||DEFAULT_REWARD_RULE).currency))throw new Error('待生效的奖励规则无效。')
 if(settlement===undefined)return
 if(!settlement||!dateValid(settlement.through)||!integerIn(settlement.earned,0,Number.MAX_SAFE_INTEGER)||
  !integerIn(settlement.streak,0,100000)||!settlement.days||typeof settlement.days!=='object'||Array.isArray(settlement.days)||
  (pending&&settlement.through>=pending.date))throw new Error('已结算的奖励额度无效。')
 let total=0
 for(const [date,cents] of Object.entries(settlement.days)){
  if(!dateValid(date)||date<REWARD_START||date>settlement.through||!integerIn(cents,1,Number.MAX_SAFE_INTEGER))throw new Error('历史奖励明细无效。')
  total+=cents
 }
 if(total!==settlement.earned)throw new Error('历史奖励合计不符。')
}
export function parseBundle(text){
 let raw;try{raw=JSON.parse(text.replace(/^\uFEFF/,''))}catch{throw new Error('文件不是有效的 JSON。')}
 if(Array.isArray(raw))return {records:parseBackup(text).map(({deliverableId:_deliverableId,...record})=>record),settings:null,deliverables:[]}
 if(!raw||!['1.3','1.4'].includes(raw.version)||!Array.isArray(raw.records))throw new Error('请选择本应用导出的记录数组或完整 JSON 备份。')
 const records=parseBackup(JSON.stringify(raw.records)),goals=raw.goals||{},rewards=raw.rewards||defaultRewards()
 if(!goals||typeof goals!=='object'||Array.isArray(goals))throw new Error('每日目标格式无效。')
 for(const [date,g] of Object.entries(goals))if(!dateValid(date)||!g||typeof g.text!=='string'||g.text.length>160||!Number.isInteger(g.minutes)||g.minutes<=0||g.minutes>1440)throw new Error('备份中的每日目标无效。')
 if(!dateValid(rewards.startDate)||!Array.isArray(rewards.wishlist)||!Array.isArray(rewards.redemptions)||!Array.isArray(rewards.restDays))throw new Error('奖励设置无效。')
 validateRewardRules(rewards)
 for(const list of [rewards.wishlist,rewards.redemptions]){const seen=new Set();for(const item of list){if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id)||typeof item.name!=='string'||!item.name.trim()||!Number.isSafeInteger(item.cents)||item.cents<=0||item.cents>100000000)throw new Error('心愿或兑换记录无效。');seen.add(item.id)}}
 for(const item of rewards.wishlist){if(typeof item.url!=='string')throw new Error('心愿链接无效。');if(item.url){try{if(!['https:','http:'].includes(new URL(item.url).protocol))throw new Error()}catch{throw new Error('心愿链接无效。')}}}
 if(rewards.redemptions.some(x=>!dateValid(x.date)||typeof x.wishId!=='string')||rewards.restDays.some(d=>!dateValid(d)))throw new Error('奖励日期无效。')
 const couponYears=new Set()
 for(const entry of rewards.redemptions)if(entry.annualCouponYear!=null){if(entry.annualCouponYear!==entry.date.slice(0,4)||couponYears.has(entry.annualCouponYear)||!Number.isSafeInteger(entry.originalCents)||!integerIn(entry.couponMinimum??COUPON_MIN_CENTS,1,100000000)||entry.originalCents<(entry.couponMinimum??COUPON_MIN_CENTS)||entry.originalCents>100000000||!integerIn(entry.couponPercent??25,1,100)||entry.cents!==couponCost(entry.originalCents,entry.couponPercent??25))throw new Error('年度奖励券记录无效，同一年只能使用一次。');couponYears.add(entry.annualCouponYear)}
 const categories=raw.categories,projects=raw.projects
 for(const [list,type] of [[categories,'category'],[projects,'project']])if(list!==undefined){if(!Array.isArray(list)||!list.length||list.some(x=>!x||typeof x.id!=='string'||!x.id||typeof x.name!=='string'||!x.name.trim()||(type==='project'&&x.archived!==undefined&&typeof x.archived!=='boolean')||x.name.length>(type==='category'?40:60))||new Set(list.map(x=>x.id)).size!==list.length||new Set(list.map(x=>x.name)).size!==list.length)throw new Error('分类或项目设置无效。')}
 if(categories&&categories.some(c=>!/^#[0-9a-f]{6}$/i.test(c.color)||!['core','research','other'].includes(c.kind)))throw new Error('分类颜色或用途无效。')
 const deliverables=validateDeliverables(raw.deliverables===undefined?[]:raw.deliverables,projects||[])
 const projectNames=new Map((projects||[]).map(p=>[p.id,p.name]))
 const itemProjects=new Map(deliverables.map(item=>[item.id,projectNames.get(item.projectId)]))
 for(const record of records){
  if(record.deliverableId&&itemProjects.get(record.deliverableId)!==record.project)throw new Error('备份中有记录关联到不存在或不属于该项目的交付项。')
 }
 return {records,deliverables,settings:{goals,rewards,...(raw.todos!==undefined?{todos:validateTodos(raw.todos)}:{}),...(categories?{categories}:{}),...(projects?{projects}:{})}}
}
