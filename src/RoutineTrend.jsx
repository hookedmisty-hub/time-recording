import {useId,useMemo,useState} from 'react'
import {ResponsiveContainer,ComposedChart,Line,Bar,Cell,XAxis,YAxis,Tooltip,CartesianGrid,Legend} from 'recharts'
import {Check,ChevronDown,Pencil,X} from 'lucide-react'
import {trendDays} from './categoryTrend.js'
import {routineTimeLabel,sleepTimeLabel,sleepSeries,defaultRoutineCategories,categoryStartSeries,workDurationSeries} from './routineStats.js'
const durationColor='#a78bfa'
const durationHours=row=>row.duration.minutes===null?null:row.duration.minutes/60
const durationLabel=minutes=>`${Math.floor(minutes/60)}小时${minutes%60?`${minutes%60}分`:''}`
function metDurationGoal({minutes,targetMinutes}){
 return minutes!==null&&minutes>=targetMinutes
}
export default function RoutineTrend({type,records,categories,goals,date,settings={},onSettingsChange}){
 const sleep=type==='sleep',field=sleep?'sleepCategoryIds':'businessCategoryIds'
 const [period,setPeriod]=useState('week'),[error,setError]=useState('')
 const [targetDraft,setTargetDraft]=useState(null)
 const patternId=`routine-hatch-${useId().replace(/:/g,'')}`
 const targetHours=settings.sleepTargetHours??8
 const options=categories.filter(c=>c.kind==='core'||['工作事务','学习成长'].includes(c.id)||['工作事务','学习成长'].includes(c.name))
 const ids=sleep?defaultRoutineCategories(categories,'sleep'):(settings[field]??options.filter(c=>c.kind==='core'||c.id==='工作事务'||c.name==='工作事务').map(c=>c.id))
 const selected=options.filter(c=>ids.includes(c.id))
 const days=useMemo(()=>trendDays(date,period),[date,period])
 const data=useMemo(()=>sleep?sleepSeries(records,categories,days,ids,'longest'):categoryStartSeries(records,categories,days,ids),[records,categories,days,ids,sleep])
 const durations=useMemo(()=>sleep
  ? data.map(({bedtime,wake})=>({
     minutes:bedtime===null||wake===null?null:wake-bedtime,
     targetMinutes:Math.round(targetHours*60),
    }))
  : workDurationSeries(records,categories,days,goals),
  [sleep,data,targetHours,records,categories,days,goals])
 const chartData=data.map((row,index)=>({...row,duration:durations[index]}))
 const durationName=sleep?'睡眠时长':'工作时长'
 const series=sleep?[{key:'bedtime',name:'入睡',color:'#60a5fa'},{key:'wake',name:'起床',color:'#fbbf24'}]:selected.map(c=>({key:c.id,name:c.name,color:c.color}))
 const values=data.flatMap(row=>series.map(s=>row[s.key])).filter(x=>x!==null)
 const minimum=sleep?Math.min(-360,...values.map(v=>Math.floor(v/180)*180)):(values.length?Math.floor(Math.min(...values)/180)*180:0)
 const maximum=sleep?Math.max(720,...values.map(v=>Math.ceil(v/180)*180)):(values.length?Math.max(minimum+180,Math.ceil(Math.max(...values)/180)*180):DAY_END)
 const hasChartData=values.length>0||durations.some(({minutes})=>minutes!==null)
 const ticks=Array.from({length:Math.floor((maximum-minimum)/180)+1},(_,i)=>minimum+i*180)
 const change=patch=>{
  try {
   onSettingsChange({...settings,...patch})
   setError('')
   return true
  } catch(err) {
   setError(err.message)
   return false
  }
 }
 function cancelTargetEdit(){
  setTargetDraft(null)
  setError('')
 }
 function saveTarget(event){
  event.preventDefault()
  const hours=Number(targetDraft)
  if(!Number.isFinite(hours)||hours<=0||hours>24){
   setError('请输入大于 0 且不超过 24 的小时数。')
   return
  }
  if(change({sleepTargetHours:hours}))setTargetDraft(null)
 }
 return <section className="card routine-trend">
  <div className="card-title"><h2>{sleep?'睡眠作息':'启动时间'}</h2><span>时间点 / 小时</span></div>
  <div className="trend-controls"><div className="trend-period" role="group" aria-label={sleep?'睡眠统计范围':'工作开始统计范围'}><button className="secondary" aria-pressed={period==='week'} onClick={()=>setPeriod('week')}>近 7 天</button><button className="secondary" aria-pressed={period==='month'} onClick={()=>setPeriod('month')}>月分布</button></div>
   {sleep&&(targetDraft===null
    ? <div className="sleep-target-control">
       <span>目标睡眠 <strong>{targetHours} 小时</strong></span>
       <button type="button" className="icon-btn" aria-label="编辑目标睡眠时长" onClick={()=>setTargetDraft(String(targetHours))}>
        <Pencil size={14}/>
       </button>
      </div>
    : <form className="sleep-target-control" noValidate onSubmit={saveTarget} onKeyDown={event=>{
       if(event.key==='Escape'){event.preventDefault();cancelTargetEdit()}
      }}>
       <label>目标睡眠 <input autoFocus aria-label="目标睡眠时长（小时）" type="number" step="0.25" max="24"
        value={targetDraft} onChange={event=>setTargetDraft(event.target.value)}/> 小时</label>
       <button type="submit" className="icon-btn" aria-label="保存目标睡眠时长"><Check size={16}/></button>
       <button type="button" className="icon-btn" aria-label="取消编辑目标睡眠时长" onClick={cancelTargetEdit}><X size={15}/></button>
      </form>)}
   {!sleep&&<details className="trend-category-picker"><summary>显示分类（{selected.length}）<ChevronDown size={14}/></summary><div className="trend-category-menu">{options.map(c=><label key={c.id}><input type="checkbox" aria-label={`启动分类：${c.name}`} checked={ids.includes(c.id)} onChange={e=>change({[field]:e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id)})}/><span className="dot" style={{background:c.color}}/>{c.name}</label>)}</div></details>}
  </div>
  <p className="trend-range">{days[0]} 至 {days.at(-1)}</p>

  {error&&<p className="form-error" role="alert">{error}</p>}
  {hasChartData?<div className="trend-chart">
   <ResponsiveContainer width="100%" height={300}>
    <ComposedChart data={chartData} margin={{top:12,right:15,left:12,bottom:4}}>
     <defs>
      <pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
       <rect width="7" height="7" fill="rgba(167,139,250,.08)"/>
       <line x1="0" y1="0" x2="0" y2="7" stroke={durationColor} strokeOpacity=".65" strokeWidth="2"/>
      </pattern>
     </defs>
     <CartesianGrid stroke="#263044" vertical={false}/>
     <XAxis dataKey="date" stroke="#8f9ab0" tick={{fontSize:11}} minTickGap={18} interval="preserveStartEnd"
      tickFormatter={v=>period==='month'?String(Number(v.slice(8))):`${Number(v.slice(5,7))}/${Number(v.slice(8))}`}/>
     <YAxis yAxisId="time" reversed hide={!values.length} stroke="#8f9ab0" tick={{fontSize:11}} width={65}
      domain={[minimum,maximum]} ticks={ticks} tickFormatter={sleep?sleepTimeLabel:routineTimeLabel}/>
     <YAxis yAxisId="duration" orientation="right" stroke={durationColor} tick={{fontSize:11}} width={36}
      domain={[0,'auto']} allowDecimals={false} tickFormatter={v=>`${v}h`}/>
     <Tooltip
      itemSorter={item=>item.dataKey===durationHours?series.length:series.findIndex(s=>s.key===item.dataKey)}
      contentStyle={{backgroundColor:'rgba(20,28,45,.91)',border:'1px solid rgba(150,165,195,.32)',borderRadius:10,color:'#e8ecf5',fontSize:12}}
      labelStyle={{color:'#e8ecf5'}} labelFormatter={v=>sleep?`${v} 起床日`:v}
      formatter={(value,_name,item)=>{
       if(item.dataKey===durationHours){
        const duration=item.payload.duration
        const label=durationLabel(duration.minutes)
        return sleep?label:`${label} · 目标 ${durationLabel(duration.targetMinutes)} · ${metDurationGoal(duration)?'已达标':'未达标'}`
       }
       return sleep?`${Number(value)<0?'前一晚 ':''}${sleepTimeLabel(value)}`:routineTimeLabel(value)
      }}/>
     <Legend wrapperStyle={{fontSize:12,paddingTop:12}}/>
     <Bar yAxisId="duration" dataKey={durationHours} name={durationName} fill={durationColor} maxBarSize={30}
      radius={[4,4,0,0]} isAnimationActive={false}>
      {chartData.map(({date,duration})=>{
       const met=metDurationGoal(duration)
       return <Cell key={date} fill={met?durationColor:`url(#${patternId})`} fillOpacity={met ? 0.25 : 1}/>
      })}
     </Bar>
     {series.map(s=><Line yAxisId="time" key={s.key} dataKey={s.key} name={s.name} stroke={s.color}
      strokeWidth={2} dot={{r:3,fill:s.color,strokeWidth:0}} activeDot={{r:5}} connectNulls={false} isAnimationActive={false}/>)}
    </ComposedChart>
   </ResponsiveContainer>
  </div>:<div className="empty">
   {sleep?(ids.length?'该范围暂无睡眠记录。':'请先选择用于睡眠统计的分类。'):'该范围暂无启动时间或工作时长。'}
  </div>}
 </section>
}
const DAY_END=1440
