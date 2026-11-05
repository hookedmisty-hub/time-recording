import {shiftDay} from './rewards.js'
export function recordedDates(records){const days=new Set();for(const r of records){if(!r.date||r.start===r.end)continue;days.add(r.date);if(r.end<r.start&&r.end!=='00:00')days.add(shiftDay(r.date,1))}return days}
export function monthCells(month){const first=`${month}-01`,weekday=new Date(`${first}T12:00:00Z`).getUTCDay();return Array.from({length:42},(_,i)=>shiftDay(first,i-weekday))}

export const researchShade=minutes=>minutes<180?'research-light':minutes<=480?'research-medium':'research-dark'
