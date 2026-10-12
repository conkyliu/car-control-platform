# 手机控车平台 Admin 管理后台 · 视觉规范与 Design Tokens (Ant Design 6 纯 CSS 变量体系)

> **文档版本**：v1.0 (Sprint 0 基线)  
> **设计架构**：基于 Ant Design 6 原生纯 CSS 变量（Pure CSS Variables）体系，零运行时 CSS-in-JS 开销  
> **归属路径**：`docs/design/design-tokens.md`

---

## 1. 调色盘与品牌色彩体系 (Color Palette)

车控后台遵循**“科技深蓝 (Cyber Tech Navy)”**主调，兼顾日间明亮 (Light) 与夜间运维 (Dark) 双重沉浸式视觉，杜绝高饱和度造成的视觉疲劳。

### 1.1 主品牌色 (Primary Brand Colors)
```css
:root {
  /* 车控科技深蓝核心色系 */
  --car-color-primary: #1677ff;        /* 主交互色 / 按钮 / 选中态 */
  --car-color-primary-hover: #4096ff;  /* 悬浮提亮 */
  --car-color-primary-active: #0958d9; /* 点击按压 */
  --car-color-primary-bg: #e6f4ff;     /* 浅色填充背景 (选中条目) */
  --car-color-primary-border: #91caff; /* 主色描边 */

  /* 辅助背景与结构色 (科技中性色) */
  --car-bg-layout: #f5f7fa;            /* 全局工作区浅灰底色 */
  --car-bg-container: #ffffff;         /* 内容卡片 / 表格容器底色 */
  --car-bg-elevated: #ffffff;          /* 浮层 / 下拉 / Modal 容器底色 */
  --car-bg-header: #001529;            /* 顶部科技深蓝 Header 沉浸栏底色 */
  --car-bg-sidebar: #001529;           /* 侧边菜单栏沉浸底色 */

  /* 文本对比梯度 */
  --car-text-title: rgba(0, 0, 0, 0.88);       /* 主标题 / 强调文字 */
  --car-text-regular: rgba(0, 0, 0, 0.65);     /* 常规正文 / 标签 */
  --car-text-secondary: rgba(0, 0, 0, 0.45);   /* 次要辅助信息 / 时间戳 */
  --car-text-disabled: rgba(0, 0, 0, 0.25);    /* 禁用状态 */
}
```

---

## 2. 核心业务状态色彩标准化映射 (Semantic State Mapping)

系统严禁不同页面各自随意选择颜色。所有业务状态必须严格遵守下述语义映射：

### 2.1 设备在线状态 (Device Status)
| 状态名称 | 状态 Key | 对应颜色 Hex | AntD Tag 类型 | 场景示例 |
|---|---|---|---|---|
| **在线** | `ONLINE` | `#52c41a` (Green) | `success` | 心跳正常，4G 网络连接正常 |
| **离线** | `OFFLINE` | `#8c8c8c` (Gray) | `default` | 超过 300s 未收到心跳报文 |
| **告警** | `ALARMING` | `#ff4d4f` (Red) | `error` | 设备上报低电/防盗触发报警 |
| **升级中** | `UPGRADING` | `#1677ff` (Blue) | `processing` | 正在执行 OTA 固件更新 |
| **未激活** | `UNACTIVATED`| `#d9d9d9` (Light Gray) | `default` | 设备入库建档尚未通电入网 |

### 2.2 告警等级映射 (Alarm Severity - 4 级)
| 告警等级 | 等级代码 | 对应色彩 Hex | 标签背景/文字 | 业务含义与响应级别 |
|---|---|---|---|---|
| **紧急 (P0)** | `CRITICAL` | `#cf1322` (深红) | 红底白字高亮 | 车辆被盗、非法入侵、传感器硬件故障 |
| **高危 (P1)** | `HIGH` | `#fa541c` (橙红) | 橙红底白字 | 主电瓶严重欠压 (<11.0V)、电子围栏越界 |
| **中危 (P2)** | `MEDIUM` | `#faad14` (琥珀黄) | 暖黄深色字 | 异常震动、急加速/急转弯激烈驾驶 |
| **低危 (P3)** | `LOW` | `#595959` (中灰) | 浅灰弱化 | 备用电池供电、GPS 定位天线弱信号 |

### 2.3 车控 11 状态机色彩流转 (Command State Machine)
| 指令阶段 | 状态 Code | 色彩定义 | 交互样式 | 耗时提示预期 |
|---|---|---|---|---|
| **待下发** | `QUEUED` | `#1677ff` (Blue) | 脉冲动效 Badge | < 100ms |
| **等待应答** | `WAITING_ACK` | `#faad14` (Yellow) | `Spin` 转圈旋转 | 1.0s ~ 3.0s |
| **执行成功** | `SUCCESS` | `#52c41a` (Green) | 常驻绿色 Check | 终态，显示 ACK 耗时毫秒数 |
| **指令拒绝** | `REJECTED` | `#fa8c16` (Orange) | 橙色警告 Warning | 车机处于设防/行车中拒绝 |
| **超时未应答**| `TIMEOUT` | `#f5222d` (Red) | 红色超时钟表 | 超过 10s 未收到终端 ACK |
| **执行失败** | `FAILED` | `#a8071a` (Dark Red)| 红色叉号 Close | 硬件报错，可查看错误码 |

### 2.4 OTA 固件升级 4 步骤色彩与进度 (OTA Pipeline)
| 升级步骤 | Step Code | 主色调 | 进度条表现 |
|---|---|---|---|
| **1. 固件下载** | `DOWNLOADING` | `#1677ff` (科技蓝) | 动态流动进度条 0% ~ 100% |
| **2. 完整性校验**| `VERIFYING` | `#722ed1` (紫色) | 脉冲光效条 (SHA-256 Check) |
| **3. 芯片烧录** | `FLASHING` | `#fa8c16` (告警橙) | 警告色条 (严禁断电提示) |
| **4. 升级完成** | `SUCCESS` | `#52c41a` (绿色) | 饱满绿色条，版本号变更生效 |
| **升级中断** | `SKIPPED_UNSAFE` / `FAILED` | `#f5222d` (红色) | 截断红色，展示跳过/失败原因 |

---

## 3. 字体排版与页面栅格规范 (Typography & Spacing)

### 3.1 字体阶梯 (Font Scale)
- **大屏核心指标**：`32px ~ 40px`，Semibold (如当前在线设备总数 `12,480`)
- **页面主标题 / 抽屉标题**：`20px`，Medium (`#000000 88%`)
- **表格列头 / 卡片标题**：`16px`，Medium
- **表格正文 / 表单内容**：`14px`，Regular (行高 `22px`)
- **辅助说明 / 时间戳 / Tag 标签**：`12px`，Regular (行高 `20px`)

### 3.2 布局栅格与圆角 (Radii & Elevation)
- **基础圆角**：
  - 按钮与输入框：`radius = 6px`
  - 内容卡片与抽屉：`radius = 8px`
  - 状态气泡与徽标：`radius = 12px` (Pill 胶囊形)
- **投影体系 (Shadows)**：
  - 卡片常态：`box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03)`
  - 悬浮卡片：`box-shadow: 0 6px 16px 0 rgba(0, 0, 0, 0.08)`
  - 模态弹窗 Modal：`box-shadow: 0 9px 28px 8px rgba(0, 0, 0, 0.05)`

---

## 4. Ant Design 6 Theme ConfigProvider 样板配置

在 `apps/web/src/App.tsx` 或顶层入口中，以 Ant Design 6 规范注入定制主题：

```tsx
import { ConfigProvider, theme } from 'antd';

export const carControlTheme = {
  cssVar: true, // 开启 AntD 6 原生 Pure CSS 变量体系
  token: {
    colorPrimary: '#1677ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#1677ff',
    borderRadius: 6,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', sans-serif",
  },
  components: {
    Layout: {
      headerBg: '#001529',
      siderBg: '#001529',
    },
    Table: {
      headerBg: '#fafafa',
      rowHoverBg: '#f0f5ff',
    },
    Card: {
      headerHeight: 48,
    },
  },
};
```
