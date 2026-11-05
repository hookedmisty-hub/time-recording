import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Plus, Clock3, FlaskConical, CalendarDays, ChartNoAxesCombined, Trash2, Pencil, Download, PiggyBank } from 'lucide-react'
import './App.css'
import CategoryManager from './CategoryManager.jsx'
import ProjectManager from './ProjectManager.jsx'
import ProjectStats from './ProjectStats.jsx'
import DailyGoal from './DailyGoal.jsx'
import RecordCalendar from './RecordCalendar.jsx'
import TodoList from './TodoList.jsx'
import {TODO_KEY,loadTodos} from './todos.js'
import Rewards from './Rewards.jsx'
import {GOAL_KEY,REWARD_KEY,defaultRewards,loadJSON,calculateRewards} from './rewards.js'
import {parseBundle} from './backupBundle.js'
import {researchAllocation} from './research.js'
import {PROJECT_KEY,loadProjects,includeProjects} from './projects.js'
import {CATEGORY_KEY,loadCategories,includeCategories,splitHourly} from './categories.js'
import { planImport } from './backup.js'

const KEY = 'time-recording-v1' // Keep the same key so existing v1.0 records are preserved.
const DAY = 1440
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const shiftDate = (day, amount) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate()+amount); return localDate(d) }
const minutes = t => { const [h,m] = t.split(':').map(Number); return h*60+m }
const timeLabel = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
const pretty = n => `${Math.floor(n/60)}小时${n%60 ? `${n%60}分` : ''}`
const initialForm = (date=localDate()) => ({title:'',date,start:'09:30',end:'10:30',category:'核心科研',project:'pQMA-ZK',note:'',coreMinutes:''})

// End 24:00 means midnight at the end of the start date, including a full day from 00:00.
// An entry with end < start continues into the next day. Equal start/end is invalid.
const absoluteInterval = r => {
  const start = Date.parse(`${r.date}T00:00:00Z`) / 60000 + minutes(r.start)
  const end = Date.parse(`${r.date}T00:00:00Z`) / 60000 + minutes(r.end) + (minutes(r.end)<minutes(r.start) ? DAY : 0)
  return {start,end}
}
const duration = r => { const {start,end} = absoluteInterval(r); return Math.max(0,end-start) }
const segmentsForDay = (records, day, categories) => {
  const dayStart = Date.parse(`${day}T00:00:00Z`) / 60000
  return records.flatMap(r => {
    if (!r?.date || !r?.start || !r?.end) return []
    const {start,end} = absoluteInterval(r)
    const a = Math.max(start,dayStart), b = Math.min(end,dayStart+DAY)
    const allocation=researchAllocation(r,categories.find(c=>c.name===r.category)?.kind,a-start,b-a)
    return b>a ? [{...r,segmentCore:allocation.core,segmentAuxiliary:allocation.research,segmentStart:a-dayStart,segmentEnd:b-dayStart,segmentMinutes:b-a,continuesFromYesterday:start<dayStart,continuesTomorrow:end>dayStart+DAY}] : []
  }).sort((a,b)=>a.segmentStart-b.segmentStart)
}
const calculateGaps = segments => {
  const gaps=[]; let cursor=0
  for(const s of segments){if(s.segmentStart>cursor)gaps.push({start:cursor,end:s.segmentStart});cursor=Math.max(cursor,s.segmentEnd)}
  if(cursor<DAY)gaps.push({start:cursor,end:DAY})
  return gaps
}
function App(){
  const [records,setRecords] = useState(()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value:[]}catch{return []}})
  const [categories,setCategories]=useState(()=>loadCategories(records))
  const [showCategories,setShowCategories]=useState(false)
  const [projects,setProjects]=useState(()=>loadProjects(records))
  const [showProjects,setShowProjects]=useState(false)
  const saveProjects=(next,nextRecords)=>{
    const previous=localStorage.getItem(PROJECT_KEY)
    try{localStorage.setItem(PROJECT_KEY,JSON.stringify(next));localStorage.setItem(KEY,JSON.stringify(nextRecords))}
    catch(err){if(previous===null)localStorage.removeItem(PROJECT_KEY);else localStorage.setItem(PROJECT_KEY,previous);throw err}
    setProjects(next);setRecords(nextRecords)
    setForm(old=>({...old,project:next.some(p=>p.name===old.project)?old.project:next[0].name}))
  }
  useEffect(()=>localStorage.setItem(PROJECT_KEY,JSON.stringify(projects)),[projects])
  const categoryInfo=name=>categories.find(c=>c.name===name)
  const isResearch=name=>['core','research'].includes(categoryInfo(name)?.kind)
  const categoryColor=name=>categoryInfo(name)?.color||'#64748b'
  const saveCategories=(next,nextRecords)=>{
    const previousCategories=localStorage.getItem(CATEGORY_KEY),previousRecords=localStorage.getItem(KEY)
    try{localStorage.setItem(CATEGORY_KEY,JSON.stringify(next));localStorage.setItem(KEY,JSON.stringify(nextRecords))}
    catch(err){if(previousCategories===null)localStorage.removeItem(CATEGORY_KEY);else localStorage.setItem(CATEGORY_KEY,previousCategories);if(previousRecords!==null)localStorage.setItem(KEY,previousRecords);throw err}
    setCategories(next);setRecords(nextRecords)
  }
  const [todos,setTodos]=useState(loadTodos)
  const saveTodos=items=>{const next={...todos,[date]:items};localStorage.setItem(TODO_KEY,JSON.stringify(next));setTodos(next)}
  const [goals,setGoals]=useState(()=>loadJSON(GOAL_KEY,{}))
  const [rewards,setRewards]=useState(()=>loadJSON(REWARD_KEY,defaultRewards()))
  const [goalRevision,setGoalRevision]=useState(0)
  const saveRewards=next=>{localStorage.setItem(REWARD_KEY,JSON.stringify(next));setRewards(next)}
  const [restoreSettings,setRestoreSettings]=useState(false)
  const [tab,setTab]=useState('today')
  const [date,setDate]=useState(localDate())
  const [showForm,setShowForm]=useState(false)
  const [form,setForm]=useState(initialForm())
  const [editing,setEditing]=useState(null)
  const [error,setError]=useState('')
  const [showImport,setShowImport]=useState(false)
  const [importData,setImportData]=useState(null)
  const [importError,setImportError]=useState('')
  const [importBusy,setImportBusy]=useState(false)
  const [importMessage,setImportMessage]=useState('')
  const [importChoices,setImportChoices]=useState({})
  const importPlan=useMemo(()=>importData?planImport(records,importData.records,importChoices):null,[records,importData,importChoices])
  const readBackup=async e=>{
    const file=e.target.files?.[0]
    setImportData(null);setImportError('');setImportChoices({});setRestoreSettings(false)
    if(!file)return
    setImportBusy(true)
    try{
      if(file.size>5*1024*1024)throw new Error('文件超过 5 MB，请选择较小的备份文件。')
      const parsed=parseBundle(await file.text())
      setImportData({name:file.name,...parsed})
    }catch(err){setImportError(err.message)}finally{setImportBusy(false)}
  }
  const restoreBackup=()=>{
    if(!importPlan||!importPlan.additions.length&&!importPlan.updates.length&&!(restoreSettings&&importData.settings))return
    const merged=importPlan.merged
    try{
      const keys=[KEY,GOAL_KEY,REWARD_KEY,CATEGORY_KEY,PROJECT_KEY,TODO_KEY],previous=keys.map(k=>localStorage.getItem(k))
      try{localStorage.setItem(KEY,JSON.stringify(merged));if(restoreSettings&&importData.settings){if(importData.settings.todos)localStorage.setItem(TODO_KEY,JSON.stringify(importData.settings.todos));localStorage.setItem(GOAL_KEY,JSON.stringify(importData.settings.goals));localStorage.setItem(REWARD_KEY,JSON.stringify(importData.settings.rewards));if(importData.settings.categories)localStorage.setItem(CATEGORY_KEY,JSON.stringify(includeCategories(importData.settings.categories,merged)));if(importData.settings.projects)localStorage.setItem(PROJECT_KEY,JSON.stringify(includeProjects(importData.settings.projects,merged)))}}
      catch(err){keys.forEach((k,i)=>{if(previous[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,previous[i])});throw err}
      if(restoreSettings&&importData.settings){if(importData.settings.todos)setTodos(importData.settings.todos);setGoals(importData.settings.goals);setRewards(importData.settings.rewards);setGoalRevision(n=>n+1)}
    }
    catch{setImportError('保存失败，浏览器存储空间不足或不可用；尚未恢复，请先导出当前记录。');return}
    setCategories(old=>includeCategories(restoreSettings&&importData.settings?.categories?importData.settings.categories:old,merged));setProjects(old=>includeProjects(restoreSettings&&importData.settings?.projects?importData.settings.projects:old,merged));setRecords(merged)
    setImportMessage(`恢复完成：新增 ${importPlan.additions.length} 条，更新 ${importPlan.updates.length} 条，跳过 ${importPlan.duplicates+importPlan.fileDuplicates} 条重复记录，保留 ${importPlan.conflicts.length-importPlan.updates.length} 条当前版本。${restoreSettings&&importData.settings?'已恢复目标、奖励及备份中的待办设置。':''}`)
    setImportData(null);setShowImport(false)
  }
  useEffect(()=>localStorage.setItem(KEY,JSON.stringify(records)),[records])
  useEffect(()=>localStorage.setItem(CATEGORY_KEY,JSON.stringify(categories)),[categories])
  const daily=useMemo(()=>segmentsForDay(records,date,categories),[records,date,categories])
  const total=daily.reduce((s,r)=>s+r.segmentMinutes,0)
  const research=daily.reduce((s,r)=>s+r.segmentCore,0)
  const auxiliary=daily.reduce((s,r)=>s+r.segmentAuxiliary,0)
  const gaps=useMemo(()=>splitHourly(calculateGaps(daily)),[daily])
  const uncovered=gaps.reduce((s,g)=>s+g.end-g.start,0)
  const covered=DAY-uncovered
  const coreCategory=categories.find(c=>c.kind==='core')||{name:'核心科研',color:'#a78bfa'}
  const auxCategory=categories.find(c=>c.kind==='research')||{name:'辅助科研',color:'#60a5fa'}
  const categoryData=[...categories.filter(c=>!['core','research'].includes(c.kind)).map(({name,color})=>({name,value:daily.filter(r=>r.category===name).reduce((s,r)=>s+r.segmentMinutes,0),color})),{name:coreCategory.name,value:research,color:coreCategory.color},{name:auxCategory.name,value:auxiliary,color:auxCategory.color}].filter(x=>x.value)
  const last7=Array.from({length:7},(_,i)=>{const k=shiftDate(date,-6+i);const d=new Date(`${k}T12:00:00`);return {day:`${d.getMonth()+1}/${d.getDate()}`,hours:+(segmentsForDay(records,k,categories).reduce((s,r)=>s+r.segmentCore,0)/60).toFixed(2)}})
  const openNew=(prefill=null)=>{setEditing(null);setError('');setForm({...initialForm(date),category:categories.find(c=>c.kind==='core')?.name||categories[0].name,project:projects[0].name,...prefill});setShowForm(true)}
  const edit=r=>{setEditing(r.id);setError('');const {segmentCore,segmentAuxiliary,segmentStart,segmentEnd,segmentMinutes,continuesFromYesterday,continuesTomorrow,...original}=r;setForm({...original,coreMinutes:isResearch(original.category)?researchAllocation(original,categoryInfo(original.category)?.kind).core:''});setShowForm(true)}
  const save=e=>{
    e.preventDefault()
    if(!form.title.trim())return setError('请输入活动名称。')
    if(form.start===form.end)return setError('开始和结束时间不能相同。')
    if(isResearch(form.category)&&(form.coreMinutes===''||!Number.isInteger(Number(form.coreMinutes))||Number(form.coreMinutes)<0||Number(form.coreMinutes)>duration(form)))return setError('请填写核心科研分钟数，必须是 0 到总时长之间的整数。')
    const item={...form,title:form.title.trim(),id:editing||crypto.randomUUID()}
    if(isResearch(item.category))item.coreMinutes=Number(form.coreMinutes);else delete item.coreMinutes
    const candidate=absoluteInterval(item)
    const conflict=records.find(r=>r.id!==editing&&r.date&&r.start&&r.end&&candidate.start<absoluteInterval(r).end&&candidate.end>absoluteInterval(r).start)
    if(conflict)return setError(`与「${conflict.title}」（${conflict.date} ${conflict.start}–${conflict.end}）时间重叠，请调整后保存。`)
    setRecords(old=>editing?old.map(r=>r.id===editing?item:r):[...old,item]);setShowForm(false);setError('')
  }
  const remove=id=>{if(window.confirm('确定删除这条记录吗？'))setRecords(old=>old.filter(r=>r.id!==id))}
  const exportJSON=()=>{const blob=new Blob([JSON.stringify({version:'1.3',exportedAt:new Date().toISOString(),records:records.map(r=>({...r,categoryColor:categoryColor(r.category),categoryKind:categoryInfo(r.category)?.kind||'other'})),goals,rewards,categories,projects,todos},null,2)],{type:'application/json'});const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=`time-recording-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  const addFromGap = gap => {
    const start=gap.start===DAY ? DAY-1 : gap.start
    const end=timeLabel(gap.end)
    openNew({date,start:timeLabel(start),end})
  }
  const currentStreak=useMemo(()=>calculateRewards(records,categories,goals,rewards,localDate()).streak,[records,categories,goals,rewards])
  const datePicker=<RecordCalendar date={date} onChange={setDate} records={records} categories={categories}/>
  const recordsView= daily.length ? daily.map(r=><div className="record" key={`${r.id}-${r.segmentStart}`}><div className="record-time">{timeLabel(r.segmentStart)}<span>—</span>{r.segmentEnd===DAY?'24:00':timeLabel(r.segmentEnd)}</div><div className="record-main"><strong>{r.title}</strong><div><span className="dot" style={{background:categoryColor(r.category)}}/>{isResearch(r.category)?'科研':r.category}{r.project&&isResearch(r.category)?` · ${r.project}`:''}{isResearch(r.category)?` · 核心 ${r.segmentCore} 分 / 辅助 ${r.segmentAuxiliary} 分`:''}{r.continuesFromYesterday?' · 昨日开始':''}{r.continuesTomorrow?' · 延续至次日':''}</div></div><div className="record-duration">{pretty(r.segmentMinutes)}</div><button title="编辑" className="icon-btn" onClick={()=>edit(r)}><Pencil size={15}/></button><button title="删除" className="icon-btn" onClick={()=>remove(r.id)}><Trash2 size={15}/></button></div>) : <div className="empty">还没有记录。点击右上角「添加记录」开始吧。</div>
  return <div className="app"><aside className="sidebar"><div className="brand"><span className="brand-icon">◷</span><div><strong>我的时间账本</strong><small>记录时间，观察生活</small></div></div><nav>{[['today',Clock3,'今日记录'],['stats',ChartNoAxesCombined,'统计分析'],['history',CalendarDays,'历史记录'],['rewards',PiggyBank,'科研奖励']].map(([id,Icon,label])=><button key={id} className={`nav-btn ${tab===id?'active':''}`} onClick={()=>setTab(id)}><Icon size={18}/>{label}</button>)}<button className="nav-btn" onClick={()=>setShowCategories(true)}>分类管理</button><button className="nav-btn" onClick={()=>setShowProjects(true)}>科研项目管理</button><button className="nav-btn" onClick={exportJSON} title="下载全部记录、目标、奖励与待办的 JSON 备份"><Download size={18}/>一键导出</button></nav><div className="sidebar-bottom">所有数据保存在当前浏览器<br/>建议定期导出备份</div></aside>
  <main className="main"><header><div><div className="eyebrow">PERSONAL TIME JOURNAL · V1.3</div><h1>{tab==='today'?'今日记录':tab==='stats'?'统计分析':tab==='rewards'?'科研奖励':'历史记录'}</h1><p className="subtitle">把每一天，变成可以回顾的生活。</p>{tab==='today'&&currentStreak>0&&<p className="streak-banner" role="status">已连续达标{currentStreak}天！</p>}</div><button className="primary" onClick={()=>openNew()}><Plus size={18}/> 添加记录</button></header>
  {tab==='today'&&<><div className="topline"><h2>时间概览</h2><div className="overview-date-controls"><button type="button" className="secondary" onClick={()=>setDate(localDate())}>回到今天</button>{datePicker}</div></div><section className="metrics"><div className="metric"><span><Clock3 size={17}/> 已记录时间</span><strong>{pretty(total)}</strong><small>当天活动时长（跨午夜自动拆分）</small></div><div className="metric"><span><FlaskConical size={17}/> 核心科研</span><strong>{pretty(research)}</strong><small>占已记录时间 {total?Math.round(research/total*100):0}%</small></div><div className="metric"><span>◴ 当日覆盖率</span><strong>{Math.round(covered/DAY*100)}%</strong><small>{pretty(uncovered)} 尚未记录</small></div></section><div className="daily-planning"><DailyGoal key={`${date}-${goalRevision}`} date={date} minutes={research+auxiliary} core={research} auxiliary={auxiliary} onGoalsChange={setGoals}/><TodoList key={date} date={date} items={todos[date]||[]} onChange={saveTodos}/></div><div className="grid"><section className="card"><div className="card-title"><h2>当日活动</h2><span>{daily.length} 段活动</span></div>{recordsView}</section><section className="card"><div className="card-title"><h2>当日时间分布</h2><span>按分类</span></div>{categoryData.length?<><div className="donut"><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={67} outerRadius={93} paddingAngle={3}>{categoryData.map(x=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip formatter={v=>pretty(v)}/></PieChart></ResponsiveContainer></div><div className="legend">{categoryData.map(x=><div key={x.name}><span className="dot" style={{background:x.color}}/>{x.name}<b>{pretty(x.value)}</b></div>)}</div></>:<div className="empty">添加记录后自动显示分类图表</div>}</section></div><section className="card gap-card"><div className="card-title"><h2>24 小时时间轴</h2><span>点击未记录区间补录</span></div><div className="timeline"><div className="timeline-bar">{daily.map(r=><div key={`${r.id}-${r.segmentStart}`} title={`${r.title} · ${timeLabel(r.segmentStart)}–${timeLabel(r.segmentEnd)}`} className="timeline-piece" style={{left:`${r.segmentStart/DAY*100}%`,width:`${r.segmentMinutes/DAY*100}%`,background:categoryColor(r.category)}}/>)}{gaps.map(g=><button key={g.start} title={`补录 ${timeLabel(g.start)}–${g.end===DAY?'24:00':timeLabel(g.end)}`} className="timeline-gap" style={{left:`${g.start/DAY*100}%`,width:`${(g.end-g.start)/DAY*100}%`}} onClick={()=>addFromGap(g)}/>)}</div><div className="timeline-ticks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div><div className="gap-list"><strong>尚未记录 · {pretty(uncovered)}</strong>{gaps.length?gaps.map(g=><button key={g.start} className="gap-button" onClick={()=>addFromGap(g)}><Plus size={13}/>{timeLabel(g.start)} – {g.end===DAY?'24:00':timeLabel(g.end)} · {pretty(g.end-g.start)}</button>):<span className="complete">已覆盖全天 24 小时</span>}</div></section></>}
  {tab==='stats'&&<><div className="topline"><h2>趋势与分布</h2>{datePicker}</div><div className="grid"><section className="card"><div className="card-title"><h2>近 7 天核心科研</h2><span>小时</span></div><div className="chart"><ResponsiveContainer width="100%" height={300}><BarChart data={last7}><CartesianGrid stroke="#263044" vertical={false}/><XAxis dataKey="day" stroke="#8f9ab0"/><YAxis stroke="#8f9ab0"/><Tooltip/><Bar dataKey="hours" name="核心科研" fill={categories.find(c=>c.kind==='core')?.color||'#a78bfa'} radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section><section className="card"><div className="card-title"><h2>所选日期的分类分布</h2></div>{categoryData.length?<><div className="donut"><ResponsiveContainer width="100%" height={245}><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95}>{categoryData.map(x=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip formatter={v=>pretty(v)}/></PieChart></ResponsiveContainer></div><div className="legend">{categoryData.map(x=><div key={x.name}><span className="dot" style={{background:x.color}}/>{x.name}<b>{pretty(x.value)}</b></div>)}</div></>:<div className="empty">该日期暂无数据</div>}</section></div><ProjectStats records={records} categories={categories} projects={projects} date={date}/></>}
  {tab==='rewards'&&<Rewards records={records} categories={categories} goals={goals} state={rewards} onSave={saveRewards} today={localDate()} onBackup={exportJSON}/>}
  {tab==='history'&&<><div className="topline"><h2>按日期回顾</h2>{datePicker}</div><section className="card"><div className="card-title"><h2>{date} · 活动清单</h2><div className="backup-actions"><button className="secondary" onClick={()=>{setShowImport(true);setImportData(null);setRestoreSettings(false);setImportChoices({});setImportError('');setImportMessage('')}}>导入 JSON</button><button className="secondary" onClick={exportJSON}><Download size={16}/> 导出全部 JSON</button></div></div>{recordsView}</section></>}
  {importMessage&&<p className="import-message" role="status">{importMessage}</p>}
  <footer>Time Recording · Local-first · 数据仅保存在当前浏览器</footer></main>
  {showProjects&&<ProjectManager projects={projects} records={records} onSave={saveProjects} onClose={()=>setShowProjects(false)}/>}
  {showCategories&&<CategoryManager categories={categories} records={records} onSave={saveCategories} onClose={()=>setShowCategories(false)}/>}
  {showImport&&<div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-header"><h2 id="import-title">导入 JSON 备份</h2><button className="close" aria-label="关闭导入" disabled={importBusy} onClick={()=>setShowImport(false)}>✕</button></div><p className="import-help">按记录 ID 合并。相同 ID 且内容一致时跳过；内容不同时可逐条选择版本，默认保留当前记录。备份内重复 ID 保留第一条。确认前不会修改数据；本次合并不会删除记录。</p><label className="backup-file">选择 JSON 备份文件<input type="file" accept=".json,application/json" disabled={importBusy} onChange={readBackup}/></label>{importBusy&&<p role="status">正在校验…</p>}{importError&&<p className="form-error" role="alert">{importError}</p>}{importData&&importPlan&&<div className="import-preview"><p>文件：{importData.name}</p><p>校验通过：{importData.records.length} 条记录</p>{importData.settings&&<section className="settings-restore"><p>完整备份还包含 {Object.keys(importData.settings.goals).length} 天目标、{importData.settings.rewards.wishlist.length} 个心愿、{importData.settings.rewards.redemptions.length} 条兑换及 {importData.settings.rewards.restDays.length} 个休息日{importData.settings.todos?`、${Object.values(importData.settings.todos).reduce((n,items)=>n+items.length,0)} 条待办`:""}。</p><label><input type="checkbox" checked={restoreSettings} onChange={e=>setRestoreSettings(e.target.checked)}/>同时恢复目标、奖励与待办设置（覆盖当前目标、心愿、兑换、休息日及备份中的分类、项目和待办）</label><p className="import-help">默认只合并活动记录；勾选后以这份备份的奖励数据为准。建议先导出当前完整备份。</p></section>}<p>当前已有：{records.length} 条 · 将新增：{importPlan.additions.length} 条 · 相同内容跳过：{importPlan.duplicates} 条 · 内容冲突：{importPlan.conflicts.length} 条 · 将更新：{importPlan.updates.length} 条</p>{importPlan.fileDuplicates>0&&<p>备份内重复 ID：{importPlan.fileDuplicates} 条，保留第一条。</p>}{importPlan.conflicts.length>0&&<section className="import-conflicts"><h3>选择冲突记录的版本</h3><p>备份没有可靠的修改时间，请核对后选择。</p><div className="backup-actions"><button className="secondary" onClick={()=>setImportChoices(Object.fromEntries(importPlan.conflicts.map(c=>[c.current.id,'incoming'])))}>全部使用备份版本</button><button className="secondary" onClick={()=>setImportChoices({})}>全部保留当前版本</button></div>{importPlan.conflicts.map(({current,incoming})=><div className="import-conflict" key={current.id}><strong>{current.title}</strong><p>当前：{current.date} {current.start}–{current.end} · {current.title} · {current.category}{current.project?` · ${current.project}`:''}{current.coreMinutes!=null?` · 核心 ${current.coreMinutes} 分钟`:''}{current.note?` · 备注：${current.note}`:''}</p><p>备份：{incoming.date} {incoming.start}–{incoming.end} · {incoming.title} · {incoming.category}{incoming.project?` · ${incoming.project}`:''}{incoming.coreMinutes!=null?` · 核心 ${incoming.coreMinutes} 分钟`:''}{incoming.note?` · 备注：${incoming.note}`:''}</p><label>恢复版本<select aria-label={`恢复版本 ${current.id}`} value={importChoices[current.id]||'current'} onChange={e=>setImportChoices(old=>({...old,[current.id]:e.target.value}))}><option value="current">保留当前版本</option><option value="incoming">使用备份版本</option></select></label></div>)}</section>}{importPlan.overlaps&&<p className="import-warning">合并后的记录存在时间重叠。恢复会保留这些记录，请在恢复后检查时间轴。</p>}{!importPlan.additions.length&&!importPlan.updates.length&&<p>当前选择没有需要新增或更新的记录。</p>}</div>}<div className="actions"><button className="secondary" disabled={importBusy} onClick={()=>setShowImport(false)}>取消</button><button className="primary" disabled={importBusy||!importPlan||!importPlan.additions.length&&!importPlan.updates.length&&!(restoreSettings&&importData?.settings)} onClick={restoreBackup}>确认恢复</button></div></section></div>}
  {showForm&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}><div className="modal"><div className="modal-header"><h2>{editing?'编辑记录':'添加时间记录'}</h2><button className="close" onClick={()=>setShowForm(false)}>✕</button></div><form onSubmit={save}><label>活动名称<input autoFocus required placeholder="例如：阅读 HSP 论文" value={form.title} onChange={e=>{setForm({...form,title:e.target.value});setError('')}}/></label><label>日期（活动开始的日期）<input required type="date" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setError('')}}/></label><div className="form-row"><label>开始时间<input required type="time" value={form.start} onChange={e=>{setForm({...form,start:e.target.value});setError('')}}/></label><label>结束时间<input required type="time" disabled={form.end==='24:00'} value={form.end==='24:00'?'00:00':form.end} onChange={e=>{setForm({...form,end:e.target.value});setError('')}}/></label></div><label className="midnight-option"><input type="checkbox" checked={form.end==='24:00'} onChange={e=>{setForm({...form,end:e.target.checked?'24:00':'00:00'});setError('')}}/>结束于当日 24:00（次日零点）</label><div className="duration-preview">自动计算时长：{form.start===form.end?'请设置不同的开始与结束时间':pretty(duration(form))} {form.end<form.start?' · 跨午夜，自动分配到两天':''}</div><label>分类<select value={isResearch(form.category)?'__research':form.category} onChange={e=>setForm({...form,category:e.target.value==='__research'?(categories.find(c=>c.kind==='core')||categories.find(c=>c.kind==='research')).name:e.target.value})}>{categories.some(c=>isResearch(c.name))&&<option value="__research">科研</option>}{categories.filter(c=>!isResearch(c.name)).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label>{isResearch(form.category)&&<label>研究项目<select value={form.project} onChange={e=>setForm({...form,project:e.target.value})}>{projects.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></label>}{isResearch(form.category)&&<><label>其中核心科研（分钟）<input aria-label="核心科研分钟数" required type="number" min="0" max={duration(form)} step="1" placeholder="例如：45" value={form.coreMinutes??''} onChange={e=>{setForm({...form,coreMinutes:e.target.value});setError('')}}/></label><div className="duration-preview">总科研 {duration(form)} 分钟 · 核心 {form.coreMinutes===''?'待填写':form.coreMinutes} 分钟 · 辅助 {form.coreMinutes===''?'待计算':Math.max(0,duration(form)-Number(form.coreMinutes))} 分钟。跨午夜时按每天时长比例分配。</div></>}<label>备注（可选）<textarea rows="2" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>{error&&<div className="form-error" role="alert">{error}</div>}<div className="actions"><button type="button" className="secondary" onClick={()=>setShowForm(false)}>取消</button><button className="primary" type="submit">保存记录</button></div></form></div></div>}</div>
}
export default App
