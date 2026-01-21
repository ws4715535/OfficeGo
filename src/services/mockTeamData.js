// Mock Data Service for Team Features

export let TEAMS = [
  { id: 't1', name: '极客办公小组', role: 'admin' }, // Current user is admin
  { id: 't2', name: '市场运营部', role: 'member' },  // Current user is member
  { id: 't3', name: '设计中心', role: 'member' }
]

export const joinTeam = (code) => {
  // Mock join
  const newTeam = { id: `t${Date.now()}`, name: '新加入的团队', role: 'member' }
  TEAMS.push(newTeam)
  return newTeam
}

export const leaveTeam = (teamId) => {
  const index = TEAMS.findIndex(t => t.id === teamId)
  if (index > -1) {
    TEAMS.splice(index, 1)
  }
}

export const createTeam = () => {
  const newTeam = { id: `t${Date.now()}`, name: '我的新团队', role: 'admin' }
  TEAMS.push(newTeam)
  return newTeam
}

const AVATARS = {
  me: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  sarah: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
  kevin: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kevin',
  elena: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elena',
  mike: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mike',
  lisa: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lisa'
}

// Generate consistent data for each team
export const getTeamData = (teamId) => {
  const isT1 = teamId === 't1'
  
  return {
    // Team specific best day
    bestDay: isT1 ? {
      day: '本周三',
      count: 4,
      desc: '已有 4 名成员计划到岗，最适合组织线下同步、约饭'
    } : {
      day: '本周四',
      count: 5,
      desc: '全员到齐！下午茶预定中 🍰'
    },
    
    // Week range
    dateRange: '10.23 - 10.29',
    
    // Weekly trends
    weekDays: [
      { label: '周一', value: 0, count: isT1 ? 2 : 3 },
      { label: '周二', value: 1, count: isT1 ? 3 : 2 },
      { label: '周三', value: 2, count: isT1 ? 4 : 4 },
      { label: '周四', value: 3, count: isT1 ? 1 : 5 },
      { label: '周五', value: 4, count: isT1 ? 2 : 3 },
    ]
  }
}

// Mock members for specific team and day
export const getMembersForDay = (teamId, dayIndex) => {
  const allMembers = [
    { id: 1, name: '我', avatar: AVATARS.me, isMe: true },
    { id: 2, name: 'Sarah', avatar: AVATARS.sarah, isMe: false },
    { id: 3, name: 'Kevin', avatar: AVATARS.kevin, isMe: false },
    { id: 4, name: 'Elena', avatar: AVATARS.elena, isMe: false },
    { id: 5, name: 'Mike', avatar: AVATARS.mike, isMe: false },
    { id: 6, name: 'Lisa', avatar: AVATARS.lisa, isMe: false },
  ]

  // Simulate different attendance based on team and day
  // This is just a deterministic random simulation
  return allMembers.map(m => {
    // Generate pseudo-random status
    const hash = (m.id + dayIndex + (teamId === 't1' ? 0 : 10)) % 3
    const isOffice = hash !== 0 // 2/3 chance of being in office
    
    return {
      ...m,
      status: 'OFFICE', // MVP: Force all status to OFFICE
      isOnline: true,
      statusText: '已到岗', // MVP Request: "目前都显示到岗"
      tagText: '正在办公' // MVP Request: "和正在办公"
    }
  }).sort((a, b) => (a.status === 'OFFICE' ? -1 : 1)) // Put Office people first
}

// New: Get detailed team info for settings
export const getTeamSettings = (teamId) => {
  const team = TEAMS.find(t => t.id === teamId) || TEAMS[0]
  const isT1 = teamId === 't1' // T1 is Admin, T2/T3 are Member

  return {
    id: team.id,
    name: team.name,
    createdAt: '2024-01-12',
    memberCount: 5,
    currentUserRole: team.role, // 'admin' or 'member'
    inviteCode: `OFFICE-${teamId.toUpperCase()}88`,
    members: [
      { id: 1, name: '我', avatar: AVATARS.me, role: team.role, isMe: true },
      { id: 2, name: 'Sarah', avatar: AVATARS.sarah, role: 'member', isMe: false },
      { id: 3, name: 'Kevin', avatar: AVATARS.kevin, role: 'member', isMe: false },
      { id: 4, name: 'Elena', avatar: AVATARS.elena, role: 'member', isMe: false },
      { id: 5, name: 'James', avatar: AVATARS.mike, role: 'member', isMe: false },
    ]
  }
}
