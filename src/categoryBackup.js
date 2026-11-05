export function parseCategoryBackup(text,current){
 let raw;try{raw=JSON.parse(text.replace(/^\uFEFF/,''))}catch{throw new Error('文件不是有效的 JSON。')}
 const list=raw?.categories
 if(!Array.isArray(list)||!list.length)throw new Error('请选择分类设置备份，或含分类设置的完整 JSON 备份。')
 const ids=new Set(),names=new Set()
 const incoming=list.map(c=>{
  if(!c||typeof c.id!=='string'||!c.id.trim()||typeof c.name!=='string'||!c.name.trim()||c.name.trim().length>40||!/^#[0-9a-f]{6}$/i.test(c.color)||!['core','research','other'].includes(c.kind)||ids.has(c.id)||names.has(c.name.trim())||(c.protected!==undefined&&typeof c.protected!=='boolean'))throw new Error('分类名称、颜色、用途或 ID 无效，或存在重复分类。')
  ids.add(c.id);names.add(c.name.trim());return {id:c.id,name:c.name.trim(),color:c.color,kind:c.kind,...(c.protected?{protected:true}:{})}
 })
 const merged=current.map(c=>({...c}));let added=0,updated=0
 for(const c of incoming){
  const index=merged.findIndex(x=>x.id===c.id),sameName=merged.findIndex(x=>x.name===c.name)
  if(index>=0&&sameName>=0&&index!==sameName)throw new Error('分类 ID 与名称冲突，请先调整分类名称后重试。')
  const target=index>=0?index:sameName
  if(target>=0){const old=merged[target];if((old.name==='未分类'||old.id==='未分类'||old.protected)&&c.name!==old.name)throw new Error('不能通过导入重命名保留分类。');if(c.name==='未分类'&&old.name!=='未分类')throw new Error('未分类设置冲突。');merged[target]={...c,id:old.id,...(old.protected||old.name==='未分类'||c.name==='未分类'?{protected:true}:{})};updated++}
  else{merged.push({...c,...(c.name==='未分类'?{protected:true}:{})});added++}
 }
 return {merged,added,updated,count:incoming.length}
}
