export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/team/index',
    'pages/team/settings/index',
    'pages/calendar/index',
    'pages/settings/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'Office Day Tracker',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#4F46E5',
    backgroundColor: '#ffffff',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-active.png',
      },
      {
        pagePath: 'pages/team/index',
        text: '团队',
        iconPath: 'assets/tabbar/team.png',
        selectedIconPath: 'assets/tabbar/team-active.png',
      },
      {
        pagePath: 'pages/calendar/index',
        text: '日历',
        iconPath: 'assets/tabbar/calendar.png',
        selectedIconPath: 'assets/tabbar/calendar-active.png'
      }
    ]
  },
  darkmode: false,  
  lazyCodeLoading: 'requiredComponents'
})
