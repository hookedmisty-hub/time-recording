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
export const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
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
export function calculateRewards(records,categories,goals,state,today){
 const details=dailyResearchDetails(records,categories),totals=Object.fromEntries(Object.entries(details).map(([date,d])=>[date,d.minutes])),rest=new Set(state.restDays),days=[]
 let streak=0,earned=0,todayBonus=0
 for(let date=state.startDate;date<=today;date=shiftDay(date,1)){
  const minutes=totals[date]||0,target=effectiveGoal(goals[date]),restDay=rest.has(date),met=!restDay&&target>0&&minutes>=target
  let bonus=0
  if(met){streak++;bonus=Math.min(5,streak-1)}else if(!restDay&&date<today)streak=0
  const coreMinutes=details[date]?.coreMinutes||0
  const cents=Math.round((minutes+coreMinutes*CORE_BONUS_PERCENT/100)*RATE_CENTS*(100+bonus)/6000)
  earned+=cents;if(date===today)todayBonus=bonus
  days.push({date,minutes,coreMinutes,target:target||0,restDay,met,bonus,cents,streak})
 }
 const spent=state.redemptions.reduce((s,r)=>s+r.cents,0),weekday=(new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7,weekStart=shiftDay(today,-weekday)
 let weekMinutes=0;for(let date=weekStart;date<=today;date=shiftDay(date,1))weekMinutes+=totals[date]||0
 return {earned,spent,balance:Math.max(0,earned-spent),overdrawn:Math.max(0,spent-earned),streak,todayBonus,weekMinutes,days,totals}
}

export const COUPON_MIN_CENTS=100000
export const couponCost=cents=>Math.round(cents/4)
export function annualCouponAvailable(state,today){return !state.redemptions.some(r=>r.annualCouponYear===today.slice(0,4))}
export function makeRedemption(item,state,today,useCoupon,balance,id){
 if(!item||!state.wishlist.some(w=>w.id===item.id))throw new Error('心愿已改变，请重新选择。')
 if(useCoupon&&(item.cents<COUPON_MIN_CENTS||!annualCouponAvailable(state,today)))throw new Error('年度券不可用：每年一次，且物品标价须至少 $1,000。')
 const cents=useCoupon?couponCost(item.cents):item.cents
 if(balance<cents)throw new Error('余额不足。')
 return {id,wishId:item.id,name:item.name,cents,originalCents:item.cents,date:today,...(useCoupon?{annualCouponYear:today.slice(0,4)}:{})}
}
