import React, { forwardRef, memo } from 'react'
import * as fe from "./fe"
import * as flatColorIcons from "./flat-color-icons"
import * as skillIcons from "./skill-icons"

const ICON_COLLECTIONS = {
    fe,
    flatColorIcons,
    skillIcons
} as const

// 提取集合的前綴型別
type Collection = keyof typeof ICON_COLLECTIONS

/**
 * 定義 Props 類型
 * Omit 'name' 避免與原生 svg 的 name 屬性潛在衝突
 */
export interface IconProps extends Omit<React.ComponentProps<'svg'>, 'name'> {
    name: `${Collection}:${string}`
    /** 可選的降級 UI，當圖標找不到時顯示，避免破壞佈局 */
    fallback?: React.ReactNode
}

/**
 * 核心 Icon 組件
 * 1. 使用 forwardRef 讓父組件可以獲取 SVG 節點 (對 Tooltip/Popover 很重要)
 */
const IconComponent = forwardRef<SVGSVGElement, IconProps>(
    ({ name, fallback = null, ...props }, ref) => {
        // 安全檢查：確保傳入的 name 格式正確
        if (!name || !name.includes(':')) {
            console.error(`[Icon] Invalid format: "${name}". Expected "prefix:iconName"`)
            return <>{fallback}</>
        }

        const [prefix, iconKey] = name.split(':') as [Collection, string]
        const collection = ICON_COLLECTIONS[prefix]

        if (!collection) {
            console.error(`[Icon] Collection "${prefix}" is not registered.`)
            return <>{fallback}</>
        }

        // 將 collection 轉型為通用的元件 Record，這樣可以移除 @ts-ignore
        const IconsMap = collection as Record<string, React.ElementType>

        // 嘗試精確匹配 (例如庫中本來就是小寫開頭)，若無則嘗試首字母大寫匹配
        const capitalizedKey = iconKey.charAt(0).toUpperCase() + iconKey.slice(1)
        const Comp = IconsMap[iconKey] || IconsMap[capitalizedKey]

        if (!Comp) {
            console.warn(`[Icon] Icon "${iconKey}" or "${capitalizedKey}" not found in "${prefix}".`)
            return <>{fallback}</>
        }

        return <Comp ref={ref} {...props} />
    }
)

// 設置 displayName 方便在 React DevTools 中除錯
IconComponent.displayName = 'Icon'

/**
 * 2. 使用 React.memo 避免在父組件 re-render 時進行不必要的重新渲染
 */
export const Icon = memo(IconComponent)