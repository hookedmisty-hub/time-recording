import {useState} from 'react'
import {Pencil,Check,X} from 'lucide-react'
export default function EditableSubtitle({value,onSave}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[original,setOriginal]=useState(''),[error,setError]=useState('')
 const save=e=>{
  e.preventDefault()
  if(value!==original){setError('副标题已在其他地方更新，请取消后重新编辑。');return}
  try{onSave(draft);setEditing(false);setError('')}catch(err){setError(err.message)}
 }
 if(editing)return <form className="subtitle-editor" onSubmit={save} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setEditing(false)}}}>
  <div className="subtitle-edit-row"><input autoFocus aria-label="自定义副标题" maxLength={160} value={draft} onChange={e=>setDraft(e.target.value)}/><button type="submit" className="icon-btn" aria-label="保存副标题" title="保存"><Check size={16}/></button><button type="button" className="icon-btn" aria-label="取消编辑副标题" title="取消" onClick={()=>setEditing(false)}><X size={16}/></button></div>
  {error&&<span className="form-error" role="alert">{error}</span>}
 </form>
 return <div className="editable-subtitle"><p className="subtitle">{value}</p><button type="button" className="icon-btn subtitle-edit-button" aria-label="编辑副标题" title="编辑副标题" onClick={()=>{setDraft(value);setOriginal(value);setError('');setEditing(true)}}><Pencil size={14}/></button></div>
}
