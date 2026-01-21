const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 1. Query if user exists
    const userCheck = await db.collection('users').where({
      _openid: openid
    }).get()

    if (userCheck.data.length > 0) {
      // User exists
      return {
        code: 0,
        data: {
          ...userCheck.data[0],
          isNewUser: false
        },
        message: 'Login success'
      }
    }

    // 2. Create new user if not exists
    const newUser = {
      _openid: openid,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
      isOnboarded: false,
      settings: {
        targetPercentage: 60,
        statsCycle: 'monthly',
        roundingRule: 'round'
      }
    }

    const addRes = await db.collection('users').add({
      data: newUser
    })

    return {
      code: 0,
      data: {
        ...newUser,
        _id: addRes._id,
        isNewUser: true
      },
      message: 'User created'
    }

  } catch (err) {
    console.error('Login Cloud Function Error:', err)
    return {
      code: -1,
      error: err,
      message: 'Login failed'
    }
  }
}