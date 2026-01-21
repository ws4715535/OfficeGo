# Onboarding Flow API & Database Design

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

## Cloud Functions

### 1. `updateUserSettings`

Updates the user's settings and onboarding status.

*   **Name**: `updateUserSettings`
*   **Method**: `POST` (via `wx.cloud.callFunction`)
*   **Parameters**:
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
*   **Logic**:
    1.  Get `OPENID` from context.
    2.  Find user by `_openid`.
    3.  Update `settings` and `isOnboarded` fields.
    4.  Update `updateTime`.
    5.  Return success status.

### 2. `getUserProfile` (Existing)

Retrieves the current user's profile and settings.

*   **Logic Update**: Ensure it returns the `settings` and `isOnboarded` fields so the frontend can decide whether to show the onboarding flow.

## Local Storage Keys

*   `userInfo`: Stores basic user info (nickName, avatar).
*   `userSettings`: Stores the preference object (target, cycle, rule).
*   `isOnboarded`: Boolean flag to skip onboarding on subsequent launches.

## Onboarding Flow Logic

1.  **Check Onboarding**:
    *   App Launch -> Check Local Storage `isOnboarded`.
    *   If false -> Check Cloud `getUserProfile`.
    *   If Cloud returns `isOnboarded: true` -> Update Local Storage -> Go Home.
    *   If Cloud returns false/null -> Go to Onboarding Page.

2.  **Save Flow**:
    *   User completes Step 3.
    *   Frontend saves to Local Storage (`userSettings`, `isOnboarded=true`).
    *   Frontend calls `updateUserSettings` cloud function.
    *   Redirect to Home Page.
