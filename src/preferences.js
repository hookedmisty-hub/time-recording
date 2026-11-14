export const PREFERENCES_KEY='time-recording-preferences-v1'
export const DEFAULT_SUBTITLE='把每一天，变成可以回顾的生活。'
export function validatePreferences(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.subtitle!=='string'||!value.subtitle.trim()||value.subtitle.length>160)throw new Error('自定义副标题无效，请输入 1–160 个字符。')
 return {subtitle:value.subtitle.trim()}
}
export function loadPreferences(){try{return validatePreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY)))}catch{return {subtitle:DEFAULT_SUBTITLE}}}
