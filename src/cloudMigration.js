// Initial migration is additive: it never replaces existing cloud entities.
export const canonical = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const keyOf = row => `${row.entity_type}:${row.entity_id}`

export function migrationEntities(snapshot) {
  const rows = []
  const add = (entity_type, entity_id, payload) => rows.push({entity_type, entity_id, payload})
  for (const [type, list] of [['record', snapshot.records], ['category', snapshot.categories],
    ['project', snapshot.projects], ['deliverable', snapshot.deliverables]]) {
    for (const item of list) add(type, item.id, item)
  }
  for (const [date, goal] of Object.entries(snapshot.goals)) add('goal', date, goal)
  for (const [date, items] of Object.entries(snapshot.todos)) add('todo', date, items)
  add('rewards', 'settings', snapshot.rewards)
  add('order', 'categories', snapshot.categories.map(item => item.id))
  add('order', 'projects', snapshot.projects.map(item => item.id))
  if (rows.some(row => typeof row.entity_id !== 'string' || !row.entity_id || row.entity_id.length > 200) ||
    new Set(rows.map(keyOf)).size !== rows.length) throw new Error('本地数据包含无效或重复的 ID，请先导出备份并检查。')
  return rows
}

export function planMigration(snapshot, remote) {
  const existing = new Map(remote.map(row => [keyOf(row), row]))
  const additions = [], conflicts = [], duplicates = []
  for (const row of migrationEntities(snapshot)) {
    const cloud = existing.get(keyOf(row))
    if (!cloud) additions.push(row)
    else if (!cloud.deleted && canonical(row.payload) === canonical(cloud.payload)) duplicates.push(row)
    else conflicts.push(row)
  }
  return {additions, conflicts, duplicates}
}

export async function readCloud(client) {
  const rows = []
  // Explicit ordering makes pagination stable; the RLS policy limits rows to this account.
  for (let offset = 0; ; offset += 500) {
    const result = await client.from('journal_entities').select('*')
      .order('entity_type').order('entity_id').range(offset, offset + 499)
    if (result.error) throw result.error
    rows.push(...result.data)
    if (result.data.length < 500) return rows
  }
}

export async function uploadInitial(client, snapshot, onProgress = () => {}) {
  // Recheck immediately before writing, including on retries after a partial upload.
  const plan = planMigration(snapshot, await readCloud(client))
  if (plan.conflicts.length) throw new Error(`云端有 ${plan.conflicts.length} 项不同内容，已停止上传。需要先合并冲突，不会覆盖云端数据。`)
  let done = 0
  for (const row of plan.additions) {
    const result = await client.rpc('save_journal_entity', {
      p_type: row.entity_type, p_id: row.entity_id, p_payload: row.payload,
      p_revision: 0, p_deleted: false,
    })
    if (result.error) {
      // Another device may have inserted the same entity since the preview.
      if (result.error.code !== '40001') throw result.error
      const latest = planMigration(snapshot, await readCloud(client))
      if (latest.conflicts.length) throw new Error('另一台设备的数据发生变化，已停止上传。请重新预览；已上传的内容仍会保留。')
      if (latest.additions.some(item => keyOf(item) === keyOf(row))) throw result.error
    }
    onProgress(++done, plan.additions.length)
  }
  const final = planMigration(snapshot, await readCloud(client))
  if (final.conflicts.length || final.additions.length) throw new Error('云端数据在上传期间发生变化，请重新检查。')
  return {uploaded: done, skipped: plan.duplicates.length}
}
