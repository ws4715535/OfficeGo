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

    // --- Sync to team_members ---
    // If nickName or avatarUrl changed, we need to update all team_members records for this user
    if (nickName || avatarUrl) {
        const memberUpdateData = {}
        if (nickName) memberUpdateData.nickName = nickName
        if (avatarUrl) memberUpdateData.avatarUrl = avatarUrl
        
        // Find all team memberships for this user
        // Note: team_members uses _openid automatically for 'where' if we don't specify it? 
        // Wait, cloud functions run with admin privileges usually, but let's be safe.
        // We need to query by userId (which is usually _openid in our schema logic, or we query by _openid field)
        
        try {
            await db.collection('team_members').where({
                userId: openid // Our team_members schema uses 'userId' to store openid
            }).update({
                data: memberUpdateData
            })
            console.log('Synced user info to team_members for openid:', openid)
        } catch (syncErr) {
            console.error('Failed to sync user info to team_members:', syncErr)
            // We don't fail the whole request if sync fails, just log it
        }
    }
    // ----------------------------

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