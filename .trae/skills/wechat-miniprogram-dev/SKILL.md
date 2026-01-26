---
name: "wechat-miniprogram-dev"
description: "Helper for WeChat Mini Program development enforcing Flex-First layout. Invoke when writing UI/CSS or developing features for WeChat Mini Programs."
---

# WeChat Mini Program Development Guidelines

This skill provides guidelines for developing WeChat Mini Programs in this project (Taro + React + Scss), with a strict emphasis on Flexbox layout.

## 1. Flex-First Layout Strategy (CRITICAL)

**Always use `display: flex` for alignment and distribution.**

*   **Avoid**: `float`, `inline-block` for layout, or excessive `absolute` positioning for static flow.
*   **Default Pattern**:
    ```scss
    .container {
      display: flex;
      flex-direction: column; // or row
      align-items: center;    // or flex-start, center, etc.
      justify-content: center; // or space-between, etc.
    }
    ```
*   **Centering**: Use Flexbox for centering content (both horizontal and vertical).
    ```scss
    .center-box {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    ```

## 2. Styling Standards (Scss)

*   **Units**: Use `rpx` (Responsive Pixel) for all dimensions, padding, margin, and font sizes to ensure adaptability across different screen sizes.
    *   Example: `width: 32rpx;`, `font-size: 28rpx;`
*   **Nesting**: Use Scss nesting to reflect the component structure, but avoid excessive nesting depth (max 3-4 levels).
*   **Variables**: Use project-defined variables for colors and spacing if available.

## 3. Taro & React Components

*   **Components**: Use standard Taro components (`View`, `Text`, `Image`, `Button`, `Input`, etc.) instead of HTML tags (`div`, `span`, `img`).
    *   `div` -> `View`
    *   `span` -> `Text`
    *   `img` -> `Image`
*   **Imports**: Always import components from `@tarojs/components`.
    ```javascript
    import { View, Text, Image } from '@tarojs/components'
    ```

## 4. Best Practices

*   **Class Naming**: Use kebab-case for class names (e.g., `.user-profile-card`).
*   **Performance**: Avoid inline styles for static values; move them to Scss files.
*   **Images**: Ensure images have explicit dimensions defined in Scss or style props.

## 5. Example Structure

**index.jsx**
```javascript
import { View, Text } from '@tarojs/components'
import './index.scss'

export default function Card() {
  return (
    <View className='card'>
      <View className='header'>
        <Text className='title'>Title</Text>
      </View>
      <View className='content'>
        <Text>Content goes here...</Text>
      </View>
    </View>
  )
}
```

**index.scss**
```scss
.card {
  display: flex;
  flex-direction: column;
  padding: 32rpx;
  background: #fff;
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;
    
    .title {
      font-size: 32rpx;
      font-weight: bold;
    }
  }
  
  .content {
    display: flex;
    flex: 1;
  }
}
```
