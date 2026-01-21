const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// Utility to get date string YYYY-MM-DD
const getTodayDate = () => {
  // Use server time but we need to be careful about timezone.
  // Cloud functions run in UTC usually. We want Beijing time (UTC+8).
  const date = new Date()
  const offset = 8
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
  const serverDate = new Date(utc + (3600000 * offset))
  return serverDate.toISOString().split('T')[0]
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event

  if (!openid) {
    return { code: 401, message: 'Unauthorized' }
  }

  try {
    switch (action) {
      case 'upsertRecord':
        return await upsertRecord(openid, data || {})
      case 'getTodayStatus':
        return await getTodayStatus(openid)
      case 'getMonthlyStats':
        return await getMonthlyStats(openid, data || {})
      case 'deleteRecord':
        return await deleteRecord(openid, data || {})
      default:
        return { code: 400, message: 'Unknown action' }
    }
  } catch (err) {
    console.error(`[${action}] Error:`, err)
    return { code: 500, message: err.message, error: err }
  }
}

async function upsertRecord(openid, input) {
  const date = input.date || getTodayDate()
  const status = input.status
  const note = input.note || ''

  if (!['office', 'remote', 'leave', 'trip'].includes(status)) {
    return { code: 400, message: 'Invalid status' }
  }

  const collection = db.collection('attendance_records')
  
  // Check existing
  const existing = await collection.where({
    _openid: openid,
    date: date
  }).get()

  if (existing.data.length > 0) {
    // Update
    const id = existing.data[0]._id
    await collection.doc(id).update({
      data: {
        status,
        note,
        updatedAt: db.serverDate()
      }
    })
    return { code: 0, message: 'Updated', data: { date, status, note } }
  } else {
    // Insert
    await collection.add({
      data: {
        _openid: openid,
        date,
        status,
        note,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })
    return { code: 0, message: 'Created', data: { date, status, note } }
  }
}

async function getTodayStatus(openid) {
  const date = getTodayDate()
  const collection = db.collection('attendance_records')
  
  const res = await collection.where({
    _openid: openid,
    date: date
  }).get()

  if (res.data.length > 0) {
    const record = res.data[0]
    return { 
      code: 0, 
      data: { 
        date: record.date, 
        status: record.status, 
        note: record.note 
      } 
    }
  } else {
    return { code: 0, data: null }
  }
}

async function getMonthlyStats(openid, input) {
  const month = input.month // YYYY-MM
  if (!month) return { code: 400, message: 'Month required' }

  const start = `${month}-01`
  // Simple check for next month to handle range correctly or just string compare
  // String comparison works fine for YYYY-MM-DD
  const end = `${month}-32` 

  const collection = db.collection('attendance_records')
  const res = await collection.where({
    _openid: openid,
    date: _.gte(start).and(_.lte(end))
  }).limit(100) // Assuming max 31 days, but limit 100 is safe
  .get()

  const records = res.data
  
  const stats = {
    office: 0,
    remote: 0,
    leave: 0,
    trip: 0,
    total: records.length
  }

  records.forEach(r => {
    if (stats[r.status] !== undefined) {
      stats[r.status]++
    }
  })

  return { 
    code: 0, 
    data: {
      month,
      records: records.map(r => ({ date: r.date, status: r.status, note: r.note })),
      stats
    } 
  }
}

async function deleteRecord(openid, input) {
  const date = input.date
  if (!date) return { code: 400, message: 'Date required' }

  const collection = db.collection('attendance_records')
  await collection.where({
    _openid: openid,
    date: date
  }).remove()

  return { code: 0, message: 'Deleted' }
}
