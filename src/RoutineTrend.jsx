import {useMemo,useState} from 'react'
import {ResponsiveContainer,ComposedChart,Line,Bar,XAxis,YAxis,Tooltip,CartesianGrid,Legend} from 'recharts'
import {ChevronDown} from 'lucide-react'
import {trendDays} from './categoryTrend.js'
import {routineTimeLabel,sleepSeries,defaultRoutineCategories,categoryStartSeries} from './routineStats.js'
export default function RoutineTrend({type,records,categories,date,settings={},onSettingsChange}){
 const sleep=type==='sleep',field=sleep?'sleepCategoryIds':'businessCategoryIds'
 const [period,setPeriod]=useState('week'),[error,setError]=useState('')
 const options=categories.filter(c=>c.kind==='core'||['工作事务','学习成长'].includes(c.id)||['工作事务','学习成长'].includes(c.name))
 const ids=sleep?defaultRoutineCategories(categories,'sleep'):(settings[field]??options.filter(c=>c.kind==='core'||c.id==='工作事务'||c.name==='工作事务').map(c=>c.id))
 const selected=options.filter(c=>ids.includes(c.id))
 const days=useMemo(()=>trendDays(date,period),[date,period])
 const data=useMemo(()=>sleep?sleepSeries(records,categories,days,ids,'longest'):categoryStartSeries(records,categories,days,ids),[records,categories,days,ids,sleep])
 const sleepDurationData=sleep?data.map(row=>({...row,sleepHours:row.bedtime===null||row.wake===null?null:(row.wake-row.bedtime)/60})):[]
 const durationLabel=hours=>{const n=Math.round(Number(hours)*60);return `${Math.floor(n/60)}小时${n%60?`${n%60}分`:''}`}
 const series=sleep?[{key:'bedtime',name:'入睡',color:'#60a5fa'},{key:'wake',name:'起床',color:'#fbbf24'}]:selected.map(c=>({key:c.id,name:c.name,color:c.color}))
 const values=data.flatMap(row=>series.map(s=>row[s.key])).filter(x=>x!==null)
 const minimum=values.length?Math.floor(Math.min(...values)/180)*180:0
 const maximum=values.length?Math.max(minimum+180,Math.ceil(Math.max(...values)/180)*180):DAY_END
 const ticks=Array.from({length:Math.floor((maximum-minimum)/180)+1},(_,i)=>minimum+i*180)
 const change=patch=>{try{onSettingsChange({...settings,...patch});setError('')}catch(err){setError(err.message)}}
 return <section className="card routine-trend">
  <div className="card-title"><h2>{sleep?'睡眠作息':'启动时间'}</h2><span>{sleep?'时间点 / 小时':'时间点'}</span></div>
  <div className="trend-controls"><div className="trend-period" role="group" aria-label={sleep?'睡眠统计范围':'工作开始统计范围'}><button className="secondary" aria-pressed={period==='week'} onClick={()=>setPeriod('week')}>近 7 天</button><button className="secondary" aria-pressed={period==='month'} onClick={()=>setPeriod('month')}>月分布</button></div>
   {!sleep&&<details className="trend-category-picker"><summary>显示分类（{selected.length}）<ChevronDown size={14}/></summary><div className="trend-category-menu">{options.map(c=><label key={c.id}><input type="checkbox" aria-label={`启动分类：${c.name}`} checked={ids.includes(c.id)} onChange={e=>change({[field]:e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id)})}/><span className="dot" style={{background:c.color}}/>{c.name}</label>)}</div></details>}
  </div>
  <p className="trend-range">{days[0]} 至 {days.at(-1)}</p>

  {error&&<p className="form-error" role="alert">{error}</p>}
  {values.length?<div className="trend-chart"><ResponsiveContainer width="100%" height={300}><ComposedChart data={sleep?sleepDurationData:data} margin={{top:12,right:15,left:12,bottom:4}}><CartesianGrid stroke="#263044" vertical={false}/><XAxis dataKey="date" stroke="#8f9ab0" tick={{fontSize:11}} minTickGap={18} interval="preserveStartEnd" tickFormatter={v=>period==='month'?String(Number(v.slice(8))):`${Number(v.slice(5,7))}/${Number(v.slice(8))}`}/><YAxis yAxisId="time" stroke="#8f9ab0" tick={{fontSize:11}} width={65} domain={[minimum,maximum]} ticks={ticks} tickFormatter={routineTimeLabel}/>{sleep&&<YAxis yAxisId="duration" orientation="right" stroke="#a78bfa" tick={{fontSize:11}} width={36} domain={[0,'auto']} allowDecimals={false} tickFormatter={v=>`${v}h`}/>}<Tooltip contentStyle={{backgroundColor:'rgba(20,28,45,.91)',border:'1px solid rgba(150,165,195,.32)',borderRadius:10,color:'#e8ecf5',fontSize:12}} labelStyle={{color:'#e8ecf5'}} formatter={(v,name)=>name==='睡眠时长'?durationLabel(v):routineTimeLabel(v)}/><Legend wrapperStyle={{fontSize:12,paddingTop:12}}/>{sleep&&<Bar yAxisId="duration" dataKey="sleepHours" name="睡眠时长" fill="#a78bfa" fillOpacity={.25} maxBarSize={30} radius={[4,4,0,0]} isAnimationActive={false}/>} {series.map(s=><Line yAxisId="time" key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{r:3,fill:s.color,strokeWidth:0}} activeDot={{r:5}} connectNulls={false} isAnimationActive={false}/>)}</ComposedChart></ResponsiveContainer></div>:<div className="empty">{sleep?(ids.length?'该范围暂无睡眠记录。':'请先选择用于睡眠统计的分类。'):'该范围暂无对应的工作开始记录。'}</div>}
  <p className="routine-help">{sleep?'按起床日期归属；取最长连续睡眠段；相邻睡眠记录合并。':'各分类取当天首次开始时间；核心分类仅统计含核心分钟的记录（开始时间为估算）。跨日延续不算新开始。'}没有记录的日期留空。</p>
 </section>
}
const DAY_END=1440
