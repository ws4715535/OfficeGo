# OfficeGo 功能模块与技术文档（基于当前代码）

本文件基于仓库当前实现，描述核心功能模块、前后端架构、数据模型与云函数 API 约定。

## 1. 项目概览

### 1.1 技术栈

- 小程序框架：Taro 4 + React
- UI：NutUI Taro
- 时间库：dayjs
- 云开发：微信云开发（CloudBase）+ 云函数 + NoSQL 数据库

### 1.2 环境配置

云环境 ID 通过 Taro `defineConstants` 注入，初始化逻辑位于 `src/services/cloud.js`：

- dev：`config/dev.js` 注入 `CLOUD_ENV_ID = "dev-2g131pqic0b2596c"`
- prod：`config/prod.js` 注入 `CLOUD_ENV_ID = "prod-6gwb201339e45c6a"`

## 2. 功能模块说明

### 2.1 Onboarding（首次引导/登录）

- 入口页面：`pages/onboarding/index`
- 目标：获取用户授权（隐私同意）、完成昵称/头像设置、设置 isOnboarded
- 与云端交互：
  - `login`：确保 users 表存在当前用户
  - `updateUser`：保存 nickName/avatarUrl/settings/isOnboarded

### 2.2 首页（个人月度统计）

- 入口页面：`pages/index/index`
- 功能：
  - 基于本地设置（目标比例、舍入规则等）计算本月指标
  - 与云端同步月度记录（多端一致）
- 与云端交互：
  - `attendance-api.getMonthlyStats`
  -（写入）`attendance-api.upsertRecord` / `attendance-api.deleteRecord`

### 2.3 记录（日历/年度热力图）

- 入口页面：`pages/calendar/index`
- 功能：
  - 展示每日状态（office/remote/leave/trip）
  - 年度热力图（按年拉取）
- 与云端交互：
  - `attendance-api.getYearlyRecords`

### 2.4 团队（团队广场/趋势/成员当日状态）

- 入口页面：`pages/team/index`
- 功能：
  - 团队切换 / 加入团队 / 创建团队
  - Office Day 周趋势（团队维度）
  - 本周上班王（支持并列第一）
  - “谁在 Office（某日）”成员列表
- 与云端交互：
  - `team-api.getMyTeams`
  - `team-api.createTeam` / `team-api.joinTeam` / `team-api.getTeamByInviteCode`
  - `team-api.getTeamDetail`（团队基础信息 + 成员列表）
  - `team-api.getTeamStats`（周趋势 + Top Worker + Best Day）
  - `team-api.getDailyAttendance`（某天团队成员状态）

### 2.5 团队设置（团队管理）

- 入口页面：`pages/team/settings/index`
- 功能：
  - 显示团队邀请码（仅管理员可见真实码，非管理员返回 `***`）
  - 修改团队名称（管理员）
  - 移除成员（管理员）
  - 退出团队（成员）
  - 解散团队（创建者/管理员）
- 与云端交互：
  - `team-api.updateTeam`（改名/移除成员）
  - `team-api.leaveTeam`
  - `team-api.deleteTeam`

### 2.6 个人设置（头像昵称/偏好）

- 入口页面：`pages/settings/index`
- 功能：
  - 修改昵称、头像（头像支持上传至云存储 fileID）
  - 修改用户偏好（目标比例、舍入等）
- 与云端交互：
  - `getUserProfile`
  - `updateUser`

### 2.7 微信步数（团队轻激励）

- 入口页面：`pages/settings/index` + `pages/team/index`
- 定位：自愿参与的团队轻运动激励，不与到岗考核绑定
- MVP 功能：
  - 用户开启微信步数同步、设置展示范围
  - 团队页展示今日步数榜 / 本周累计榜 / 团队周目标
  - 管理员配置团队步数目标
- 与云端交互：
  - `step-api.syncMySteps`
  - `step-api.getMyStepSummary`
  - `step-api.getTeamStepStats`
  - `step-api.getTeamStepLeaderboard`
  - `step-api.updateMyStepSettings`
  - `step-api.updateTeamStepChallenge`

## 3. 数据模型（CloudBase NoSQL）

### 3.1 Collection：`users`

存储用户信息、引导状态与偏好设置。

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `_id` | String | 文档 ID |
| `_openid` | String | 用户 OpenID（逻辑主键） |
| `nickName` | String | 昵称 |
| `avatarUrl` | String | 头像（可为 fileID 或 URL） |
| `isOnboarded` | Boolean | 是否完成 onboarding |
| `settings` | Object | 偏好设置 |
| `settings.targetPercentage` | Number | 目标百分比（历史字段） |
| `settings.targetRatio` | Number | 目标比例（0-1，当前项目常用） |
| `settings.statsCycle` | String | `monthly`/`weekly` |
| `settings.roundingRule` | String | `ceil`/`round`/`floor`（历史字段） |
| `settings.roundType` | String | `ceil`/`round`/`floor`（当前项目常用） |
| `settings.frequency` | String | `MONTH`/`WEEK`/`BIWEEK`（个人设置页使用） |
| `settings.stepEnabled` | Boolean | 是否开启微信步数功能 |
| `settings.stepPrivacy` | String | `full` / `milestone` / `hidden` |
| `settings.stepAutoSync` | Boolean | 是否自动同步步数 |
| `settings.lastStepSyncAt` | Date | 上次同步步数时间 |
| `userLevel` | String | 用户分级：`normal`/`pro`/`ultra`（缺省按 normal 处理） |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

### 3.2 Collection：`attendance_records`

存储用户每日考勤状态。

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `_id` | String | 文档 ID |
| `_openid` | String | 用户 OpenID |
| `date` | String | `YYYY-MM-DD` |
| `status` | String | `office` / `remote` / `leave` / `trip` |
| `note` | String | 备注 |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

### 3.3 Collection：`teams`

团队主表。

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `_id` | String | 团队 ID |
| `name` | String | 团队名称 |
| `inviteCode` | String | 邀请码（管理员可见） |
| `ownerId` | String | 创建者 OpenID |
| `stepChallengeEnabled` | Boolean | 是否开启团队步数挑战 |
| `stepWeeklyGoal` | Number | 团队周目标步数 |
| `stepGoalType` | String | `total` / `avg` |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

### 3.4 Collection：`team_members`

团队成员关系表（多对多）。

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `_id` | String | 文档 ID |
| `teamId` | String | 团队 ID（关联 teams._id） |
| `userId` | String | 用户 OpenID（关联 users._openid） |
| `role` | String | `admin` / `member` |
| `joinedAt` | Date | 加入时间 |

### 3.5 Collection：`user_steps_daily`

- 存储用户每日步数汇总，仅保存按天聚合结果，不保存位置轨迹。

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `_id` | String | 文档 ID |
| `_openid` | String | 用户 OpenID |
| `date` | String | `YYYY-MM-DD` |
| `stepCount` | Number | 当日步数 |
| `source` | String | 数据来源，MVP 固定为 `wechat` |
| `isVisibleToTeam` | Boolean | 是否允许在团队中展示 |
| `syncDate` | Date | 本次同步时间 |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

## 4. 用户分级（normal / pro / ultra）

### 4.1 规则

- normal：最多创建 3 个团队
- pro：最多创建 20 个团队
- ultra：不限制

### 4.2 实现方式（当前代码约定）

- `team-api.createTeam` 在创建团队前查询 users 表的 `userLevel`，并按 `teams.ownerId = openid` 统计已创建团队数量，超限返回 403。
- 若 users 表没有 `userLevel` 字段，按 `normal` 处理（即默认普通用户）。

## 5. 云函数 API

### 5.1 通用调用方式

小程序侧统一使用：

```js
Taro.cloud.callFunction({
  name: 'xxx',
  data: { ... }
})
```

注意：当前项目存在两类返回码约定：

- `attendance-api` / `login` / `getUserProfile` / `updateUser`：成功 `code === 0`
- `team-api`：成功 `code === 200`（前端 `src/services/team.js` 会按 200/非200 处理）

### 5.2 `attendance-api`

统一的个人考勤 API，通过 `action` 参数区分。

```js
Taro.cloud.callFunction({
  name: 'attendance-api',
  data: { action, data }
})
```

时区处理：服务端用北京时间（UTC+8）计算“今天”的日期字符串。

#### Actions

- `upsertRecord`：创建/更新当日记录（status 必须为 `office|remote|leave|trip`）
- `getTodayStatus`：获取今日状态
- `getMonthlyStats`：获取指定月份所有记录 + stats
- `deleteRecord`：删除指定日期记录
- `getYearlyRecords`：获取指定年份所有记录 + stats（云端分页拉取 > 100 条）

### 5.3 `team-api`

团队相关 API，通过 `action` 参数区分：

```js
Taro.cloud.callFunction({
  name: 'team-api',
  data: { action, payload }
})
```

#### Actions（按前端使用频率排序）

- `getMyTeams`：获取我加入的团队列表（含 role；管理员可见 inviteCode）
- `getTeamDetail`：团队基础信息 + 成员列表（lookup users 获取最新头像昵称）
- `getTeamStats`：周趋势 + Best Day + Top Worker（支持并列第一）
- `getDailyAttendance`：某天团队成员到岗列表（基于 attendance_records + team_members + users）
- `createTeam`：创建团队（写 teams + team_members(admin)；含分级创建上限）
- `getTeamByInviteCode`：根据邀请码预览团队（memberCount、是否已加入等）
- `joinTeam`：加入团队（写 team_members(member)）
- `updateTeam`：改名 / 移除成员（管理员权限）
- `leaveTeam`：退出团队（创建者禁止退出）
- `deleteTeam`：解散团队（仅创建者）

### 5.4 `step-api`

微信步数相关 API，通过 `action` 参数区分：

```js
Taro.cloud.callFunction({
  name: 'step-api',
  data: { action, payload }
})
```

#### Actions

- `syncMySteps`：同步我最近 N 天步数并写入 `user_steps_daily`
- `getMyStepSummary`：获取我的今日步数、本周累计、连续达标天数与设置
- `getTeamStepStats`：获取团队周目标、完成率、参与人数、总步数
- `getTeamStepLeaderboard`：获取团队今日榜 / 周榜
- `updateMyStepSettings`：更新个人步数开关、自动同步、隐私级别
- `updateTeamStepChallenge`：管理员更新团队步数目标与开关

## 6. 前端服务层（Service）与数据流

### 6.1 `src/services/auth.js`

- `login()`：调用云函数 login，缓存 `userId`（OpenID）
- `getUserProfile()`：调用 getUserProfile，同步到 `userInfo`
- `updateUser()`：调用 updateUser，并写回本地 `userInfo`

### 6.2 `src/services/attendance.js`

- 封装 `attendance-api` 的 action 调用，并统一抛错处理

### 6.3 `src/services/team.js`

- 封装 `team-api` 的 action 调用，并按 `code === 200` 作为成功判断

### 6.4 `src/hooks/useTeam.js`

- 统一管理团队页数据：
  - 我的团队列表
  - 当前团队详情/统计/成员
  - 缓存：`team_detail_${userId}_${teamId}` + `last_team_id`
  - 请求去重：同 key 并发请求会被跳过

### 6.5 `src/services/steps.js`

- 封装 `step-api` 的 action 调用
- `syncMySteps` 使用微信运动 cloudID 直传云函数，避免前端本地解密
- 团队页通过 `getTeamStepStats` + `getTeamStepLeaderboard` 获取挑战进度和榜单

## 7. 本地存储（Local Storage）

### 7.1 用户侧

- `userId`：当前登录用户 OpenID
- `userInfo`：用户信息缓存（nickName/avatarUrl/settings 等）
- `isOnboarded`：是否完成引导

### 7.2 业务侧

- `ODT_USER_SETTINGS`：个人设置（见 `src/constants/config.js`）
- `ODT_RECORDS`：本地记录缓存（按日 map）
- `team_detail_${userId}_${teamId}`：团队详情缓存
- `last_team_id`：上次选择的团队
- `team_steps_${userId}_${teamId}_${weekStart}`：团队步数榜与周目标缓存

## 8. 开发与运行

### 8.1 启动（小程序）

```bash
npm run dev:weapp
```

### 8.2 关键入口

- 应用启动：`src/app.js`（调用 `initCloudBase()`）
- 云能力初始化：`src/services/cloud.js`
