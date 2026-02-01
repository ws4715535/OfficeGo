import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import refreshIcon from '../../assets/refresh.png'
import './index.scss'

/**
 * 年度打卡热力图组件 - GitHub 风格
 * 
 * @param {Object} props
 * @param {number} props.year - 年份，默认当前年
 * @param {Array} props.data - 考勤数据 [{date: 'YYYY-MM-DD', status: 'office'|'leave'|'remote'|null}]
 * @param {number} props.cellSize - 单元格大小(rpx)，默认20
 * @param {number} props.gap - 单元格间距(rpx)，默认6
 * @param {boolean} props.showLegend - 是否显示图例，默认true
 * @param {boolean} props.showWeekLabels - 是否显示星期标签，默认true
 * @param {boolean} props.showMonthLabels - 是否显示月份标签，默认true
 * @param {boolean} props.showTitle - 是否显示标题，默认true
 * @param {boolean} props.showScrollIndicator - 是否显示滚动进度指示器，默认true
 * @param {string} props.title - 自定义标题（会覆盖动态标题）
 * @param {Object} props.colors - 自定义颜色 {office: '#xxx', leave: '#xxx', empty: '#xxx'}
 * @param {Object} props.labels - 自定义标签 {office: '来', leave: '假', empty: '无'}
 * @param {Function} props.onCellClick - 单元格点击回调 (day: {date, status, isToday, isFuture}) => void
 * @param {Function} props.onRefresh - 刷新按钮点击回调 () => void
 * @param {boolean} props.loading - 是否正在加载数据（控制刷新图标旋转）
 */
const AttendanceHeatmap = ({
  year = new Date().getFullYear(),
  data = [],
  cellSize = 20,
  gap = 6,
  showLegend = true,
  showWeekLabels = true,
  showMonthLabels = true,
  showTitle = true,
  showScrollIndicator = true,
  title,
  colors = {
    office: '#4F46E5',  // indigo-600
    leave: '#FB923C',   // orange-400
    empty: '#F3F4F6',   // gray-100
  },
  labels = {
    office: '来',
    leave: '假',
    empty: '无'
    },
  onCellClick,
  onRefresh,
  loading = false,
}) => {
  // 滚动进度
  const [scrollProgress, setScrollProgress] = useState(0)
  // 将数据转换为 Map 便于查找
  const dataMap = useMemo(() => {
    const map = new Map()
    data.forEach(item => {
      if (item.date && item.status) {
        map.set(item.date, item.status)
      }
    })
    return map
  }, [data])

  // 获取今天日期字符串
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // 生成基于真实日期的日历数据
  const { weeks, monthLabels: monthPos, totalOfficeDays, futureOfficeDays } = useMemo(() => {
    const weeksData = []
    const monthPositions = []
    let totalOffice = 0
    let futureOffice = 0
    
    const startDate = new Date(year, 0, 1)
    const endDate = new Date(year, 11, 31)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 从第一周的周日开始
    const current = new Date(startDate)
    current.setDate(current.getDate() - current.getDay())

    let weekIndex = 0

    while (current <= endDate || current.getDay() !== 0) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
        const isCurrentYear = current.getFullYear() === year
        const month = current.getMonth()
        const dayOfMonth = current.getDate()
        
        // 判断是否是未来日期
        const currentDateOnly = new Date(current)
        currentDateOnly.setHours(0, 0, 0, 0)
        const isFuture = currentDateOnly > today

        // 记录月份位置（每月1号所在周）
        if (isCurrentYear && dayOfMonth === 1 && !monthPositions.find(m => m.month === month + 1)) {
          monthPositions.push({ month: month + 1, weekIndex })
        }

        // 获取状态
        let status = null
        if (isCurrentYear) {
          status = dataMap.get(dateStr) || null
          // 统计 office 天数
          if (status === 'office' || status === 'OFFICE') {
            totalOffice++
            if (isFuture) {
              futureOffice++
            }
          }
        }

        week.push({
          date: dateStr,
          isCurrentYear,
          status,
          dayIndex: d,
          isToday: dateStr === todayStr,
          isFuture,
        })
        current.setDate(current.getDate() + 1)
      }
      weeksData.push(week)
      weekIndex++
      if (weekIndex > 54) break
    }
    return { 
      weeks: weeksData, 
      monthLabels: monthPositions,
      totalOfficeDays: totalOffice,
      futureOfficeDays: futureOffice,
    }
  }, [year, dataMap, todayStr])

  // 获取单元格颜色
  const getCellColor = (status, isCurrentYear) => {
    if (!isCurrentYear) return 'transparent'
    switch (status) {
      case 'office':
      case 'OFFICE':
        return colors.office
      case 'leave':
      case 'LEAVE':
        return colors.leave
      default:
        return colors.empty
    }
  }

  const weekDayLabels = ['日', '一', '二', '三', '四', '五', '六']
  
  // 动态标题：29 Days in 2026
  const displayTitle = title || `OfficeDays in ${year}`

  // 处理单元格点击
  const handleCellClick = (day) => {
    if (!day.isCurrentYear) return
    if (onCellClick) {
      onCellClick(day)
    }
  }

  // 处理滚动事件
  const handleScroll = (e) => {
    const { scrollLeft, scrollWidth } = e.detail
    // 获取可视区域宽度（scrollWidth - 实际内容宽度的差值）
    const viewportWidth = e.detail.scrollWidth - (scrollLeft + e.detail.deltaX || 0)
    // 计算可滚动的最大距离
    const maxScroll = scrollWidth - 280 // 估算可视区域宽度约280px
    if (maxScroll > 0) {
      const progress = Math.min(1, Math.max(0, scrollLeft / maxScroll))
      setScrollProgress(progress)
    }
  }

  // 计算样式值
  const cellSizePx = cellSize
  const gapPx = gap
  const weekLabelWidth = 32 // rpx
  const monthLabelHeight = 36 // rpx

  return (
    <View className='attendance-heatmap'>
      {/* 头部 */}
      <View className='heatmap-header'>
        {showTitle && (
          <View className='heatmap-title'>
            <Text className='title-text'>{displayTitle}</Text>
            {onRefresh && (
              <Image 
                src={refreshIcon} 
                className={`refresh-icon ${loading ? 'spinning' : ''}`}
                onClick={!loading ? onRefresh : undefined}
              />
            )}
          </View>
        )}
        
        {showLegend && (
          <View className='heatmap-legend'>
            <View className='legend-item'>
              <View 
                className='legend-dot empty' 
                style={{ backgroundColor: colors.empty }}
              />
              <Text className='legend-label'>{labels.empty}</Text>
            </View>
            <View className='legend-item'>
              <View 
                className='legend-dot leave' 
                style={{ backgroundColor: colors.leave }}
              />
              <Text className='legend-label'>{labels.leave}</Text>
            </View>
            <View className='legend-item'>
              <View 
                className='legend-dot office' 
                style={{ backgroundColor: colors.office }}
              />
              <Text className='legend-label'>{labels.office}</Text>
            </View>
          </View>
        )}
      </View>

      {/* 热力图主体 */}
      <View className='heatmap-body'>
        {/* 左侧星期标签（固定） */}
        {showWeekLabels && (
          <View 
            className='week-labels'
            style={{ 
              width: `${weekLabelWidth}rpx`,
              paddingTop: showMonthLabels ? `${monthLabelHeight}rpx` : 0,
            }}
          >
            {weekDayLabels.map((label, i) => (
              <View 
                key={i} 
                className='week-label-item'
                style={{ height: `${cellSizePx}rpx`, marginBottom: `${gapPx}rpx` }}
              >
                <Text className='week-label-text'>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 右侧滚动区域 */}
        <ScrollView 
          scrollX 
          enhanced
          showScrollbar={false}
          className='heatmap-scroll'
          onScroll={showScrollIndicator ? handleScroll : undefined}
        >
          <View className='heatmap-grid-wrapper'>
            {/* 月份标签 */}
            {showMonthLabels && (
              <View 
                className='month-labels'
                style={{ height: `${monthLabelHeight}rpx` }}
              >
                {monthPos.map((m, i) => (
                  <View 
                    key={i} 
                    className='month-label-item'
                    style={{ left: `${m.weekIndex * (cellSizePx + gapPx)}rpx` }}
                  >
                    <Text className='month-label-text'>{m.month}月</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 网格主体 */}
            <View 
              className='heatmap-grid'
              style={{ gap: `${gapPx}rpx` }}
            >
              {weeks.map((week, wIndex) => (
                <View 
                  key={wIndex} 
                  className='week-column'
                  style={{ gap: `${gapPx}rpx` }}
                >
                  {week.map((day, dIndex) => {
                    const hasStatus = day.status && (day.status === 'office' || day.status === 'OFFICE' || day.status === 'leave' || day.status === 'LEAVE')
                    const statusColor = getCellColor(day.status, day.isCurrentYear)
                    const borderRadius = `${Math.floor(cellSizePx / 5)}rpx`
                    
                    return (
                      <View
                        key={`${wIndex}-${dIndex}`}
                        className={`day-cell ${day.isToday ? 'today' : ''} ${day.isFuture ? 'future' : ''}`}
                        style={{
                          width: `${cellSizePx}rpx`,
                          height: `${cellSizePx}rpx`,
                          backgroundColor: day.isCurrentYear ? colors.empty : 'transparent',
                          borderRadius,
                        }}
                        onClick={() => handleCellClick(day)}
                      >
                        {/* 状态填充层（有状态时显示，未来日期半透明） */}
                        {day.isCurrentYear && hasStatus && (
                          <View 
                            className='status-fill'
                            style={{
                              backgroundColor: statusColor,
                              borderRadius,
                              opacity: day.isFuture ? 0.4 : 1,
                            }}
                          />
                        )}
                        {/* 今日高亮 */}
                        {day.isToday && day.isCurrentYear && (
                          <View className='today-indicator' />
                        )}
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* 滚动进度指示器 */}
      {showScrollIndicator && (
        <View className='scroll-indicator'>
          <View className='scroll-track'>
            <View 
              className='scroll-thumb'
              style={{ 
                width: '20%',
                transform: `translateX(${scrollProgress * 400}%)`,
              }}
            />
          </View>
        </View>
      )}
    </View>
  )
}

export default AttendanceHeatmap
