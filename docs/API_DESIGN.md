# OfficeGo API & Database Design

## Database Schema

### Collection: `users`

Stores user profile, authentication info, and application settings.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | String | Unique Document ID |
| `_openid` | String | WeChat OpenID (Unique Index) |
| `nickName` | String | WeChat Nickname |
| `avatarUrl` | String | WeChat Avatar URL |
| `gender` | Number | 0: Unknown, 1: Male, 2: Female |
| `isOnboarded` | Boolean | Whether the user has completed the onboarding flow |
| `settings` | Object | User preferences |
| `settings.targetPercentage` | Number | Target attendance percentage (e.g., 40 for 40%) |
| `settings.statsCycle` | String | 'weekly' or 'monthly' |
| `settings.roundingRule` | String | 'ceil' (Up), 'round' (Nearest), 'floor' (Down) |
| `createTime` | Date | Account creation timestamp |
| `updateTime` | Date | Last update timestamp |

### Collection: `attendance_records`

Stores daily attendance records for each user.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | String | Unique Document ID |
| `_openid` | String | WeChat OpenID |
| `date` | String | Date in format `YYYY-MM-DD` |
| `status` | String | `office` / `remote` / `leave` / `trip` |
| `note` | String | Optional note |
| `createdAt` | Date | Record creation timestamp |
| `updatedAt` | Date | Last update timestamp |

---

## Cloud Functions

### `attendance-api`

统一的考勤记录 API，通过 `action` 参数区分不同操作。

**调用方式**: 
```javascript
wx.cloud.callFunction({ 
  name: 'attendance-api', 
  data: { action, data } 
})
```

**时区处理**: 服务端使用北京时间 (UTC+8) 计算日期。

#### Actions

##### 1. `upsertRecord` - 创建/更新考勤记录

创建或更新指定日期的考勤状态。如果记录已存在则更新，否则创建新记录。

**Parameters**:
```json
{
  "action": "upsertRecord",
  "data": {
    "date": "2026-01-30",
    "status": "office",
    "note": ""
  }
}
```

**Response**:
```json
{
  "code": 0,
  "message": "Created",
  "data": { "date": "2026-01-30", "status": "office", "note": "" }
}
```

##### 2. `getTodayStatus` - 获取今日状态

获取当前用户今天的考勤状态。

**Parameters**:
```json
{ "action": "getTodayStatus" }
```

**Response**:
```json
{
  "code": 0,
  "data": { "date": "2026-01-30", "status": "office", "note": "" }
}
```

##### 3. `getMonthlyStats` - 获取月度统计

获取指定月份的所有考勤记录和统计数据。

**Parameters**:
```json
{
  "action": "getMonthlyStats",
  "data": { "month": "2026-01" }
}
```

**Response**:
```json
{
  "code": 0,
  "data": {
    "month": "2026-01",
    "records": [
      { "date": "2026-01-02", "status": "office", "note": "" }
    ],
    "stats": { "office": 15, "remote": 2, "leave": 3, "trip": 0, "total": 20 }
  }
}
```

##### 4. `deleteRecord` - 删除考勤记录

删除指定日期的考勤记录。

**Parameters**:
```json
{
  "action": "deleteRecord",
  "data": { "date": "2026-01-30" }
}
```

**Response**:
```json
{ "code": 0, "message": "Deleted" }
```

##### 5. `getYearlyRecords` - 获取全年记录（热力图）

获取指定年份的所有考勤记录，用于渲染年度热力图。支持分页获取超过 100 条记录。

**Parameters**:
```json
{
  "action": "getYearlyRecords",
  "data": { "year": 2026 }
}
```

**Response**:
```json
{
  "code": 0,
  "data": {
    "year": 2026,
    "records": [
      { "date": "2026-01-02", "status": "office" }
    ],
    "stats": { "office": 120, "remote": 10, "leave": 15, "trip": 5, "total": 150 }
  }
}
```

---

### `updateUserSettings`

Updates the user's settings and onboarding status.

**Parameters**:
```json
{
  "settings": {
    "targetPercentage": 40,
    "statsCycle": "monthly",
    "roundingRule": "ceil"
  },
  "isOnboarded": true
}
```

### `getUserProfile`

Retrieves the current user's profile and settings.

---

## Local Storage Keys

| Key | Type | Description |
| :--- | :--- | :--- |
| `userInfo` | Object | Basic user info (nickName, avatar) |
| `userSettings` | Object | Preference object (target, cycle, rule) |
| `isOnboarded` | Boolean | Flag to skip onboarding on subsequent launches |
