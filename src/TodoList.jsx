import {useState} from 'react'
import {Check,Plus,Trash2,Pencil} from 'lucide-react'
export default function TodoList({date,items,onChange,viewFirst=false}){
 const [editingList,setEditingList]=useState(false)
 const canEdit=!viewFirst||editingList
 const [editing,setEditing]=useState(null)
 const [text,setText]=useState(''),[error,setError]=useState('')
 const save=next=>{try{onChange(next);setError('');return true}catch{setError('待办保存失败，浏览器存储不可用。');return false}}
 const finishEdit=()=>{if(!editing)return;const value=editing.text.trim();if(!value){setError('待办内容不能为空。');setEditing(null);return}if(save(items.map(x=>x.id===editing.id?{...x,text:value}:x)))setEditing(null)}
 const add=e=>{e.preventDefault();if(items.length>=5||!text.trim())return;if(save([...items,{id:crypto.randomUUID(),text:text.trim(),done:false}]))setText('')}
 return <section className={`card todo-card${viewFirst?(editingList?' is-editing':' is-viewing'):''}`}>
  <div className="card-title">
   <h2>当日待办</h2>
   <span>{items.filter(x=>x.done).length} / {items.length} 已完成</span>
   {viewFirst&&<button type="button" className="icon-btn todo-mode-button"
    aria-label={editingList?'结束编辑待办':'编辑待办清单'}
    title={editingList?'结束编辑':'编辑待办清单'}
    onClick={()=>{setEditingList(!editingList);setEditing(null)}}>
    {editingList?<Check size={16}/>:<Pencil size={15}/>}
   </button>}
  </div>
  {canEdit&&<>
   <p className="import-help">{date} · 最多 5 条，完成后打勾</p>
   <form className="todo-form" onSubmit={add}>
    <input aria-label="新增待办内容" maxLength={160}
     placeholder={items.length>=5?'已满 5 条，删除后可添加':'写下一件要完成的事'}
     value={text} onChange={e=>setText(e.target.value)} disabled={items.length>=5}/>
    <button aria-label="添加待办" className="primary" type="submit" disabled={items.length>=5||!text.trim()}><Plus size={16}/></button>
   </form>
  </>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {items.length?<ul className="todo-list">
   {items.map(item=><li key={item.id}>
    <div className="todo-item-content">
     <input type="checkbox" aria-label={`完成待办：${item.text}`} checked={item.done}
      onChange={()=>save(items.map(x=>x.id===item.id?{...x,done:!x.done}:x))}/>
     {canEdit&&editing?.id===item.id?<input className="todo-edit-input" aria-label="编辑当日待办" autoFocus maxLength={160}
      value={editing.text} onChange={e=>setEditing({...editing,text:e.target.value})} onBlur={finishEdit}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();finishEdit()}if(e.key==='Escape'){e.preventDefault();setEditing(null)}}}/>
      :<span className={item.done?'todo-done':''}>{item.text}</span>}
    </div>
    {canEdit&&<div className="todo-item-tools">
     <button type="button" className="icon-btn" aria-label={`编辑待办：${item.text}`}
      onClick={()=>setEditing({id:item.id,text:item.text})}><Pencil size={14}/></button>
     <button type="button" className="icon-btn" aria-label={`删除待办：${item.text}`}
      onMouseDown={e=>e.preventDefault()}
      onClick={()=>{if(save(items.filter(x=>x.id!==item.id))&&editing?.id===item.id)setEditing(null)}}><Trash2 size={14}/></button>
    </div>}
   </li>)}
  </ul>:<p className="todo-empty">{canEdit?'留一点空间，专注今天最重要的事。':'暂无待办'}</p>}
 </section>
}
