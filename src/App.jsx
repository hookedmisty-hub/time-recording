import HistoryCalendar from './HistoryCalendar.jsx'
import LogTasks from './LogTasks.jsx'
import {planOverlapsRecord,tasksForLog,assignPlanTask,validateLogTasks} from './plans.js'
import PlanLog from './PlanLog.jsx'
import Checkins from './Checkins.jsx'
import RoutineTrend from './RoutineTrend.jsx'
import CategoryTrend from './CategoryTrend.jsx'
import EditableSubtitle from './EditableSubtitle.jsx'
import {PREFERENCES_KEY,loadPreferences,validatePreferences,DEFAULT_SUBTITLE} from './preferences.js'
import TemporalInput, {withStartTime} from './TemporalInput.jsx'
import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Clock3, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Trash2, Pencil, Download, PiggyBank, Settings, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Columns3 } from 'lucide-react'
import './App.css'
import CategoryManager from './CategoryManager.jsx'
import ProjectManager from './ProjectManager.jsx'
import CloudAccount from './CloudAccount.jsx'
import {useCloudSync} from './useCloudSync.js'
import DeliverableEditor from './DeliverableEditor.jsx'
import ProjectStats from './ProjectStats.jsx'
import DailyGoal from './DailyGoal.jsx'
import RecordCalendar from './RecordCalendar.jsx'
import TodoList from './TodoList.jsx'
import {TODO_KEY,loadTodos} from './todos.js'
import Rewards, {RewardRules} from './Rewards.jsx'
import {GOAL_KEY,REWARD_KEY,defaultRewards,loadJSON,calculateRewards,settlePending} from './rewards.js'
import {parseBundle} from './backupBundle.js'
import {DELIVERABLE_KEY,loadDeliverables,mergeDeliverables,clearDeliverableLinks} from './deliverables.js'
import {researchAllocation} from './research.js'
import {PROJECT_KEY,loadProjects,includeProjects,normalizeProjectRecords,UNASSIGNED_PROJECT} from './projects.js'
import {CATEGORY_KEY,loadCategories,includeCategories,splitHourly,workCategory} from './categories.js'
import { planImport } from './backup.js'

const KEY = 'time-recording-v1' // Keep the same key so existing v1.0 records are preserved.
const DAY = 1440
const QUICK_GAP_PERIODS = [
  {label:'早晨',start:6*60,end:9*60},
  {label:'上午',start:9*60,end:12*60},
  {label:'午间',start:12*60,end:14*60},
  {label:'下午',start:14*60,end:18*60},
  {label:'晚间',start:18*60,end:DAY},
]
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const shiftDate = (day, amount) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate()+amount); return localDate(d) }
const minutes = t => { const [h,m] = t.split(':').map(Number); return h*60+m }
const timeLabel = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
const pretty = n => `${Math.floor(n/60)}小时${n%60 ? `${n%60}分` : ''}`
const initialForm = (date=localDate()) => ({title:'',date,start:'09:30',end:'10:30',category:'',project:UNASSIGNED_PROJECT,deliverableId:'',note:'',coreMinutes:''})

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
  const [records,setRecords] = useState(()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?normalizeProjectRecords(value):[]}catch{return []}})
  const [categories,setCategories]=useState(()=>loadCategories(records))
  const [showCategories,setShowCategories]=useState(false)
  const [projects,setProjects]=useState(()=>loadProjects(records))
  const [deliverables,setDeliverables]=useState(()=>loadDeliverables(projects))
  const deliverableById=useMemo(()=>new Map(deliverables.map(item=>[item.id,item])),[deliverables])
  const [showProjects,setShowProjects]=useState(false)
  const writeStorage=entries=>{
    const previous=entries.map(([key])=>localStorage.getItem(key))
    try{for(const [key,value] of entries)localStorage.setItem(key,JSON.stringify(value))}
    catch(err){
      entries.forEach(([key],i)=>{if(previous[i]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[i])})
      throw err
    }
  }
  const saveProjects=(next,nextRecords)=>{
    writeStorage([[PROJECT_KEY,next],[KEY,nextRecords]])
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
  const [preferences,setPreferences]=useState(loadPreferences)
  const savePreferences=subtitle=>{const next=validatePreferences({...preferences,subtitle:subtitle.trim()||DEFAULT_SUBTITLE});localStorage.setItem(PREFERENCES_KEY,JSON.stringify(next));setPreferences(next)}
  const saveCalendarEvents=calendarEvents=>{const next=validatePreferences({...preferences,calendarEvents});localStorage.setItem(PREFERENCES_KEY,JSON.stringify(next));setPreferences(next)}
  const savePlans=plans=>{const next=validatePreferences({...preferences,plans});localStorage.setItem(PREFERENCES_KEY,JSON.stringify(next));setPreferences(next)}
  const saveCheckins=checkins=>{const next=validatePreferences({...preferences,checkins});localStorage.setItem(PREFERENCES_KEY,JSON.stringify(next));setPreferences(next)}
  const saveRoutineSettings=routine=>{const next=validatePreferences({...preferences,routine});localStorage.setItem(PREFERENCES_KEY,JSON.stringify(next));setPreferences(next)}
  const [todos,setTodos]=useState(loadTodos)
  const saveTodos=items=>{const next={...todos,[date]:items};localStorage.setItem(TODO_KEY,JSON.stringify(next));setTodos(next)}
  const [goals,setGoals]=useState(()=>loadJSON(GOAL_KEY,{}))
  const [rewards,setRewards]=useState(()=>loadJSON(REWARD_KEY,defaultRewards()))
  const [today,setToday]=useState(localDate)
  useEffect(()=>{
    if(!rewards.pending||rewards.pending.date>today)return
    const latest=loadJSON(REWARD_KEY,null)
    if(latest&&JSON.stringify(latest)!==JSON.stringify(rewards))return
    const next=settlePending(rewards,calculateRewards(records,categories,goals,rewards,today),today)
    try{localStorage.setItem(REWARD_KEY,JSON.stringify(next));setRewards(next)}catch{/* Keep pending rules usable if storage is unavailable. */}
  },[records,categories,goals,rewards,today])
  const [goalRevision,setGoalRevision]=useState(0)
  const saveRewards=next=>{localStorage.setItem(REWARD_KEY,JSON.stringify(next));setRewards(next)}
  const [restoreSettings,setRestoreSettings]=useState(false)
  const [tab,setTab]=useState('today')
  const [calendarPlanRequest,setCalendarPlanRequest]=useState(null)
  const [historyView,setHistoryView]=useState('month')
  const [deliveryProjectId,setDeliveryProjectId]=useState(null)
  const openDeliverables=projectId=>{
    setDeliveryProjectId(projectId)
    setShowProjects(false)
    setTab('deliverables')
  }
  const saveDeliverable=item=>{
    const next=deliverableById.has(item.id)?deliverables.map(old=>old.id===item.id?item:old):[...deliverables,item]
    localStorage.setItem(DELIVERABLE_KEY,JSON.stringify(next))
    setDeliverables(next)
  }
  const removeDeliverable=id=>{
    if(!deliverableById.has(id))return
    const removedIds=new Set([id])
    const nextDeliverables=deliverables.filter(item=>item.id!==id)
    const nextRecords=clearDeliverableLinks(records,removedIds)
    const nextPlans=preferences.plans&&clearDeliverableLinks(preferences.plans,removedIds,'')
    const entries=[[DELIVERABLE_KEY,nextDeliverables]]
    if(nextRecords!==records)entries.push([KEY,nextRecords])
    const nextPreferences=nextPlans===preferences.plans?preferences:{...preferences,plans:nextPlans}
    if(nextPreferences!==preferences)entries.push([PREFERENCES_KEY,nextPreferences])
    writeStorage(entries)
    setDeliverables(nextDeliverables)
    setRecords(nextRecords)
    setPreferences(nextPreferences)
  }
  const deliveryProjects=projects.filter(p=>p.id!==UNASSIGNED_PROJECT&&(!deliveryProjectId||p.id===deliveryProjectId)&&
    (!p.archived||p.id===deliveryProjectId||deliverables.some(item=>item.projectId===p.id)))
  const cloudSnapshot=useMemo(()=>({records,categories,projects,deliverables,goals,todos,rewards,...(preferences.subtitle!==DEFAULT_SUBTITLE||preferences.routine||preferences.checkins||preferences.plans||preferences.calendarEvents?{preferences}:{})}),[records,categories,projects,deliverables,goals,todos,rewards,preferences])
  const cloudSync=useCloudSync(cloudSnapshot,next=>{
    writeStorage([[KEY,next.records],[CATEGORY_KEY,next.categories],[PROJECT_KEY,next.projects],[DELIVERABLE_KEY,next.deliverables],[GOAL_KEY,next.goals],[TODO_KEY,next.todos],[REWARD_KEY,next.rewards],[PREFERENCES_KEY,next.preferences||{subtitle:DEFAULT_SUBTITLE}]])
    setRecords(next.records);setCategories(next.categories);setProjects(next.projects);setDeliverables(next.deliverables)
    setPreferences(next.preferences||{subtitle:DEFAULT_SUBTITLE});setGoals(next.goals);setTodos(next.todos);setRewards(next.rewards);setGoalRevision(n=>n+1)
  })
  const [showAccount,setShowAccount]=useState(false)
  const [showGuide,setShowGuide]=useState(false)
  const [showRewardRules,setShowRewardRules]=useState(false)
  const [managementOpen,setManagementOpen]=useState(false)
  const [date,setDate]=useState(localDate())
  useEffect(()=>{
    let previousDay=localDate()
    const refreshDay=()=>{
      const nextDay=localDate()
      if(nextDay===previousDay)return
      const oldDay=previousDay
      previousDay=nextDay
      setToday(nextDay)
      setDate(selected=>selected===oldDay?nextDay:selected)
    }
    const timer=window.setInterval(refreshDay,30000)
    window.addEventListener('focus',refreshDay)
    document.addEventListener('visibilitychange',refreshDay)
    return ()=>{
      window.clearInterval(timer)
      window.removeEventListener('focus',refreshDay)
      document.removeEventListener('visibilitychange',refreshDay)
    }
  },[])

  const [showForm,setShowForm]=useState(false)
  const [inlineRecord,setInlineRecord]=useState(false)
  const [inlineAnchor,setInlineAnchor]=useState(null)
  const [form,setForm]=useState(initialForm())
  const [recordBaseline,setRecordBaseline]=useState('')
  const beginRecord=next=>{setRecordBaseline(JSON.stringify(next));setForm(next)}
  const dismissRecord=()=>{if(JSON.stringify(form)===recordBaseline||window.confirm('关闭记录编辑？尚未保存的修改将放弃。'))setShowForm(false)}
  const [editing,setEditing]=useState(null)
  const formProjectId=projects.find(p=>p.name===form.project)?.id
  const formDeliverables=deliverables.filter(item=>item.projectId===formProjectId)
  const originalProject=records.find(record=>record.id===editing)?.project
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
      setImportData({name:file.name,...parsed,records:normalizeProjectRecords(parsed.records)})
    }catch(err){setImportError(err.message)}finally{setImportBusy(false)}
  }
  const canRestore=importPlan&&Boolean(importPlan.additions.length||importPlan.updates.length||importData.deliverables.length||(restoreSettings&&importData.settings))
  const restoreBackup=()=>{
    if(!canRestore)return
    const settings=restoreSettings?importData.settings:null
    let mergedWork
    try{
      mergedWork=mergeDeliverables(settings?.projects||projects,projects,deliverables,importData.settings?.projects||[],importData.deliverables,restoreSettings)
    }catch(err){setImportError(err.message);return}
    const projectNames=new Map(mergedWork.projects.map(p=>[p.id,p.name]))
    const linkedProjects=new Map(mergedWork.deliverables.map(item=>[item.id,projectNames.get(item.projectId)]))
    const merged=importPlan.merged.map(record=>{
      const project=linkedProjects.get(record.deliverableId)
      return project&&project!==record.project?{...record,project}:record
    })
    const nextCategories=includeCategories(settings?.categories||categories,merged)
    const nextProjects=includeProjects(mergedWork.projects,merged)
    const entries=[[KEY,merged],[CATEGORY_KEY,nextCategories],[PROJECT_KEY,nextProjects],[DELIVERABLE_KEY,mergedWork.deliverables]]
    if(settings){
      entries.push([GOAL_KEY,settings.goals],[REWARD_KEY,settings.rewards])
      if(settings.preferences)entries.push([PREFERENCES_KEY,settings.preferences])
      if(settings.todos)entries.push([TODO_KEY,settings.todos])
    }
    try{writeStorage(entries)}
    catch{setImportError('保存失败，浏览器存储空间不足或不可用；尚未恢复，请先导出当前记录。');return}
    if(settings){
      if(settings.preferences)setPreferences(settings.preferences)
      if(settings.todos)setTodos(settings.todos)
      setGoals(settings.goals);setRewards(settings.rewards);setGoalRevision(n=>n+1)
    }
    setCategories(nextCategories);setProjects(nextProjects);setRecords(merged);setDeliverables(mergedWork.deliverables)
    setImportMessage(`恢复完成：新增 ${importPlan.additions.length} 条，更新 ${importPlan.updates.length} 条，跳过 ${importPlan.duplicates+importPlan.fileDuplicates} 条重复记录，保留 ${importPlan.conflicts.length-importPlan.updates.length} 条当前版本。${restoreSettings&&importData.settings?'已恢复目标、奖励及备份中的待办设置。':''}`)
    setImportData(null);setShowImport(false)
  }
  useEffect(()=>localStorage.setItem(KEY,JSON.stringify(records)),[records])
  useEffect(()=>localStorage.setItem(CATEGORY_KEY,JSON.stringify(categories)),[categories])
  const showExamples=records.length===0&&date===today
  const examples=[
    {id:'example-work',title:'整理材料和撰写报告',date:today,start:'09:00',end:'10:00',category:workCategory(categories,'core').name,coreMinutes:45,project:'项目1'},
    {id:'example-study',title:'阅读与整理笔记',date:today,start:'10:15',end:'10:45',category:'学习成长'},
    {id:'example-walk',title:'午间散步',date:today,start:'12:30',end:'13:00',category:'健康运动'},
  ]
  const chartRecords=showExamples?examples:records
  const chartCategories=showExamples?includeCategories(categories,examples):categories
  const daily=useMemo(()=>segmentsForDay(records,date,categories),[records,date,categories])
  const total=daily.reduce((s,r)=>s+r.segmentMinutes,0)
  const research=daily.reduce((s,r)=>s+r.segmentCore,0)
  const auxiliary=daily.reduce((s,r)=>s+r.segmentAuxiliary,0)
  const gaps=useMemo(()=>calculateGaps(daily),[daily])
  const timelineGaps=splitHourly(gaps)
  const quickGapGroups=QUICK_GAP_PERIODS.map(period=>({
    label:period.label,
    gaps:gaps.flatMap(gap=>{
      const start=Math.max(gap.start,period.start)
      const end=Math.min(gap.end,period.end)
      return end>start?[{start,end}]:[]
    }),
  })).filter(group=>group.gaps.length>0)
  const quickGapMinutes=quickGapGroups.flatMap(group=>group.gaps).reduce((sum,gap)=>sum+gap.end-gap.start,0)
  const uncovered=gaps.reduce((s,g)=>s+g.end-g.start,0)
  const covered=DAY-uncovered
  const coreCategory=workCategory(categories,'core')
  const auxCategory=workCategory(categories,'research')
  const chartDay=showExamples?segmentsForDay(examples,date,chartCategories):daily
  const categoryData=[
    ...chartCategories.filter(c=>!['core','research'].includes(c.kind)).map(({name,color})=>({name,value:chartDay.filter(r=>r.category===name).reduce((sum,r)=>sum+r.segmentMinutes,0),color})),
    {name:coreCategory.name,value:chartDay.reduce((sum,r)=>sum+r.segmentCore,0),color:coreCategory.color},
    {name:auxCategory.name,value:chartDay.reduce((sum,r)=>sum+r.segmentAuxiliary,0),color:auxCategory.color},
  ].filter(x=>x.value)

  const openNew=(prefill=null,inline=false)=>{setInlineRecord(inline);setInlineAnchor({id:'new-log',start:prefill?.start||'09:00'});setEditing(null);setError('');beginRecord({...initialForm(date),id:crypto.randomUUID(),category:categories.find(c=>c.kind==='core')?.name||categories[0].name,project:UNASSIGNED_PROJECT,...prefill});setShowForm(true)}
  const edit=(r,inline=false)=>{setInlineRecord(inline);setInlineAnchor({id:r.id,start:timeLabel(r.segmentStart??(r.date<date?0:Number(r.start.slice(0,2))*60+Number(r.start.slice(3))))});setEditing(r.id);setError('');const {segmentCore,segmentAuxiliary,segmentStart,segmentEnd,segmentMinutes,continuesFromYesterday,continuesTomorrow,...original}=r;beginRecord({...original,coreMinutes:isResearch(original.category)?researchAllocation(original,categoryInfo(original.category)?.kind).core:''});setShowForm(true)}
  const save=e=>{
    e.preventDefault()
    if(!form.title.trim())return setError('请输入活动名称。')
    if(form.start===form.end)return setError('开始和结束时间不能相同。')
    if(categoryInfo(form.category)?.kind==='core'&&(form.coreMinutes===''||!Number.isInteger(Number(form.coreMinutes))||Number(form.coreMinutes)<0||Number(form.coreMinutes)>duration(form)))return setError(`请填写「${coreCategory.name}」的分钟数，必须是 0 到总时长之间的整数。`)
    const {planTaskChanges,...recordForm}=form
    const item={...recordForm,title:form.title.trim(),id:editing||form.id||crypto.randomUUID()}
    try{if(item.logTasks)item.logTasks=validateLogTasks(item.logTasks)}catch(e){return setError(e.message)}
    if(isResearch(item.category))item.coreMinutes=categoryInfo(item.category)?.kind==='core'?Number(form.coreMinutes):0;else delete item.coreMinutes
    if(!isResearch(item.category)||!formDeliverables.some(d=>d.id===item.deliverableId))delete item.deliverableId
    const candidate=absoluteInterval(item)
    const conflict=records.find(r=>r.id!==editing&&r.date&&r.start&&r.end&&candidate.start<absoluteInterval(r).end&&candidate.end>absoluteInterval(r).start)
    if(conflict)return setError(`与「${conflict.title}」（${conflict.date} ${conflict.start}–${conflict.end}）时间重叠，请调整后保存。`)
    if(planTaskChanges?.length){let next=preferences.plans||[];for(const change of planTaskChanges)next=next.map(p=>p.id===change.planId?assignPlanTask(p,change.taskId,change.status,item.id):p);savePlans(next)}
    setRecords(old=>editing?old.map(r=>r.id===editing?item:r):[...old,item]);setShowForm(false);setError('')
  }
  const remove=id=>{if(window.confirm('确定删除这条记录吗？'))setRecords(old=>old.filter(r=>r.id!==id))}
  const clearAllRecords=()=>{
    if(!records.length)return
    if(window.confirm(`确定删除所有日期的 ${records.length} 条活动记录吗？此操作无法撤销，未结算的奖励将重新计算。建议先导出备份。`))setRecords([])
  }
  const exportJSON=()=>{const blob=new Blob([JSON.stringify({version:'1.4',exportedAt:new Date().toISOString(),records:records.map(r=>({...r,categoryColor:categoryColor(r.category),categoryKind:categoryInfo(r.category)?.kind||'other'})),goals,rewards,categories,projects,deliverables,todos,preferences},null,2)],{type:'application/json'});const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=`time-recording-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  const addFromGap = gap => {
    const start=gap.start===DAY ? DAY-1 : gap.start
    const end=timeLabel(gap.end)
    openNew({date,start:timeLabel(start),end})
  }
  const currentStreak=useMemo(()=>calculateRewards(records,categories,goals,rewards,today).streak,[records,categories,goals,rewards,today])
  const datePicker=<RecordCalendar date={date} onChange={setDate} records={records} categories={categories}/>
  const recordsView= daily.length ? daily.map(r=><div className="record" key={`${r.id}-${r.segmentStart}`}><div className="record-time">{timeLabel(r.segmentStart)}<span>—</span>{r.segmentEnd===DAY?'24:00':timeLabel(r.segmentEnd)}</div><div className="record-main"><strong>{r.title}</strong><div><span className="dot" style={{background:categoryColor(r.category)}}/>{r.category}{r.project&&isResearch(r.category)?` · ${r.project}`:''}{deliverableById.has(r.deliverableId)?` · ${deliverableById.get(r.deliverableId).name}`:''}{isResearch(r.category)?` · ${coreCategory.name} ${r.segmentCore} 分 / ${auxCategory.name} ${r.segmentAuxiliary} 分`:''}{r.continuesFromYesterday?' · 昨日开始':''}{r.continuesTomorrow?' · 延续至次日':''}</div></div><div className="record-duration">{pretty(r.segmentMinutes)}</div><button title="编辑" className="icon-btn" onClick={()=>edit(r)}><Pencil size={15}/></button><button title="删除" className="icon-btn" onClick={()=>remove(r.id)}><Trash2 size={15}/></button></div>) : <div className="empty">还没有记录。点击右上角「添加记录」开始吧。</div>
  const recordTimeFields = (
    <div className="form-row record-time-row">
      <label>开始时间<TemporalInput required type="time" value={form.start} onChange={e=>{
        const start=e.target.value
        setForm(current=>withStartTime(current,start))
        setError('')
      }}/></label>
      <label>结束时间<TemporalInput required type="time" disabled={form.end==='24:00'} value={form.end==='24:00'?'00:00':form.end} onChange={e=>{setForm({...form,end:e.target.value});setError('')}}/></label>
    </div>
  )
  const recordEditor=(<div className="modal fixed-action-modal"><div className="modal-header"><h2>{editing?'编辑记录':'添加时间记录'}</h2><button className="close" onClick={()=>setShowForm(false)}>✕</button></div><form onSubmit={save}><div className="modal-scroll-body"><label>活动名称<input autoFocus required placeholder="例如：阅读文献或整理笔记" value={form.title} onChange={e=>{setForm({...form,title:e.target.value});setError('')}}/></label><label>日期（活动开始的日期）<TemporalInput required type="date" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setError('')}}/></label>{recordTimeFields}<label className="midnight-option"><input type="checkbox" checked={form.end==='24:00'} onChange={e=>{setForm({...form,end:e.target.checked?'24:00':'00:00'});setError('')}}/>结束于当日 24:00（次日零点）</label><div className="duration-preview">自动计算时长：{form.start===form.end?'请设置不同的开始与结束时间':pretty(duration(form))} {form.end<form.start?' · 跨午夜，自动分配到两天':''}</div><label>分类<select value={form.category} onChange={e=>{const category=e.target.value;setForm({...form,category,coreMinutes:categoryInfo(category)?.kind==='core'?'':0,...(!isResearch(category)?{deliverableId:''}:{})});setError('')}}>{categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label>{isResearch(form.category)&&<label>项目<select value={form.project||UNASSIGNED_PROJECT} onChange={e=>setForm({...form,project:e.target.value,deliverableId:''})}>{projects.filter(p=>!p.archived||p.name===originalProject).map(p=><option key={p.id} value={p.name}>{p.name}{p.archived?'（已归档）':''}</option>)}</select></label>}
 {isResearch(form.category)&&formDeliverables.length>0&&<label>交付项（可选）<select value={form.deliverableId||''} onChange={e=>setForm({...form,deliverableId:e.target.value})}>
  <option value="">仅记录到项目</option>{formDeliverables.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
 </select></label>}{categoryInfo(form.category)?.kind==='core'&&<><label>其中{coreCategory.name}（分钟）<input aria-label={`${coreCategory.name}分钟数`} required type="number" min="0" max={duration(form)} step="1" placeholder="例如：45" value={form.coreMinutes??''} onChange={e=>{setForm({...form,coreMinutes:e.target.value});setError('')}}/></label><div className="duration-preview">总工作 {duration(form)} 分钟 · {coreCategory.name} {form.coreMinutes===''?'待填写':form.coreMinutes} 分钟 · {auxCategory.name} {form.coreMinutes===''?'待计算':Math.max(0,duration(form)-Number(form.coreMinutes))} 分钟。跨午夜时按每天时长比例分配。</div></>}{categoryInfo(form.category)?.kind==='research'&&<div className="duration-preview">全部 {duration(form)} 分钟计入辅助工作。</div>}<label>备注（可选）<textarea rows="2" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>{error&&<div className="form-error" role="alert">{error}</div>}</div><div className="actions"><button type="button" className="secondary" onClick={()=>setShowForm(false)}>取消</button><button className="primary" type="submit">保存记录</button></div></form></div>)
  const saveLogTasks=(id,tasks)=>{validateLogTasks(tasks);setRecords(old=>old.map(r=>r.id===id?{...r,logTasks:tasks}:r))}
  const logTaskStatus=(plan,task)=>{const status={pending:'done',done:'cancelled',cancelled:'pending'}[task.status];setForm(old=>({...old,planTaskChanges:[...(old.planTaskChanges||[]).filter(c=>c.planId!==plan.id||c.taskId!==task.id),{planId:plan.id,taskId:task.id,status}]}))}
  const logPlans=(preferences.plans||[]).filter(p=>planOverlapsRecord(p,form)).map(p=>(form.planTaskChanges||[]).filter(c=>c.planId===p.id).reduce((plan,c)=>assignPlanTask(plan,c.taskId,c.status,form.id),p))
  const logPlan=logPlans[0]
  const compactRecordEditor=(<div className="modal fixed-action-modal planlog-compact-log"><form onSubmit={save}><div className="planlog-unified-heading"><input autoFocus aria-label="活动名称" required maxLength={160} placeholder="活动名称" value={form.title} onChange={e=>{setForm({...form,title:e.target.value});setError('')}}/><button type="button" className="icon-btn" aria-label="关闭记录" onClick={dismissRecord}>✕</button></div><div className="modal-scroll-body"><details className="planlog-meta-disclosure"><summary aria-label="展开记录时间与关联设置"><span>{Number(form.date.slice(5,7))}月{Number(form.date.slice(8))}日 · {form.start}–{form.end}</span><span className="planlog-meta-tag">{form.category}</span>{isResearch(form.category)&&form.project&&<span className="planlog-meta-tag">{form.project}</span>}{form.deliverableId&&<span className="planlog-meta-tag">{deliverableById.get(form.deliverableId)?.name}</span>}<Pencil size={13}/></summary><div className="planlog-log-meta-expanded"><label>日期（活动开始的日期）<TemporalInput required type="date" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setError('')}}/></label>{recordTimeFields}<div className="planlog-duration-row"><div className="duration-preview">自动计算时长：{form.start===form.end?'请设置不同的开始与结束时间':pretty(duration(form))} {form.end<form.start?' · 跨午夜，自动分配到两天':''}</div><label className="midnight-option"><input type="checkbox" checked={form.end==='24:00'} onChange={e=>{setForm({...form,end:e.target.checked?'24:00':'00:00'});setError('')}}/>结束于当日 24:00（次日零点）</label></div><label>分类<select value={form.category} onChange={e=>{const category=e.target.value;setForm({...form,category,coreMinutes:categoryInfo(category)?.kind==='core'?'':0,...(!isResearch(category)?{deliverableId:''}:{})});setError('')}}>{categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label>{isResearch(form.category)&&<label>项目<select value={form.project||UNASSIGNED_PROJECT} onChange={e=>setForm({...form,project:e.target.value,deliverableId:''})}>{projects.filter(p=>!p.archived||p.name===originalProject).map(p=><option key={p.id} value={p.name}>{p.name}{p.archived?'（已归档）':''}</option>)}</select></label>}
 {isResearch(form.category)&&formDeliverables.length>0&&<label>交付项（可选）<select value={form.deliverableId||''} onChange={e=>setForm({...form,deliverableId:e.target.value})}>
  <option value="">仅记录到项目</option>{formDeliverables.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
 </select></label>}</div></details><p className="duration-preview">实际时长：{pretty(duration(form))}{form.end<form.start?' · 跨午夜':''}</p>{categoryInfo(form.category)?.kind==='core'&&<><label>其中{coreCategory.name}（分钟）<input aria-label={`${coreCategory.name}分钟数`} required type="number" min="0" max={duration(form)} step="1" placeholder="例如：45" value={form.coreMinutes??''} onChange={e=>{setForm({...form,coreMinutes:e.target.value});setError('')}}/></label><div className="duration-preview">总工作 {duration(form)} 分钟 · {coreCategory.name} {form.coreMinutes===''?'待填写':form.coreMinutes} 分钟 · {auxCategory.name} {form.coreMinutes===''?'待计算':Math.max(0,duration(form)-Number(form.coreMinutes))} 分钟。跨午夜时按每天时长比例分配。</div></>}{categoryInfo(form.category)?.kind==='research'&&<div className="duration-preview">全部 {duration(form)} 分钟计入辅助工作。</div>}<div className={`planlog-log-content${logPlan?" has-plan":""}`}>{logPlan&&<div className="planlog-log-references">{logPlans.map(logPlan=><section key={logPlan.id} className="planlog-log-reference" aria-label="关联计划参考"><h3>PLAN · {logPlan.title}</h3><div className="planlog-log-reference-grid"><section><h4>待办清单</h4>{logPlan.tasks.length?<ul>{tasksForLog(logPlan,form.id,records).map(task=><li key={task.id} className={task.status==='done'?'planlog-task-done':task.status==='cancelled'?'planlog-task-cancelled':''}><button type="button" className="planlog-task-toggle" aria-label={`计划待办 ${task.text}：${task.status}`} onClick={()=>logTaskStatus(logPlan,task)}>{task.status==='done'?'✓':''}</button> {task.text}</li>)}</ul>:<p>暂无待办</p>}</section><section><h4>计划笔记</h4><p>{logPlan.notes||'暂无笔记'}</p></section></div></section>)}</div>}<div className="planlog-log-work"><LogTasks tasks={form.logTasks} onChange={tasks=>setForm({...form,logTasks:tasks})}/><label className="planlog-log-note"><textarea aria-label="实际记录备注" rows={5} placeholder="记录实际进展、遇到的问题或补充说明" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label></div></div>{error&&<p className="form-error" role="alert">{error}</p>}</div><div className="actions"><button type="button" className="secondary" onClick={dismissRecord}>取消</button><button type="submit" className="primary">保存</button></div></form></div>)

  return <div className="app"><aside className="sidebar"><div className="brand"><span className="brand-icon">◷</span><div><strong>时间账本</strong><small>记录时间，观察生活 · <button type="button" className="guide-link" onClick={()=>setShowGuide(true)}>使用指南</button><span className="sidebar-account account-indicator"><button type="button" className="account-status-link" aria-label={cloudSync.session?"已登录，打开账号与云同步":"未登录，打开登录或注册"} onClick={()=>setShowAccount(true)}>{cloudSync.session?'（已登录）':'（未登录）'}</button></span></small></div></div><nav>{[['today',Clock3,'今日概览'],['planlog',Columns3,'今日计划'],['history',CalendarDays,'周月计划'],['stats',ChartNoAxesCombined,'统计分析'],['deliverables',ClipboardList,'交付任务'],['rewards',PiggyBank,'心愿奖励']].map(([id,Icon,label])=><button key={id} className={`nav-btn ${tab===id?'active':''}`} onClick={()=>{if(id==='deliverables')openDeliverables(null);else setTab(id)}}><Icon size={18}/>{label}</button>)}<div className="management-settings">
    <button type="button" className="nav-btn management-toggle" aria-expanded={managementOpen} aria-controls="management-links" onClick={()=>setManagementOpen(open=>!open)}>
      <Settings size={18} aria-hidden="true"/>管理设置<ChevronDown size={14} aria-hidden="true"/>
    </button>
    <div id="management-links" className="management-links" hidden={!managementOpen}>
      <button className="nav-btn" onClick={()=>setShowCategories(true)}>分类管理</button>
      <button className="nav-btn" onClick={()=>setShowProjects(true)}>项目管理</button>
      <button className="nav-btn" onClick={exportJSON}>一键导出</button>
      <button className="nav-btn" onClick={()=>setShowAccount(true)}>账号与云同步</button>
    </div>
  </div></nav><div className="sidebar-bottom">{cloudSync.enabled?'本地保存 · 云同步已启用':'本地保存 · 云同步未启用'}<br/>{cloudSync.preview?'同步有待确认内容，请打开账号与云同步':'建议定期导出备份'}</div></aside>
  <main className="main"><header><div><div className="eyebrow">PERSONAL TIME JOURNAL · V3.5</div><h1>{tab==='today'?'今日概览':tab==='planlog'?'今日计划':tab==='stats'?'统计分析':tab==='rewards'?'心愿奖励':tab==='deliverables'?'交付任务':'周月计划'}</h1><EditableSubtitle value={preferences.subtitle} onSave={savePreferences}/>{tab==='today'&&currentStreak>0&&<p className="streak-banner" role="status">已连续达标{currentStreak}天！</p>}</div><div className="header-controls"><div className="backup-actions">{tab==='rewards'&&<button className="secondary" onClick={()=>setShowRewardRules(true)}>查看规则</button>}{!(tab==='history'&&historyView==='week')&&<button className="primary" onClick={()=>openNew()}><Plus size={18}/> 添加记录</button>}</div></div></header>
  {showAccount&&<CloudAccount sync={cloudSync} onClose={()=>setShowAccount(false)}/>}
  {cloudSync.externalChange&&<div className="overlay" style={{zIndex:1000}}><section className="modal" role="alertdialog" aria-label="另一标签页已更新账本"><h2>另一标签页已更新账本</h2><p>请刷新此页载入最新内容，避免旧页面覆盖新数据。尚未保存的表单输入会在刷新后丢失。</p><button className="primary" onClick={()=>window.location.reload()}>刷新并载入最新账本</button></section></div>}
  {showGuide&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setShowGuide(false)}}><section className="modal category-modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" onKeyDown={e=>{if(e.key==='Escape')setShowGuide(false)}}>
    <div className="modal-header"><h2 id="guide-title">使用指南</h2><button autoFocus className="close" aria-label="关闭使用指南" onClick={()=>setShowGuide(false)}>✕</button></div>
    <p>这个时间账本受柳比歇夫时间记录法启发。记下每项活动实际花了多久，再回顾时间用在了哪里，帮助你调整接下来的安排。</p>
    <ol className="guide-steps">
      <li><h3>记下第一条活动</h3><p>在「今日概览」点「添加记录」，填写活动名称、起止时间，再选择分类。</p><figure><figcaption>记录示例</figcaption><div className="guide-example"><strong>整理材料和撰写报告</strong><span>09:00 – 10:00 · {coreCategory.name}</span></div></figure></li>
      <li><h3>拆分重点工作</h3><p>如果这一小时里有 45 分钟用来做直接推进目标的工作，就填 45 分钟「{coreCategory.name}」。余下的 15 分钟自动计入「{auxCategory.name}」。两项都可以在「分类管理」中改名。</p><figure><figcaption>60 分钟如何分配</figcaption><div className="guide-split" aria-hidden="true"><span style={{background:coreCategory.color}}/><span style={{background:auxCategory.color}}/></div><div className="guide-example"><span>{coreCategory.name} · 45 分钟</span><span>{auxCategory.name} · 15 分钟</span></div></figure></li>
      <li><h3>回顾时间分配</h3><p>「今日计划」安排当天时间块并对照实际记录；「周月计划」查看日历、安排日程与 DDL，在日视图查看具体活动。「统计分析」可查看近 7 天或整月的分类用时趋势、项目投入，以及睡眠作息和每日启动时间；通过下拉菜单选择要比较的分类。</p><div className="guide-example" aria-label="回顾入口"><span>周月计划 → 日视图查看具体条目</span><span>统计分析 → 观察投入与作息规律</span></div></li>
      <li><h3>备份与恢复</h3>
        <ul className="guide-backup-options">
          <li><strong>云端备份：</strong>打开「管理设置 → 账号与云同步」，登录并按提示启用加密同步，保存好加密口令与恢复密钥。换设备时登录同一账号，用原加密口令解锁即可同步账本；需要手动更新时，点击「检查更新」。</li>
          <li><strong>本地备份：</strong>点击「管理设置 → 一键导出」保存 JSON 文件。恢复时，到「周月计划 → 日视图 → 导入 JSON」选择备份并确认；如需一起恢复打卡项目、打卡记录、奖励规则等设置，勾选「同时恢复目标、奖励、待办与个性化设置」。</li>
        </ul>
      </li>
    </ol>
    <p>熟悉记录后，可以在首页设置每日工作目标和待办，用「快捷打卡」记录习惯完成次数与每周进度，也可以在「心愿奖励」设置与查看奖励规则。有明确成果或截止时间的任务，还可以用「交付任务」管理，并关联时间记录。</p>
    <div className="actions"><button className="primary" onClick={()=>{setShowGuide(false);openNew()}}>添加第一条记录</button></div>
  </section></div>}
  {showRewardRules&&tab==='rewards'&&<RewardRules categories={categories} state={rewards} today={today} onClose={()=>setShowRewardRules(false)}/>}
  {tab==='today'&&<>
   <div className="topline overview-date-toolbar">
    <div className="overview-date-controls">
     <button type="button" className="secondary" onClick={()=>setDate(localDate())}>回到今天</button>
     <div className="overview-date-stepper">
      <button type="button" className="icon-btn" aria-label="前一天" title="前一天" onClick={()=>setDate(day=>shiftDate(day,-1))}>
       <ChevronLeft size={17}/>
      </button>
      {datePicker}
      <button type="button" className="icon-btn" aria-label="后一天" title="后一天" onClick={()=>setDate(day=>shiftDate(day,1))}>
       <ChevronRight size={17}/>
      </button>
     </div>
    </div>
   </div>
   <section className="metrics overview-metrics">
    <div className="metric">
     <span><Clock3 size={17}/> 已记录时间</span>
     <strong>{pretty(total)}</strong>
     <small>当日覆盖率 {Math.round(covered/DAY*100)}%</small>
    </div>
    <div className="metric"><span><BriefcaseBusiness size={17}/> {coreCategory.name}</span><strong>{pretty(research)}</strong><small>占已记录时间 {total?Math.round(research/total*100):0}%</small></div>
    <DailyGoal key={`${date}-${goalRevision}`} date={date} minutes={research+auxiliary} onGoalsChange={setGoals}/>
   </section>
   <section className="card overview-activities">
    <div className="card-title"><h2>当日活动</h2><span>{showExamples?'3 条示例':`${daily.length} 段活动`}</span></div>
    <div className="overview-timeline">
     <div className="overview-timeline-heading"><h3>24 小时时间轴</h3><span>点击空档补录</span></div>
     <div className="timeline-bar">
      {daily.map(r=><div key={`${r.id}-${r.segmentStart}`} title={`${r.title} · ${timeLabel(r.segmentStart)}–${timeLabel(r.segmentEnd)}`} className="timeline-piece"
       style={{left:`${r.segmentStart/DAY*100}%`,width:`${r.segmentMinutes/DAY*100}%`,background:categoryColor(r.category)}}/>)}
      {timelineGaps.map(g=><button key={g.start} title={`补录 ${timeLabel(g.start)}–${g.end===DAY?'24:00':timeLabel(g.end)}`} className="timeline-gap"
       style={{left:`${g.start/DAY*100}%`,width:`${(g.end-g.start)/DAY*100}%`}} onClick={()=>addFromGap(g)}/>)}
     </div>
     <div className="timeline-ticks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
     {quickGapGroups.length>0&&<details className="overview-gap-details" key={date}>
      <summary><ChevronDown size={14}/> 待补录 {pretty(quickGapMinutes)}</summary>
      <div className="overview-gap-groups">
       {quickGapGroups.map(group=><div key={group.label} className="overview-gap-group" role="group" aria-label={group.label}>
        <h4>{group.label}</h4>
        <div className="gap-list">
         {group.gaps.map(gap=><button key={gap.start} className="gap-button" onClick={()=>addFromGap(gap)}>
          <Plus size={13}/>{timeLabel(gap.start)} – {timeLabel(gap.end)} · {pretty(gap.end-gap.start)}
         </button>)}
        </div>
       </div>)}
      </div>
     </details>}
    </div>
    {showExamples?<><p className="import-help">示例预览。添加或导入自己的记录后，这些示例会隐藏。</p>{examples.map(example=><div className="record" key={example.title}><div className="record-time">{example.start}–{example.end}</div><div className="record-main"><strong>{example.title}</strong><div>{example.coreMinutes!=null?`${coreCategory.name} 45 分 · ${auxCategory.name} 15 分`:`${example.category} · 30 分`}</div></div></div>)}</>:recordsView}
   </section>
   <div className="grid overview-support">
    <TodoList key={date} date={date} items={todos[date]||[]} onChange={saveTodos}/>
    <section className="card"><div className="card-title"><h2>当日时间分布</h2><span>{showExamples?'示例预览':'按分类'}</span></div>{categoryData.length?<><div className="donut"><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={67} outerRadius={93} paddingAngle={3}>{categoryData.map(x=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip contentStyle={{backgroundColor:"rgba(20, 28, 45, .91)",border:"1px solid rgba(150, 165, 195, .32)",borderRadius:10,boxShadow:"0 6px 18px #0004",backdropFilter:"blur(6px)",color:"#e8ecf5"}} labelStyle={{color:"#e8ecf5"}} formatter={v=>pretty(v)}/></PieChart></ResponsiveContainer></div><div className="legend">{categoryData.map(x=><div key={x.name}><span className="dot" style={{background:x.color}}/>{x.name}<b>{pretty(x.value)}</b></div>)}</div></>:<div className="empty">添加记录后自动显示分类图表</div>}</section>
   </div>
   <Checkins categories={categories} data={preferences.checkins} date={date} today={localDate()} onChange={saveCheckins}/>
  </>}
  {tab==='planlog'&&<>
   <div className="topline overview-date-toolbar">
    <div className="overview-date-controls"><button className="secondary" onClick={()=>setDate(localDate())}>回到今天</button>{datePicker}</div>
   </div>
   <div className="grid planlog-prep">
    <DailyGoal key={`plan-${date}-${goalRevision}`} date={date} minutes={research+auxiliary} onGoalsChange={setGoals}/>
    <TodoList key={`plan-${date}`} date={date} items={todos[date]||[]} viewFirst onChange={saveTodos}/>
   </div>
   <PlanLog openRequest={calendarPlanRequest} onRequestHandled={()=>setCalendarPlanRequest(null)} date={date} today={today} plans={preferences.plans} records={records} daily={daily} categories={categories} projects={projects} deliverables={deliverables} onChange={savePlans} onLogTasks={saveLogTasks} onLog={prefill=>openNew(prefill,true)} onEditLog={r=>edit(r,true)} recordEditor={showForm&&inlineRecord?compactRecordEditor:null} recordAnchor={showForm&&inlineRecord?inlineAnchor:null} onDismissRecord={dismissRecord}/>
  </>}
  {tab==='stats'&&<><div className="topline overview-date-toolbar">{datePicker}</div>{showExamples&&<p className="import-help">示例预览。添加或导入自己的记录后，图表会显示真实数据。</p>}<div className="grid"><CategoryTrend records={chartRecords} categories={chartCategories} date={date} segmentsForDay={segmentsForDay}/><section className="card"><div className="card-title"><h2>所选日期的分类分布</h2></div>{categoryData.length?<><div className="donut"><ResponsiveContainer width="100%" height={245}><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95}>{categoryData.map(x=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip contentStyle={{backgroundColor:"rgba(20, 28, 45, .91)",border:"1px solid rgba(150, 165, 195, .32)",borderRadius:10,boxShadow:"0 6px 18px #0004",backdropFilter:"blur(6px)",color:"#e8ecf5"}} labelStyle={{color:"#e8ecf5"}} formatter={v=>pretty(v)}/></PieChart></ResponsiveContainer></div><div className="legend">{categoryData.map(x=><div key={x.name}><span className="dot" style={{background:x.color}}/>{x.name}<b>{pretty(x.value)}</b></div>)}</div></>:<div className="empty">该日期暂无数据</div>}</section></div><div className="grid routine-grid"><RoutineTrend type="sleep" records={records} categories={categories} date={date} settings={preferences.routine} onSettingsChange={saveRoutineSettings}/><RoutineTrend type="work" records={records} categories={categories} goals={goals} date={date} settings={preferences.routine} onSettingsChange={saveRoutineSettings}/></div><ProjectStats records={chartRecords} categories={chartCategories} projects={projects} date={date}/></>}
  {tab==='deliverables'&&<>
    {deliveryProjectId&&<button className="secondary" onClick={()=>setDeliveryProjectId(null)}>查看所有项目</button>}
    <p className="import-help">按项目管理交付项。截止时间、阶段成果和完成时间按本机时区显示。</p>
    <div className="category-list">
      {deliveryProjects.map(project=><DeliverableEditor key={project.id} project={project}
        items={deliverables.filter(item=>item.projectId===project.id)} records={records} onChange={saveDeliverable} onRemove={removeDeliverable}/>)}
      {!deliveryProjects.length&&<section className="card"><p>先创建一个项目，再添加交付项。</p><button className="secondary" onClick={()=>setShowProjects(true)}>打开项目管理</button></section>}
    </div>
  </>}
  {tab==='rewards'&&<Rewards records={records} categories={categories} goals={goals} state={rewards} onSave={saveRewards} today={localDate()} onBackup={exportJSON}/>}
  {tab==='history'&&<HistoryCalendar onViewChange={setHistoryView} date={date} onDateChange={setDate} events={preferences.calendarEvents} onEventsChange={saveCalendarEvents} plans={preferences.plans} records={records} categories={categories} projects={projects} deliverables={deliverables} onOpenDeliverable={d=>openDeliverables(d.projectId)} onDeliverableChange={saveDeliverable} onPlansChange={savePlans}><section className="card"><div className="card-title history-list-title"><h2>{date} · 活动清单</h2><div className="backup-actions"><button className="secondary" onClick={()=>{setShowImport(true);setImportData(null);setRestoreSettings(false);setImportChoices({});setImportError('');setImportMessage('')}}>导入 JSON</button><button className="secondary" onClick={exportJSON}><Download size={16}/> 导出全部 JSON</button></div></div>{recordsView}<div className="actions"><button type="button" className="guide-link clear-records-link" disabled={!records.length} onClick={clearAllRecords}>清除所有记录</button></div></section></HistoryCalendar>}
  {importMessage&&<p className="import-message" role="status">{importMessage}</p>}
  <footer>Time Recording · Local-first · 本地保存，可启用加密云同步</footer></main>
  {showProjects&&<ProjectManager projects={projects} deliverables={deliverables} records={records} onSave={saveProjects} onOpenDeliverables={openDeliverables} onClose={()=>setShowProjects(false)}/>}
  {showCategories&&<CategoryManager categories={categories} records={records} onSave={saveCategories} onClose={()=>setShowCategories(false)}/>}
  {showImport&&<div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-header"><h2 id="import-title">导入 JSON 备份</h2><button className="close" aria-label="关闭导入" disabled={importBusy} onClick={()=>setShowImport(false)}>✕</button></div><p className="import-help">按记录 ID 合并。相同 ID 且内容一致时跳过；内容不同时可逐条选择版本，默认保留当前记录。备份内重复 ID 保留第一条。确认前不会修改数据；本次合并不会删除记录。</p><label className="backup-file">选择 JSON 备份文件<input type="file" accept=".json,application/json" disabled={importBusy} onChange={readBackup}/></label>{importBusy&&<p role="status">正在校验…</p>}{importError&&<p className="form-error" role="alert">{importError}</p>}{importData&&importPlan&&<div className="import-preview"><p>文件：{importData.name}</p><p>校验通过：{importData.records.length} 条记录{importData.deliverables.length?`、${importData.deliverables.length} 个交付项`:''}</p>{importData.settings&&<section className="settings-restore"><p>完整备份还包含 {Object.keys(importData.settings.goals).length} 天目标、{importData.settings.rewards.wishlist.length} 个心愿、{importData.settings.rewards.redemptions.length} 条兑换及 {importData.settings.rewards.restDays.length} 个休息日{importData.settings.todos?`、${Object.values(importData.settings.todos).reduce((n,items)=>n+items.length,0)} 条待办`:""}。</p><label><input type="checkbox" checked={restoreSettings} onChange={e=>setRestoreSettings(e.target.checked)}/>同时恢复目标、奖励、待办与个性化设置（覆盖当前目标、心愿、兑换、休息日及备份中的分类、项目和待办）</label><p className="import-help">默认合并记录和交付项，保留同 ID 的当前交付项。勾选后，同 ID 的交付项及奖励设置以备份为准。建议先导出当前完整备份。</p></section>}<p>当前已有：{records.length} 条 · 将新增：{importPlan.additions.length} 条 · 相同内容跳过：{importPlan.duplicates} 条 · 内容冲突：{importPlan.conflicts.length} 条 · 将更新：{importPlan.updates.length} 条</p>{importPlan.fileDuplicates>0&&<p>备份内重复 ID：{importPlan.fileDuplicates} 条，保留第一条。</p>}{importPlan.conflicts.length>0&&<section className="import-conflicts"><h3>选择冲突记录的版本</h3><p>备份没有可靠的修改时间，请核对后选择。</p><div className="backup-actions"><button className="secondary" onClick={()=>setImportChoices(Object.fromEntries(importPlan.conflicts.map(c=>[c.current.id,'incoming'])))}>全部使用备份版本</button><button className="secondary" onClick={()=>setImportChoices({})}>全部保留当前版本</button></div>{importPlan.conflicts.map(({current,incoming})=><div className="import-conflict" key={current.id}><strong>{current.title}</strong><p>当前：{current.date} {current.start}–{current.end} · {current.title} · {current.category}{current.project?` · ${current.project}`:''}{current.deliverableId?` · 交付项：${deliverableById.get(current.deliverableId)?.name||current.deliverableId}`:''}{current.coreMinutes!=null?` · 核心 ${current.coreMinutes} 分钟`:''}{current.note?` · 备注：${current.note}`:''}</p><p>备份：{incoming.date} {incoming.start}–{incoming.end} · {incoming.title} · {incoming.category}{incoming.project?` · ${incoming.project}`:''}{incoming.deliverableId?` · 交付项：${importData.deliverables.find(d=>d.id===incoming.deliverableId)?.name||incoming.deliverableId}`:''}{incoming.coreMinutes!=null?` · 核心 ${incoming.coreMinutes} 分钟`:''}{incoming.note?` · 备注：${incoming.note}`:''}</p><label>恢复版本<select aria-label={`恢复版本 ${current.id}`} value={importChoices[current.id]||'current'} onChange={e=>setImportChoices(old=>({...old,[current.id]:e.target.value}))}><option value="current">保留当前版本</option><option value="incoming">使用备份版本</option></select></label></div>)}</section>}{importPlan.overlaps&&<p className="import-warning">合并后的记录存在时间重叠。恢复会保留这些记录，请在恢复后检查时间轴。</p>}{!importPlan.additions.length&&!importPlan.updates.length&&<p>当前选择没有需要新增或更新的记录。</p>}</div>}<div className="actions"><button className="secondary" disabled={importBusy} onClick={()=>setShowImport(false)}>取消</button><button className="primary" disabled={importBusy||!canRestore} onClick={restoreBackup}>确认恢复</button></div></section></div>}
  {showForm&&!(tab==='planlog'&&inlineRecord)&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}>{recordEditor}</div>}</div>
}
export default App
