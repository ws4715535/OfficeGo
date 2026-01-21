const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const res = await db.collection('users').where({
      _openid: openid
    }).remove()

    return {
      code: 0,
      message: 'User deleted',
      data: res
    }

  } catch (err) {
    console.error('Delete User Error:', err)
    return {
      code: -1,
      error: err,
      message: 'Delete failed'
    }
  }
}