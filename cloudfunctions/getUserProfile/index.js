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
    }).get()

    if (res.data.length > 0) {
      return {
        code: 0,
        data: res.data[0]
      }
    } else {
      return {
        code: 0,
        data: null // User not found
      }
    }
  } catch (err) {
    console.error('Get User Profile Error:', err)
    return {
      code: 500,
      message: 'Failed to get user profile',
      error: err
    }
  }
}
