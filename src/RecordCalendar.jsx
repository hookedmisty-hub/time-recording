import {useState,useRef,useEffect,useMemo} from 'react'
import {CalendarDays} from 'lucide-react'
import {monthCells,researchShade} from './calendar.js'
import {dailyResearch} from './rewards.js'
export default function RecordCalendar({date,onChange,records,categories}){
 const [open,setOpen]=useState(false),[month,setMonth]=useState(date.slice(0,7));const root=useRef(null),trigger=useRef(null),totals=useMemo(()=>dailyResearch(records,categories),[records,categories])
 useEffect(()=>{if(!open)return;const close=e=>{if(!root.current?.contains(e.target))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open])
 const move=n=>{const d=new Date(`${month}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);setMonth(d.toISOString().slice(0,7))}
 const select=d=>{onChange(d);setOpen(false);trigger.current?.focus()}
 return <div className="record-calendar" ref={root} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}}}><button ref={trigger} className="date-input" aria-label={`选择日期：${date}`} aria-expanded={open} aria-haspopup="dialog" onClick={()=>{setMonth(date.slice(0,7));setOpen(!open)}}>{date}<CalendarDays size={18}/></button>{open&&<section className="calendar-panel" role="dialog" aria-label="记录日期日历"><div className="calendar-heading"><button className="secondary" aria-label="上个月" onClick={()=>move(-1)}>‹</button><label>月份<input aria-label="日历月份" type="month" value={month} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setMonth(e.target.value)}}/></label><button className="secondary" aria-label="下个月" onClick={()=>move(1)}>›</button></div><div className="calendar-days">{['日','一','二','三','四','五','六'].map(x=><span key={x}>{x}</span>)}{monthCells(month).map(d=><button key={d} className={`${d.slice(0,7)!==month?'outside-month ':''}${(totals[d]||0)>0?`has-records ${researchShade(totals[d]||0)} `:''}${d===date?'selected-day':''}`} aria-label={`${d}，${(totals[d]||0)>0?`科研 ${Math.floor((totals[d]||0)/60)} 小时 ${(totals[d]||0)%60} 分钟`:'无科研记录'}`} aria-pressed={d===date} onClick={()=>select(d)}>{Number(d.slice(-2))}</button>)}</div></section>}</div>
}
