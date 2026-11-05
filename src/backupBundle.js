import {validateTodos} from './todos.js'
import {parseBackup} from './backup.js'
import {defaultRewards,REWARD_START,COUPON_MIN_CENTS,couponCost} from './rewards.js'
const dateValid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(`${d}T00:00:00Z`))&&new Date(`${d}T00:00:00Z`).toISOString().slice(0,10)===d
export function parseBundle(text){
 let raw;try{raw=JSON.parse(text.replace(/^\uFEFF/,''))}catch{throw new Error('文件不是有效的 JSON。')}
 if(Array.isArray(raw))return {records:parseBackup(text),settings:null}
 if(!raw||raw.version!=='1.3'||!Array.isArray(raw.records))throw new Error('请选择本应用导出的记录数组或 v1.3 完整备份。')
 const records=parseBackup(JSON.stringify(raw.records)),goals=raw.goals||{},rewards=raw.rewards||defaultRewards()
 if(!goals||typeof goals!=='object'||Array.isArray(goals))throw new Error('每日目标格式无效。')
 for(const [date,g] of Object.entries(goals))if(!dateValid(date)||!g||typeof g.text!=='string'||g.text.length>160||!Number.isInteger(g.minutes)||g.minutes<=0||g.minutes>1440)throw new Error('备份中的每日目标无效。')
 if(rewards.startDate!==REWARD_START||!Array.isArray(rewards.wishlist)||!Array.isArray(rewards.redemptions)||!Array.isArray(rewards.restDays))throw new Error('奖励设置无效。')
 for(const list of [rewards.wishlist,rewards.redemptions]){const seen=new Set();for(const item of list){if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id)||typeof item.name!=='string'||!item.name.trim()||!Number.isSafeInteger(item.cents)||item.cents<=0||item.cents>100000000)throw new Error('心愿或兑换记录无效。');seen.add(item.id)}}
 for(const item of rewards.wishlist){if(typeof item.url!=='string')throw new Error('心愿链接无效。');if(item.url){try{if(!['https:','http:'].includes(new URL(item.url).protocol))throw new Error()}catch{throw new Error('心愿链接无效。')}}}
 if(rewards.redemptions.some(x=>!dateValid(x.date)||typeof x.wishId!=='string')||rewards.restDays.some(d=>!dateValid(d)))throw new Error('奖励日期无效。')
 const couponYears=new Set()
 for(const entry of rewards.redemptions)if(entry.annualCouponYear!=null){if(entry.annualCouponYear!==entry.date.slice(0,4)||couponYears.has(entry.annualCouponYear)||!Number.isSafeInteger(entry.originalCents)||entry.originalCents<COUPON_MIN_CENTS||entry.originalCents>100000000||entry.cents!==couponCost(entry.originalCents))throw new Error('年度奖励券记录无效，同一年只能使用一次。');couponYears.add(entry.annualCouponYear)}
 const categories=raw.categories,projects=raw.projects
 for(const [list,type] of [[categories,'category'],[projects,'project']])if(list!==undefined){if(!Array.isArray(list)||!list.length||list.some(x=>!x||typeof x.id!=='string'||!x.id||typeof x.name!=='string'||!x.name.trim()||x.name.length>(type==='category'?40:60))||new Set(list.map(x=>x.id)).size!==list.length||new Set(list.map(x=>x.name)).size!==list.length)throw new Error('分类或科研项目设置无效。')}
 if(categories&&categories.some(c=>!/^#[0-9a-f]{6}$/i.test(c.color)||!['core','research','other'].includes(c.kind)))throw new Error('分类颜色或用途无效。')
 return {records,settings:{goals,rewards,...(raw.todos!==undefined?{todos:validateTodos(raw.todos)}:{}),...(categories?{categories}:{}),...(projects?{projects}:{})}}
}
