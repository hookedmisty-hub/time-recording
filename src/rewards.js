import {researchAllocation} from './research.js'
export const REWARD_KEY='time-recording-rewards-v1'
export const GOAL_KEY='time-recording-goals-v1'
export const REWARD_START='2026-10-29'
export const RATE_CENTS=80
export const CORE_BONUS_PERCENT=10
export const MIN_GOAL_MINUTES=300
export const effectiveGoal=goal=>Math.max(MIN_GOAL_MINUTES,Number.isFinite(goal?.minutes)?goal.minutes:MIN_GOAL_MINUTES)
export const WEEKLY_MINUTES=35*60
export const shiftDay=(day,n)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export const money=(cents,currency='USD')=>new Intl.NumberFormat(currency==='CNY'?'zh-CN':'en-US',{style:'currency',currency}).format(cents/100)
export const defaultRewards=()=>({startDate:REWARD_START,wishlist:[],redemptions:[],restDays:[]})
export function loadJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}}
const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3))
export function dailyResearchDetails(records,categories){
 const kinds=new Map(categories.map(c=>[c.name,c.kind])),intervals=new Map()
 for(const r of records){const kind=kinds.get(r.category);if(!['core','research'].includes(kind))continue;const start=minute(r.start);let end=minute(r.end);if(end<start)end+=1440;if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue
  for(let offset=0;offset<2;offset++){const absoluteStart=Math.max(start,offset*1440),a=absoluteStart-offset*1440,b=Math.min(end,(offset+1)*1440)-offset*1440;if(b<=a)continue;const date=shiftDay(r.date,offset),core=researchAllocation(r,kind,absoluteStart-start,b-a).core;if(!intervals.has(date))intervals.set(date,[]);intervals.get(date).push({a,b,ratio:core/(b-a)})}
 }
 const totals={}
 for(const [date,parts] of intervals){
  const points=[...new Set(parts.flatMap(p=>[p.a,p.b]))].sort((a,b)=>a-b);let minutes=0,coreMinutes=0
  // Overlaps count once; use the highest core share in each covered interval.
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],active=parts.filter(p=>p.a<=a&&p.b>=b);if(!active.length)continue;minutes+=b-a;coreMinutes+=(b-a)*Math.max(...active.map(p=>p.ratio))}
  totals[date]={minutes,coreMinutes}
 }
 return totals
}
export function dailyResearch(records,categories){return Object.fromEntries(Object.entries(dailyResearchDetails(records,categories)).map(([date,d])=>[date,d.minutes]))}
export const hasRewardRules=state=>Boolean(state.rule||state.pending||state.settlement||state.wishlist.length||state.redemptions.length)
export function calculateRewards(records,categories,goals,state,today){
 const details=dailyResearchDetails(records,categories),totals=Object.fromEntries(Object.entries(details).map(([date,d])=>[date,d.minutes])),rest=new Set(state.restDays),days=[]
 let streak=0,earned=state.settlement?.earned||0,todayBonus=0
 const settlement=state.settlement
 const configured=hasRewardRules(state)
 const hasSettledRewards=(settlement?.earned||0)>0
 const firstDay=records.length||hasSettledRewards?state.startDate:today
 for(let date=firstDay;date<=today;date=shiftDay(date,1)){
  const minutes=totals[date]||0,target=effectiveGoal(goals[date]),restDay=rest.has(date),met=!restDay&&target>0&&minutes>=target
  const rule=rewardRule(state,date)
  let bonus=0
  if(met){streak++;bonus=Math.min(rule.streakMax,(streak-1)*rule.streakStep)}else if(!restDay&&date<today)streak=0
  const coreMinutes=details[date]?.coreMinutes||0
  const settled=settlement&&date<=settlement.through
  const cents=!configured?0:settled?(settlement.days[date]||0):Math.round((minutes+coreMinutes*rule.coreBonus/100)*rule.rate*(100+bonus)/6000)
  if(!settled)earned+=cents
  if(date===today)todayBonus=bonus
  days.push({date,minutes,coreMinutes,target:target||0,restDay,met,bonus,cents,streak})
 }
 const spent=state.redemptions.reduce((s,r)=>s+r.cents,0),weekday=(new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7,weekStart=shiftDay(today,-weekday)
 let weekMinutes=0;for(let date=weekStart;date<=today;date=shiftDay(date,1))weekMinutes+=totals[date]||0
 return {earned,spent,balance:Math.max(0,earned-spent),overdrawn:Math.max(0,spent-earned),streak,todayBonus,weekMinutes,days:configured?days:[],totals}
}

export const COUPON_MIN_CENTS=100000
export const DEFAULT_REWARD_RULE={currency:'USD',rate:RATE_CENTS,coreBonus:CORE_BONUS_PERCENT,streakStep:1,streakMax:5,couponMinimum:COUPON_MIN_CENTS,couponPercent:25}
export function rewardRule(state,date){
 return state.pending?.date<=date?state.pending.rule:state.rule||DEFAULT_REWARD_RULE
}
export const couponCost=(cents,percent=25)=>Math.max(1,Math.round(cents*percent/100))
export const canChangeCurrency=(state,summary)=>!state.rule&&!state.pending&&!summary.earned&&!state.wishlist.length&&!state.redemptions.length
export function settlePending(state,summary,today){
 if(!state.pending||state.pending.date>today)return state
 const {pending,...rest}=state
 const through=shiftDay(pending.date,-1)
 return {...rest,rule:pending.rule,settlement:settlementThrough(state,summary,through)}
}
function settlementThrough(state,summary,through){
 const old=state.settlement
 const days={...old?.days}
 let earned=old?.earned||0
 for(const day of summary.days){
  if(day.date>through||day.date<=(old?.through||''))continue
  if(day.cents)days[day.date]=day.cents
  earned+=day.cents
 }
 return {through,earned,days,streak:summary.days.find(d=>d.date===through)?.streak||0}
}
export function scheduleRewardRule(state,summary,today,rule){
 if(!hasRewardRules(state))return {...state,startDate:today,rule}
 if(rule.currency!==rewardRule(state,today).currency&&!canChangeCurrency(state,summary))throw new Error('当前币种已锁定。')
 const current=settlePending(state,summary,today)
 return {...current,settlement:settlementThrough(current,summary,shiftDay(today,-1)),pending:{date:shiftDay(today,1),rule}}
}

export function annualCouponAvailable(state,today){return !state.redemptions.some(r=>r.annualCouponYear===today.slice(0,4))}
export function makeRedemption(item,state,today,useCoupon,balance,id){
 if(!item||!state.wishlist.some(w=>w.id===item.id))throw new Error('心愿已改变，请重新选择。')
 const rule=rewardRule(state,today)
 if(useCoupon&&(!rule.couponMinimum||item.cents<rule.couponMinimum||!annualCouponAvailable(state,today)))throw new Error('此心愿当前无法使用年度奖励券。')
 const cents=useCoupon?couponCost(item.cents,rule.couponPercent):item.cents
 if(balance<cents)throw new Error('余额不足。')
 return {id,wishId:item.id,name:item.name,cents,originalCents:item.cents,date:today,...(useCoupon?{annualCouponYear:today.slice(0,4),couponPercent:rule.couponPercent,couponMinimum:rule.couponMinimum}:{})}
}
