import {useEffect,useRef,useState} from 'react'
import {canChangeCurrency,money,rewardRule,scheduleRewardRule,shiftDay} from './rewards.js'

export default function RewardWizard({state,summary,today,onSave,onClose}){
 const current=state.pending?.rule||rewardRule(state,today)
 const currencyEditable=canChangeCurrency(state,summary)
 const [fields,setFields]=useState({currency:current.currency,price:'',hours:'',weeks:'',weeklyHours:'',method:'hours',coreBonus:String(current.coreBonus),streakStep:String(current.streakStep),streakMax:String(current.streakMax),coupon:!!current.couponMinimum,minimum:state.rule||state.pending?String(current.couponMinimum/100):'',couponPercent:String(current.couponPercent)})
 const [preview,setPreview]=useState(null),[error,setError]=useState('')
 const dialog=useRef(null)
 useEffect(()=>{dialog.current.showModal()},[])
 const update=(key,value)=>{setFields(old=>({...old,[key]:value}));setPreview(null);setError('')}
 const amount=(key,label,min,max,step='any')=><label>{label}<input type="number" required min={min} max={max} step={step} value={fields[key]} onChange={e=>update(key,e.target.value)}/></label>
 const calculate=e=>{
  e.preventDefault()
  const hours=fields.method==='hours'?Number(fields.hours):Number(fields.weeks)*Number(fields.weeklyHours)
  const price=Math.round(Number(fields.price)*100),rate=Math.round(price/hours)
  const streakStep=Number(fields.streakStep),streakMax=Number(fields.streakMax)
  const couponMinimum=fields.coupon?Math.round((fields.minimum===''?Number(fields.price)*10:Number(fields.minimum))*100):0
  if(!Number.isSafeInteger(rate)||rate<1||rate>100000000)return setError('计算出的每小时额度超出可用范围，请调整价格或时长。')
  if(streakStep>streakMax)return setError('连续达标的单日增幅不能超过上限。')
  if(couponMinimum>100000000)return setError('年度券门槛不能超过 1,000,000。')
  const rule={currency:fields.currency,rate,coreBonus:Number(fields.coreBonus),streakStep,streakMax,couponMinimum,couponPercent:Number(fields.couponPercent)}
  setPreview({rule,price,date:currencyEditable?today:shiftDay(today,1)})
 }
 const format=cents=>money(cents,fields.currency)
 return <dialog ref={dialog} className="modal reward-rules" aria-labelledby="wizard-title" onClose={onClose}>
  <div className="modal-header"><h2 id="wizard-title">设置奖励规则</h2><form method="dialog"><button className="close" aria-label="关闭设置">✕</button></form></div>
  <form onSubmit={calculate}>
   <label>1. 你用什么币种记录心愿价格？
    <select value={fields.currency} disabled={!currencyEditable} onChange={e=>update('currency',e.target.value)}><option value="USD">美元（USD）</option><option value="CNY">人民币（CNY）</option></select>
   </label>
   {amount('price','2. 选一件参考物品，它大约多少钱？',0.01,1000000,'0.01')}
   <label>3. 你希望投入多少时间后兑换？<select value={fields.method} onChange={e=>update('method',e.target.value)}><option value="hours">按总小时数</option><option value="weeks">按每周时长和周数</option></select></label>
   {fields.method==='hours'?amount('hours','总投入小时数',0.1,100000):<div className="form-row">{amount('weeklyHours','每周小时数',0.1,168)}{amount('weeks','计划积累周数',0.1,520)}</div>}
   <p>4. 你想额外鼓励什么？填 0 可关闭对应加成。</p>
   {amount('coreBonus','核心工作加成（%）',0,100,'1')}
   <div className="form-row">{amount('streakStep','连续达标每天增加（%）',0,100,'1')}{amount('streakMax','连续达标加成上限（%）',0,100,'1')}</div>
   <label className="midnight-option"><input type="checkbox" checked={fields.coupon} onChange={e=>update('coupon',e.target.checked)}/>5. 开启年度大件奖励券</label>
   {fields.coupon&&<div className="form-row"><label>大件价格门槛<input type="number" min="0.01" max="1000000" step="0.01" placeholder="默认参考价的 10 倍" value={fields.minimum} onChange={e=>update('minimum',e.target.value)}/></label>{amount('couponPercent','用券后所需原价比例（%）',1,100,'1')}</div>}
   <button type="submit" className="secondary">预览规则</button>
  </form>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {preview&&<section className="settings-restore" aria-label="奖励规则预览">
   <h3>规则预览</h3>
   <p>生效日 {preview.date} · 当前累计保留 {money(summary.earned,rewardRule(state,today).currency)} · 可用余额 {money(summary.balance,rewardRule(state,today).currency)}</p>
   <p>辅助工作 {format(preview.rule.rate)}／小时，核心工作 {format(preview.rule.rate*(1+preview.rule.coreBonus/100))}／小时。</p>
   <p>未计连续加成时，参考物品约需 {(preview.price/preview.rule.rate).toFixed(1)} 小时辅助工作，核心与辅助各半时约需 {(preview.price/(preview.rule.rate*(1+preview.rule.coreBonus/200))).toFixed(1)} 小时。</p>
   <p>连续达标每天增加 {preview.rule.streakStep}%，最高 {preview.rule.streakMax}%。{preview.rule.couponMinimum?`年度券门槛 ${format(preview.rule.couponMinimum)}，用券后需原价的 ${preview.rule.couponPercent}%。`:'年度券关闭。'}</p>
   <button type="button" className="primary" onClick={()=>{try{if(onSave(scheduleRewardRule(state,summary,today,preview.rule)))onClose();else setError('保存失败，请刷新后重试。')}catch(err){setError(err.message)}}}>确认应用规则</button>
  </section>}
 </dialog>
}
