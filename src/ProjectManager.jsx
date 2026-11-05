import {GripVertical} from 'lucide-react'
import {useState} from 'react'
import {migrateProjects,UNASSIGNED_PROJECT} from './projects.js'
export default function ProjectManager({projects,records,onSave,onClose}){
 const [draft,setDraft]=useState(()=>projects.map(p=>({...p})))
 const [replacements,setReplacements]=useState({}),[error,setError]=useState('')
 const [dragged,setDragged]=useState(null)
 const active=draft.filter(p=>!p.archived)
 const archived=draft.filter(p=>p.archived)
 const setArchived=(id,archived)=>setDraft(old=>old.map(p=>p.id===id?{...p,archived}:p))
 const count=p=>records.filter(r=>projects.find(x=>x.id===p.id)?.name===r.project).length
 const move=(id,targetIndex)=>setDraft(old=>{
  const from=old.findIndex(p=>p.id===id)
  const target=active[targetIndex]
  if(from<0||!target||target.id===UNASSIGNED_PROJECT||id===target.id)return old
  const destination=old.findIndex(p=>p.id===target.id)
  const next=[...old]
  const [project]=next.splice(from,1)
  next.splice(destination,0,project)
  return next
 })
 const remove=p=>{
  if(p.name===UNASSIGNED_PROJECT)return
  setReplacements(old=>({...old,[p.id]:UNASSIGNED_PROJECT}))
  setDraft(old=>old.filter(x=>x.id!==p.id))
 }
 const save=()=>{const clean=draft.map(p=>({...p,name:p.name.trim()}));if(clean.some(p=>p.name==='其他'))return setError('「其他」是旧版保留项目名称，请使用其他名称。');if(clean.some(p=>!p.name))return setError('项目名称不能为空。');if(new Set(clean.map(p=>p.name)).size!==clean.length)return setError('项目名称不能重复。');try{onSave(clean,migrateProjects(records,projects,clean,replacements));onClose()}catch{setError('保存失败，浏览器存储不可用，请重试。')}}
 return <div className="overlay"><section className="modal category-modal" role="dialog" aria-modal="true" aria-labelledby="projects-title"><div className="modal-header"><h2 id="projects-title">项目管理</h2><button className="close" aria-label="关闭项目管理" onClick={onClose}>✕</button></div><p className="import-help">核心与辅助分类共用此项目列表。改名会同步历史记录，删除项目后记录归入「未分类」。归档会保留关联记录。拖动手柄或使用上下箭头排序，统计分析会沿用保存后的顺序。</p><div className="category-list">{active.map((p,index)=><div className="category-row" key={p.id} onDragOver={e=>{if(dragged&&p.id!==UNASSIGNED_PROJECT)e.preventDefault()}} onDrop={e=>{e.preventDefault();if(dragged)move(dragged,index);setDragged(null)}}><label>项目名称<input aria-label={`项目名称 ${p.id}`} maxLength={60} readOnly={p.id===UNASSIGNED_PROJECT} value={p.name} onChange={e=>{setDraft(old=>old.map(x=>x.id===p.id?{...x,name:e.target.value}:x));setError('')}}/></label><div className="category-delete"><span>{count(p)} 条记录</span>{p.id!==UNASSIGNED_PROJECT&&<><span draggable title="拖动排序" className="icon-btn" style={{cursor:'grab'}} onDragStart={e=>{e.dataTransfer.setData('text/plain',p.id);e.dataTransfer.effectAllowed='move';setDragged(p.id)}} onDragEnd={()=>setDragged(null)}><GripVertical size={18}/></span><button className="secondary" aria-label={`上移 ${p.name}`} disabled={index===0} onClick={()=>move(p.id,index-1)}>↑</button><button className="secondary" aria-label={`下移 ${p.name}`} disabled={index>=active.length-2} onClick={()=>move(p.id,index+1)}>↓</button><button className="secondary" disabled={!p.name.trim()} onClick={()=>setArchived(p.id,true)}>归档</button><button className="secondary" onClick={()=>remove(p)}>删除项目</button></>}</div></div>)}</div><button className="secondary" onClick={()=>setDraft(old=>[...old.slice(0,-1),{id:crypto.randomUUID(),name:''},old.at(-1)])}>＋ 新增项目</button>{archived.length>0&&<details className="archived-projects"><summary>已归档（{archived.length}）</summary><div className="category-list">{archived.map(p=><div className="category-row" key={p.id}><strong>{p.name}</strong><div className="category-delete"><span>{count(p)} 条记录</span><button className="secondary" onClick={()=>setArchived(p.id,false)}>恢复</button><button className="secondary" onClick={()=>remove(p)}>删除项目</button></div></div>)}</div></details>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" onClick={save}>保存修改</button></div></section></div>
}
