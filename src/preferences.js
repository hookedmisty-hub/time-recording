import {validatePlans} from './plans.js'
import {validateCheckins} from './checkins.js'
export const PREFERENCES_KEY='time-recording-preferences-v1'
export const DEFAULT_SUBTITLE='把每一天，变成可以回顾的生活。'
export function validatePreferences(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.subtitle!=='string'||!value.subtitle.trim()||value.subtitle.length>160)throw new Error('自定义副标题无效，请输入 1–160 个字符。')
 const routine=value.routine
 if(routine!==undefined){
  if(!routine||typeof routine!=='object'||Array.isArray(routine)||Object.keys(routine).some(k=>!['sleepCategoryIds','businessCategoryIds','sleepMode'].includes(k)))throw new Error('作息统计设置无效。')
  for(const key of ['sleepCategoryIds','businessCategoryIds'])if(routine[key]!==undefined&&(!Array.isArray(routine[key])||routine[key].length>100||routine[key].some(id=>typeof id!=='string'||!id||id.length>200)||new Set(routine[key]).size!==routine[key].length))throw new Error('统计分类无效。')
  if(routine.sleepMode!==undefined&&!['longest','all'].includes(routine.sleepMode))throw new Error('睡眠统计方式无效。')
 }
 return {subtitle:value.subtitle.trim(),...(value.plans!==undefined?{plans:validatePlans(value.plans)}:{}),...(value.checkins!==undefined?{checkins:validateCheckins(value.checkins)}:{}),...(routine!==undefined?{routine:structuredClone(routine)}:{})}
}
export function loadPreferences(){try{return validatePreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY)))}catch{return {subtitle:DEFAULT_SUBTITLE}}}
