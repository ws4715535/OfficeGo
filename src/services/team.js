import Taro from '@tarojs/taro';

const callTeamApi = async (action, payload = {}) => {
  console.log(`[TeamAPI Request] Action: ${action}`, payload);
  try {
    const res = await Taro.cloud.callFunction({
      name: 'team-api',
      data: { action, payload }
    });
    console.log(`[TeamAPI Response] Action: ${action}`, res.result);
    if (res.result.code === 200) {
      return res.result.data;
    } else {
      throw new Error(res.result.msg);
    }
  } catch (err) {
    console.error(`Team API Error [${action}]:`, err);
    throw err;
  }
};

export const createTeam = (name, userInfo) => callTeamApi('createTeam', { name, userInfo });
export const joinTeam = (inviteCode, userInfo) => callTeamApi('joinTeam', { inviteCode, userInfo });
export const getMyTeams = () => callTeamApi('getMyTeams');
export const getTeamStatus = (teamId, dateStr) => callTeamApi('getTeamStatus', { teamId, dateStr });
export const getTeamDetail = (teamId, refDate) => callTeamApi('getTeamDetail', { teamId, refDate });
export const updateTeamName = (teamId, name) => callTeamApi('updateTeam', { teamId, name });
export const removeMember = (teamId, removeMemberId) => callTeamApi('updateTeam', { teamId, removeMemberId });
export const leaveTeam = (teamId) => callTeamApi('leaveTeam', { teamId });
export const deleteTeam = (teamId) => callTeamApi('deleteTeam', { teamId });
