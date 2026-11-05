import {useState} from 'react'
import {migrateProjects,UNASSIGNED_PROJECT} from './projects.js'
export default function ProjectManager({projects,records,onSave,onClose}){
 const [draft,setDraft]=useState(()=>projects.map(p=>({...p})))
 const [replacements,setReplacements]=useState({}),[error,setError]=useState('')
 const remove=p=>{
  if(p.name===UNASSIGNED_PROJECT)return
  setReplacements(old=>({...old,[p.id]:UNASSIGNED_PROJECT}))
  setDraft(old=>old.filter(x=>x.id!==p.id))
 }
 const save=()=>{const clean=draft.map(p=>({...p,name:p.name.trim()}));if(clean.some(p=>p.name==='其他'))return setError('「其他」是旧版保留项目名称，请使用其他名称。');if(clean.some(p=>!p.name))return setError('项目名称不能为空。');if(new Set(clean.map(p=>p.name)).size!==clean.length)return setError('项目名称不能重复。');try{onSave(clean,migrateProjects(records,projects,clean,replacements));onClose()}catch{setError('保存失败，浏览器存储不可用，请重试。')}}
 return <div className="overlay"><section className="modal category-modal" role="dialog" aria-modal="true" aria-labelledby="projects-title"><div className="modal-header"><h2 id="projects-title">项目管理</h2><button className="close" aria-label="关闭项目管理" onClick={onClose}>✕</button></div><p className="import-help">核心与辅助分类共用此项目列表。改名会同步历史记录，删除项目后记录归入「未分类」。保存修改后生效。</p><div className="category-list">{draft.map(p=><div className="category-row" key={p.id}><label>项目名称<input aria-label={`项目名称 ${p.id}`} maxLength={60} readOnly={p.id===UNASSIGNED_PROJECT} value={p.name} onChange={e=>{setDraft(old=>old.map(x=>x.id===p.id?{...x,name:e.target.value}:x));setError('')}}/></label><div className="category-delete"><span>{records.filter(r=>projects.find(x=>x.id===p.id)?.name===r.project).length} 条记录</span>{p.id!==UNASSIGNED_PROJECT&&<button className="secondary" onClick={()=>remove(p)}>删除项目</button>}</div></div>)}</div><button className="secondary" onClick={()=>setDraft(old=>[...old,{id:crypto.randomUUID(),name:''}])}>＋ 新增项目</button>{error&&<p className="form-error" role="alert">{error}</p>}<div className="actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" onClick={save}>保存修改</button></div></section></div>
}
