const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  // event contains: nickName, avatarUrl, settings, etc.
  const { nickName, avatarUrl, settings } = event

  try {
    // Check if user exists (should exist if updating)
    const userQuery = await db.collection('users').where({
      _openid: openid
    }).get()

    if (userQuery.data.length === 0) {
      return {
        code: -1,
        message: 'User not found'
      }
    }

    const userId = userQuery.data[0]._id
    
    // Construct update data
    const updateData = {
      updatedAt: db.serverDate()
    }
    
    if (nickName) updateData.nickName = nickName
    if (avatarUrl) updateData.avatarUrl = avatarUrl
    if (settings) updateData.settings = settings
    if (event.isOnboarded !== undefined) updateData.isOnboarded = event.isOnboarded

    await db.collection('users').doc(userId).update({
      data: updateData
    })

    return {
      code: 0,
      message: 'User updated',
      data: {
        ...userQuery.data[0],
        ...updateData
      }
    }

  } catch (err) {
    console.error('Update User Error:', err)
    return {
      code: -1,
      error: err,
      message: 'Update failed'
    }
  }
}