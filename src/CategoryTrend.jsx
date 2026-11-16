import {useMemo,useState} from 'react'
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid,Legend} from 'recharts'
import {ChevronDown} from 'lucide-react'
import {workCategory} from './categories.js'
import {trendDays,categoryTrendTotals} from './categoryTrend.js'
const pretty=hours=>{const n=Math.round(hours*60);return `${Math.floor(n/60)}小时${n%60?`${n%60}分`:''}`}
export default function CategoryTrend({records,categories,date,segmentsForDay}){
 const [period,setPeriod]=useState('week'),[chosen,setChosen]=useState(null)
 const selected=chosen===null?[workCategory(categories,'core')?.id]:chosen
 const active=categories.filter(c=>selected.includes(c.id))
 const days=useMemo(()=>trendDays(date,period),[date,period])
 const data=useMemo(()=>days.map(day=>{
  const totals=categoryTrendTotals(segmentsForDay(records,day,categories),categories)
  return {date:day,...Object.fromEntries(categories.map((c,i)=>[`c${i}`,(totals[c.id]||0)/60]))}
 }),[days,records,categories,segmentsForDay])
 return <section className="card category-trend">
  <div className="card-title"><h2>{period==='month'?`${date.slice(0,7)} · 月分布`:'近 7 天 · 时间趋势'}</h2><span>小时</span></div>
  <div className="trend-controls">
   <div className="trend-period" role="group" aria-label="趋势范围"><button className="secondary" aria-pressed={period==='week'} onClick={()=>setPeriod('week')}>近 7 天</button><button className="secondary" aria-pressed={period==='month'} onClick={()=>setPeriod('month')}>月分布</button></div>
   <details className="trend-category-picker"><summary>显示分类（{active.length}）<ChevronDown size={14}/></summary><div className="trend-category-menu">{categories.map(c=><label key={c.id}><input type="checkbox" aria-label={`显示${c.name}`} checked={selected.includes(c.id)} onChange={e=>setChosen(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><span className="dot" style={{background:c.color}}/>{c.name}</label>)}</div></details>
  </div>
  <p className="trend-range">{days[0]} 至 {days.at(-1)}</p>
  {active.length?<div className="trend-chart"><ResponsiveContainer width="100%" height={300}><LineChart data={data} margin={{top:12,right:15,left:-18,bottom:4}}>
   <CartesianGrid stroke="#263044" vertical={false}/><XAxis dataKey="date" stroke="#8f9ab0" tick={{fontSize:11}} minTickGap={18} interval="preserveStartEnd" tickFormatter={value=>period==='month'?String(Number(value.slice(8))):`${Number(value.slice(5,7))}/${Number(value.slice(8))}`}/><YAxis stroke="#8f9ab0" tick={{fontSize:11}} domain={[0,'auto']}/>
   <Tooltip contentStyle={{backgroundColor:'rgba(20,28,45,.91)',border:'1px solid rgba(150,165,195,.32)',borderRadius:10,boxShadow:'0 6px 18px #0004',backdropFilter:'blur(6px)',color:'#e8ecf5'}} labelStyle={{color:'#e8ecf5'}} formatter={pretty}/><Legend wrapperStyle={{fontSize:12,paddingTop:12}}/>
   {active.map(c=><Line key={c.id} dataKey={`c${categories.findIndex(x=>x.id===c.id)}`} name={c.name} stroke={c.color} strokeWidth={2} type="linear" dot={{r:3,fill:c.color,strokeWidth:0}} activeDot={{r:5}} isAnimationActive={false}/>)}
  </LineChart></ResponsiveContainer></div>:<div className="empty">请在「显示分类」中勾选至少一个分类。</div>}
 </section>
}
