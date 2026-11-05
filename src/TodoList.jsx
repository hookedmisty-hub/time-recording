import {useState} from 'react'
import {Plus,Trash2} from 'lucide-react'
export default function TodoList({date,items,onChange}){
 const [text,setText]=useState(''),[error,setError]=useState('')
 const save=next=>{try{onChange(next);setError('');return true}catch{setError('待办保存失败，浏览器存储不可用。');return false}}
 const add=e=>{e.preventDefault();if(items.length>=5||!text.trim())return;if(save([...items,{id:crypto.randomUUID(),text:text.trim(),done:false}]))setText('')}
 return <section className="card todo-card"><div className="card-title"><h2>当日待办</h2><span>{items.filter(x=>x.done).length} / {items.length} 已完成</span></div><p className="import-help">{date} · 最多 5 条，完成后打勾</p><form className="todo-form" onSubmit={add}><input aria-label="新增待办内容" maxLength={160} placeholder={items.length>=5?'已满 5 条，删除后可添加':'写下一件要完成的事'} value={text} onChange={e=>setText(e.target.value)} disabled={items.length>=5}/><button className="primary" type="submit" disabled={items.length>=5||!text.trim()}><Plus size={16}/>添加</button></form>{error&&<p className="form-error" role="alert">{error}</p>}{items.length?<ul className="todo-list">{items.map(item=><li key={item.id}><label className={item.done?'todo-done':''}><input type="checkbox" checked={item.done} onChange={()=>save(items.map(x=>x.id===item.id?{...x,done:!x.done}:x))}/><span>{item.text}</span></label><button className="icon-btn" aria-label={`删除待办：${item.text}`} onClick={()=>save(items.filter(x=>x.id!==item.id))}><Trash2 size={16}/></button></li>)}</ul>:<p className="todo-empty">留一点空间，专注今天最重要的事。</p>}</section>
}
