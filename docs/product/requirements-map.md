# 手机控车平台 188 项全量功能需求与 Admin 页面映射追踪矩阵 (Requirements Traceability Matrix)

> **规范版本**：v2.1 (Sprint 0 需求与设计基线)
> **原始文件依据**：《手机控车平台功能清单.docx》（东莞市新粤电子）
> **统计汇总**：全量 **23 个业务模块**，共 **188 项功能点**（P0 核心必备：111 项，P1 重要：65 项，P2 可选：12 项）
> **归属路径**：`docs/product/requirements-map.md`

---


## 01 系统登录与认证 (Auth & SSO)
**归属页面集群**：`认证鉴权` ｜ **主要 Admin 路由**：`/login` ｜ **核心 API 依据**：`POST /api/v1/auth/login, POST /api/v1/auth/refresh`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **1.1** | 账号密码登录 | `P0` | 用户名 + 密码登录后台，支持验证码（滑块验证）防机器人 | `/login` | `POST /api/v1/auth/login, POST /api/v1/auth/refresh` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **1.2** | 滑块验证码 | `P0` | 登录时拖动滑块完成人机验证，失败可刷新重试 | `/login` | `POST /api/v1/auth/login, POST /api/v1/auth/refresh` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **1.3** | 记住密码 | `P2` | 记住登录账号，减少重复输入 | `/login` | `POST /api/v1/auth/login, POST /api/v1/auth/refresh` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **1.4** | 忘记密码 | `P1` | 通过绑定手机号 / 邮箱验证后重置密码 | `/login` | `POST /api/v1/auth/login, POST /api/v1/auth/refresh` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **1.5** | 登录安全策略 | `P1` | 连续失败锁定、验证码错误次数限制、登录日志记录 | `/login` | `POST /api/v1/auth/login, POST /api/v1/auth/refresh` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **1.6** | 多语言登录 | `P2` | 登录页支持中英文等多语言切换 | `/login` | `POST /api/v1/auth/login, POST /api/v1/auth/refresh` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **1.7** | 单点登录 SSO | `P2` | 与企业既有账号体系对接，统一登录（可选扩展） | `/login` | `POST /api/v1/auth/login, POST /api/v1/auth/refresh` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 02 机构管理 (Organization Management)
**归属页面集群**：`平台中枢` ｜ **主要 Admin 路由**：`/orgs` ｜ **核心 API 依据**：`GET /api/v1/tenants/:id/orgs, POST /api/v1/tenants/:id/orgs`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **2.1** | 机构列表 | `P0` | 多级机构树形结构，机构增删改查、上级机构关系维护 | `/orgs` | `GET /api/v1/tenants/:id/orgs, POST /api/v1/tenants/:id/orgs` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **2.2** | 机构申请 | `P1` | 下级机构 / 经销商自助申请入驻，提交资质信息 | `/orgs` | `GET /api/v1/tenants/:id/orgs, POST /api/v1/tenants/:id/orgs` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **2.3** | 机构审批 | `P1` | 上级机构审核下级机构入驻申请，通过 / 驳回 | `/orgs` | `GET /api/v1/tenants/:id/orgs, POST /api/v1/tenants/:id/orgs` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **2.4** | 机构配额 | `P1` | 机构设备数、车辆数、用户数配额配置与超限控制 | `/orgs` | `GET /api/v1/tenants/:id/orgs, POST /api/v1/tenants/:id/orgs` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **2.5** | 机构状态管理 | `P0` | 启用 / 停用机构，停用后其下资源不可用 | `/orgs` | `GET /api/v1/tenants/:id/orgs, POST /api/v1/tenants/:id/orgs` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **2.6** | 机构数据隔离 | `P0` | 机构间数据权限隔离，仅可查看本机构及下级数据 | `/orgs` | `GET /api/v1/tenants/:id/orgs, POST /api/v1/tenants/:id/orgs` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 03 用户与权限管理 (User & RBAC)
**归属页面集群**：`平台中枢` ｜ **主要 Admin 路由**：`/users, /roles` ｜ **核心 API 依据**：`GET /api/v1/users, POST /api/v1/users, GET /api/v1/roles`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **3.1** | 用户管理 | `P0` | 用户增删改查、启用 / 停用、重置密码、所属机构分配 | `/users, /roles` | `GET /api/v1/users, POST /api/v1/users, GET /api/v1/roles` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **3.2** | 角色管理 | `P0` | 角色定义，绑定菜单权限、功能权限、数据范围 | `/users, /roles` | `GET /api/v1/users, POST /api/v1/users, GET /api/v1/roles` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **3.3** | 权限配置 | `P0` | 功能权限点、数据范围（机构/区域/车辆）授权 | `/users, /roles` | `GET /api/v1/users, POST /api/v1/users, GET /api/v1/roles` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **3.4** | 操作审计日志 | `P0` | 关键操作（控车、参数修改、权限变更）全量留痕、可追溯 | `/users, /roles` | `GET /api/v1/users, POST /api/v1/users, GET /api/v1/roles` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **3.5** | 个人中心 | `P1` | 个人信息查看、修改密码 | `/users, /roles` | `GET /api/v1/users, POST /api/v1/users, GET /api/v1/roles` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 04 设备管理 (Device Management)
**归属页面集群**：`资产管理` ｜ **主要 Admin 路由**：`/devices` ｜ **核心 API 依据**：`GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **4.1** | 设备建档 | `P0` | 单个 / 批量导入设备（设备号、ICCID、固件版本），Excel 模板导入 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.2** | 设备列表 | `P0` | 按机构 / 状态 / 类型搜索、筛选、分页 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.3** | 设备状态监测 | `P0` | 在线 / 离线 / 被拆 / 低电压实时状态，信号强度、电压、温度 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.4** | 设备详情 | `P0` | 设备基础信息、SIM 卡、固件版本、绑定车辆、所属机构 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.5** | 设备参数配置 | `P0` | 远程读取 / 设置模组参数（心跳时间、APN、蓝牙 PKE、定位开关等） | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.6** | 设备调试 | `P1` | 远程指令调试、实时日志查看、通信链路诊断 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.7** | 设备激活 / 停用 | `P0` | 资产激活、服务到期停用、续费激活 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.8** | 到期查询 | `P1` | 设备服务到期状态批量查询与提醒 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.9** | 记录仪管理 | `P2` | 行车记录仪设备接入与管理（可选扩展） | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.10** | 液晶钥匙管理 | `P2` | 液晶钥匙设备管理（可选扩展） | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.11** | 设备模糊查询 | `P0` | 支持设备号、版本号、ICCID 等字段模糊搜索，输入关键字即时过滤 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.12** | 按项目筛选 | `P0` | 按设备所属项目筛选设备列表，支持项目下拉选择 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.13** | 多维度组合筛选 | `P0` | 按在线 / 离线状态、固件版本、机构、车型等多维度组合筛选 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **4.14** | 设备列表字段展示 | `P0` | 列表展示设备号、版本号、在线/离线状态、所属项目、绑定车辆等关键信息 | `/devices` | `GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 05 车辆管理 (Vehicle Management)
**归属页面集群**：`资产管理` ｜ **主要 Admin 路由**：`/vehicles` ｜ **核心 API 依据**：`GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **5.1** | 车辆列表 | `P0` | 车牌号、车型、车架号 VIN、绑定设备、车主信息检索 | `/vehicles` | `GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **5.2** | 车型管理 | `P0` | 车型代号、品牌、能力模板关联（对应协议车型代号 0x02） | `/vehicles` | `GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **5.3** | 车辆品牌管理 | `P1` | 品牌 / 车系维度维护，供车型引用 | `/vehicles` | `GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **5.4** | 车辆绑定 / 解绑 / 转让 | `P0` | 车主绑定、解绑、车辆转让（转移设备与授权关系） | `/vehicles` | `GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **5.5** | 车辆状态监控 | `P0` | 车身状态、车身信息、空调信息实时展示 | `/vehicles` | `GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **5.6** | 安装记录 | `P1` | 安装工单、安装记录、验收记录 | `/vehicles` | `GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **5.7** | 操作记录 | `P0` | 车辆全部操作历史（含指令、参数修改、授权变更） | `/vehicles` | `GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **5.8** | 预警记录 | `P0` | 车辆预警 / 报警历史记录检索 | `/vehicles` | `GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 06 车控中心 (Car Control Center)
**归属页面集群**：`车控运营` ｜ **主要 Admin 路由**：`/commands` ｜ **核心 API 依据**：`POST /api/v1/commands, WS: command.status`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **6.1** | 门锁控制 | `P0` | 远程上锁 / 开锁（协议指令 0x00 / 0x01） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.2** | 尾箱控制 | `P0` | 远程开 / 关尾箱（协议指令 0x02） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.3** | 发动机控制 | `P0` | 远程点火 / 熄火，支持熄火时长设置（5-45 分钟，协议 0x04 / 0x05） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.4** | 车窗控制 | `P0` | 远程升窗 / 降窗（协议 0x07 / 0x08） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.5** | 中门控制 | `P1` | 左 / 右中门打开、关闭控制（协议 0x09） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.6** | 寻车 | `P0` | 远程寻车（喇叭 / 灯光提示，协议 0x03） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.7** | 空调控制 | `P0` | 空调开关、温度加减、风速加减、内外循环、前窗除雾（协议 0xD3） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.8** | 座椅控制 | `P1` | 主 / 副驾座椅通风、座椅加热档位控制（协议 0x10 / 0x11） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.9** | 车身信息获取 | `P0` | 主动拉取车身信息数据（协议 0x06） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.10** | 指令下发 | `P0` | 指令下发、等待设备应答、结果反馈 | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.11** | 指令记录 | `P0` | 指令历史（指令、参数、时间、结果、操作人） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.12** | 指令状态机 | `P0` | 待下发 → 已下发 → 设备应答 → 成功 / 失败 / 超时 | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **6.13** | 遥控器学习 | `P2` | 原车遥控器学习功能（协议 0x0A，可选） | `/commands` | `POST /api/v1/commands, WS: command.status` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 07 能力配置中心 (Capability Configuration)
**归属页面集群**：`车控运营` ｜ **主要 Admin 路由**：`/commands/capabilities` ｜ **核心 API 依据**：`GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **7.1** | 指令字典管理 | `P0` | 指令增删改查、分类、参数 Schema 定义 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.2** | 协议映射配置 | `P0` | 抽象指令 ↔ 协议指令 ID / 参数编码映射配置 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.3** | 车型能力模板 | `P0` | 按车型定义默认可用指令清单与参数范围 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.4** | 模板版本管理 | `P1` | 车型能力模板版本管理与灰度发布 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.5** | 单车可控范围 | `P0` | 针对单台车启用 / 禁用指令、覆盖参数范围 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.6** | 安全等级配置 | `P0` | L0 免密 / L1 需密码 / L2 二次确认分级配置 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.7** | 时段 / 频次限制 | `P1` | 可用时段、单位时间次数限制（如限流） | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.8** | 地理围栏限制 | `P1` | 限定区域内才可远程控车 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.9** | 批量配置 | `P1` | 按车型 / 批次批量下发可控范围配置 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.10** | 参数集合管理 | `P0` | 参数集合 1/2、拨码开关等参数配置（协议 0x61/0x62） | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **7.11** | 配置继承与校验 | `P0` | 全局 → 车型 → 单车三级继承优先级与下发前校验 | `/commands/capabilities` | `GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 08 报警通知中心 (Alarm & Alert Center)
**归属页面集群**：`运维保障` ｜ **主要 Admin 路由**：`/alarms` ｜ **核心 API 依据**：`GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **8.1** | 报警类型管理 | `P0` | 低电压、设备被拆、非法开门、非法点火、震动、设防失败等 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **8.2** | 报警等级 | `P0` | 提示 / 警告 / 严重分级，可自定义 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **8.3** | 报警规则 | `P1` | 阈值、连续上报次数、时间窗等规则配置 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **8.4** | 报警记录 | `P0` | 报警全量留痕、检索、导出 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **8.5** | 处置工单 | `P1` | 报警派单、跟进、闭环确认 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **8.6** | 通知渠道 | `P0` | APP 推送、短信、语音外呼、第三方推送多渠道触达 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **8.7** | 消息模板 | `P1` | 通知模板配置与变量替换 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **8.8** | 订阅管理 | `P1` | 用户自定义报警订阅与接收方式 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **8.9** | 预警中心大屏 | `P1` | 预警监控大屏、投屏监控、资料管理 | `/alarms` | `GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 09 钥匙管理与蓝牙 (Digital Key & BLE)
**归属页面集群**：`资产管理` ｜ **主要 Admin 路由**：`/keys` ｜ **核心 API 依据**：`GET /api/v1/keys, POST /api/v1/keys/share`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **9.1** | 钥匙管理 | `P0` | 数字钥匙生成、删除、查看 | `/keys` | `GET /api/v1/keys, POST /api/v1/keys/share` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **9.2** | 授权管理 | `P0` | 指令级授权、有效时段、使用次数限制 | `/keys` | `GET /api/v1/keys, POST /api/v1/keys/share` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **9.3** | 钥匙分享 | `P0` | 通过微信 / 短信分享给他人 | `/keys` | `GET /api/v1/keys, POST /api/v1/keys/share` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **9.4** | 冻结 / 解冻 | `P0` | 钥匙冻结、解冻，冻结后立即失效 | `/keys` | `GET /api/v1/keys, POST /api/v1/keys/share` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **9.5** | 授权记录 | `P1` | 授权历史记录 | `/keys` | `GET /api/v1/keys, POST /api/v1/keys/share` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **9.6** | 冻结记录 | `P1` | 冻结 / 解冻历史记录 | `/keys` | `GET /api/v1/keys, POST /api/v1/keys/share` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **9.7** | BLE 近场控车 | `P0` | 蓝牙验证密码（协议 0xA1-A5）、近场直连 TBox 控车 | `/keys` | `GET /api/v1/keys, POST /api/v1/keys/share` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 10 定位管理 (Location & Geofence)
**归属页面集群**：`位置与围栏` ｜ **主要 Admin 路由**：`/telemetry, /geofence` ｜ **核心 API 依据**：`GET /api/v1/locations/latest, GET /api/v1/locations/trajectory, GET /api/v1/geofences`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **10.1** | 实时定位 | `P0` | 车辆实时经纬度、速度、方向、点火状态展示 | `/telemetry, /geofence` | `GET /api/v1/locations/latest, GET /api/v1/locations/trajectory, GET /api/v1/geofences` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **10.2** | 轨迹回放 | `P0` | 历史轨迹回放与查询 | `/telemetry, /geofence` | `GET /api/v1/locations/latest, GET /api/v1/locations/trajectory, GET /api/v1/geofences` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **10.3** | 电子围栏 | `P1` | 围栏创建、进出围栏报警 | `/telemetry, /geofence` | `GET /api/v1/locations/latest, GET /api/v1/locations/trajectory, GET /api/v1/geofences` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **10.4** | 定位数据存储 | `P0` | 定位数据入库、分级热冷存储（热 30 天 / 冷 1 年） | `/telemetry, /geofence` | `GET /api/v1/locations/latest, GET /api/v1/locations/trajectory, GET /api/v1/geofences` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 11 数据统计分析 (Data & Dashboard)
**归属页面集群**：`概览看板` ｜ **主要 Admin 路由**：`/dashboard` ｜ **核心 API 依据**：`GET /api/v1/dashboard/stats, GET /api/v1/metrics`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **11.1** | 设备在线率 | `P0` | 在线 / 离线 / 活跃设备分布统计 | `/dashboard` | `GET /api/v1/dashboard/stats, GET /api/v1/metrics` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **11.2** | 指令统计 | `P0` | 指令类型分布、成功率、失败原因分析 | `/dashboard` | `GET /api/v1/dashboard/stats, GET /api/v1/metrics` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **11.3** | 报警统计 | `P0` | 报警类型、趋势、处置率统计 | `/dashboard` | `GET /api/v1/dashboard/stats, GET /api/v1/metrics` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **11.4** | 区域统计 | `P1` | 按机构 / 区域 / 车型分布统计 | `/dashboard` | `GET /api/v1/dashboard/stats, GET /api/v1/metrics` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **11.5** | 会员统计 | `P1` | 会员增长、活跃度统计 | `/dashboard` | `GET /api/v1/dashboard/stats, GET /api/v1/metrics` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **11.6** | 驾驶数据分析 | `P1` | 里程、油耗、续航里程等驾驶数据统计 | `/dashboard` | `GET /api/v1/dashboard/stats, GET /api/v1/metrics` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **11.7** | 可视化大屏 | `P1` | 车辆 / 报警 / 指令实时监控看板 | `/dashboard` | `GET /api/v1/dashboard/stats, GET /api/v1/metrics` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **11.8** | 报表导出 | `P0` | 多维报表、自定义维度、导出 Excel / PDF | `/dashboard` | `GET /api/v1/dashboard/stats, GET /api/v1/metrics` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 12 财务与增值服务 (Billing & Value-added)
**归属页面集群**：`财务增值` ｜ **主要 Admin 路由**：`/billing` ｜ **核心 API 依据**：`GET /api/v1/billing/orders (待二期补齐)`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **12.1** | 订单查询 | `P1` | 服务订单检索与详情 | `/billing` | `GET /api/v1/billing/orders (待二期补齐)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **12.2** | 收支明细 | `P1` | 平台 / 机构收支记录 | `/billing` | `GET /api/v1/billing/orders (待二期补齐)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **12.3** | 平台充值 | `P1` | 平台账户充值 | `/billing` | `GET /api/v1/billing/orders (待二期补齐)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **12.4** | 机构提现 | `P1` | 机构提现申请、审核、打款 | `/billing` | `GET /api/v1/billing/orders (待二期补齐)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **12.5** | 商品模板 | `P1` | 服务商品模板配置 | `/billing` | `GET /api/v1/billing/orders (待二期补齐)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **12.6** | 价格管理 | `P1` | 商品价格配置（按车型/周期） | `/billing` | `GET /api/v1/billing/orders (待二期补齐)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **12.7** | 提成管理 | `P2` | 分销 / 代理提成配置 | `/billing` | `GET /api/v1/billing/orders (待二期补齐)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **12.8** | 账户交易明细 | `P1` | 平台 / 机构账户交易流水 | `/billing` | `GET /api/v1/billing/orders (待二期补齐)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 13 物联卡管理 (SIM & IoT Card)
**归属页面集群**：`资产管理` ｜ **主要 Admin 路由**：`/devices/sim` ｜ **核心 API 依据**：`GET /api/v1/sim-cards (关联设备详情)`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **13.1** | 卡商管理 | `P1` | SIM 卡供应商管理 | `/devices/sim` | `GET /api/v1/sim-cards (关联设备详情)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **13.2** | 设备卡管理 | `P1` | 设备绑定 SIM 卡、卡状态管理 | `/devices/sim` | `GET /api/v1/sim-cards (关联设备详情)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **13.3** | 模块卡管理 | `P1` | 通讯模组 SIM 卡管理 | `/devices/sim` | `GET /api/v1/sim-cards (关联设备详情)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **13.4** | SIM 卡查询 | `P1` | 卡号、ICCID、状态查询 | `/devices/sim` | `GET /api/v1/sim-cards (关联设备详情)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 14 固件与软件升级 (Firmware OTA)
**归属页面集群**：`运维保障` ｜ **主要 Admin 路由**：`/ota` ｜ **核心 API 依据**：`POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **14.1** | 主机固件管理 | `P0` | 通讯模组固件版本维护 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.2** | TBox 固件管理 | `P0` | TBox 主机固件版本维护 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.3** | 固件上传 | `P0` | 固件文件上传、CRC 校验、类型识别 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.4** | 版本管理 | `P0` | 固件版本、适配车型关联管理 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.5** | 升级计划 | `P0` | 灰度 / 全量升级计划制定 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.6** | 升级执行 | `P0` | 升级请求下发、文件分片传输（协议 0x68 / 0x28） | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.7** | 升级记录 | `P0` | 升级结果、进度、失败原因记录 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.8** | 断点续传 | `P0` | 基于文件地址 + 数据长度分片续传，进度计算 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.9** | 按项目类别上传固件 | `P0` | 固件上传时按项目分类归档，不同项目独立维护固件版本 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.10** | 按项目类别选择固件 | `P0` | 升级时按项目筛选可用固件，避免跨项目误升级 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.11** | 按条件批量升级 | `P0` | 支持输入设备号范围、按项目/车型/状态等条件筛选后批量下发升级 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.12** | 熄火状态校验 | `P0` | 升级前自动校验车辆是否处于熄火状态，仅熄火车辆允许升级 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **14.13** | 升级白名单 | `P1` | 支持设备号白名单导入，精确控制升级范围 | `/ota` | `POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 15 版本与应用管理 (App & Version)
**归属页面集群**：`系统运维` ｜ **主要 Admin 路由**：`/system/app-versions` ｜ **核心 API 依据**：`GET /api/v1/app/versions (系统配置)`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **15.1** | APP 版本管理 | `P1` | iOS / Android 版本管理 | `/system/app-versions` | `GET /api/v1/app/versions (系统配置)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **15.2** | APP 升级 | `P1` | 升级推送、强制升级策略 | `/system/app-versions` | `GET /api/v1/app/versions (系统配置)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **15.3** | APP 菜单配置 | `P1` | APP 功能菜单、功能开关配置 | `/system/app-versions` | `GET /api/v1/app/versions (系统配置)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **15.4** | APP 默认配置 | `P1` | 设备 / APP 默认权限、默认参数 | `/system/app-versions` | `GET /api/v1/app/versions (系统配置)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **15.5** | APP 语言管理 | `P2` | 多语言文案管理 | `/system/app-versions` | `GET /api/v1/app/versions (系统配置)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **15.6** | APP UI 管理 | `P2` | APP UI 配置与升级 | `/system/app-versions` | `GET /api/v1/app/versions (系统配置)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 16 系统运维管理 (System Ops & Monitoring)
**归属页面集群**：`系统运维` ｜ **主要 Admin 路由**：`/monitor` ｜ **核心 API 依据**：`GET /metrics, GET /api/v1/monitor/health`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **16.1** | 系统翻译 | `P2` | 后台多语言文案管理 | `/monitor` | `GET /metrics, GET /api/v1/monitor/health` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **16.2** | 帮助文档 | `P1` | 操作手册、使用帮助 | `/monitor` | `GET /metrics, GET /api/v1/monitor/health` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **16.3** | 接口文档 | `P0` | 开放 API 文档与调试工具 | `/monitor` | `GET /metrics, GET /api/v1/monitor/health` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **16.4** | 日志中心 | `P1` | 产品日志、接口日志、操作日志 | `/monitor` | `GET /metrics, GET /api/v1/monitor/health` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **16.5** | 系统参数 | `P1` | 全局参数配置（有效期、开关等） | `/monitor` | `GET /metrics, GET /api/v1/monitor/health` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **16.6** | 数据字典 | `P1` | 枚举、字典项管理 | `/monitor` | `GET /metrics, GET /api/v1/monitor/health` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **16.7** | 消息通知管理 | `P1` | 站内信、系统通知管理 | `/monitor` | `GET /metrics, GET /api/v1/monitor/health` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 17 开放 API 与对接 (Open API & Integration)
**归属页面集群**：`系统运维` ｜ **主要 Admin 路由**：`/system/open-api` ｜ **核心 API 依据**：`GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **17.1** | 鉴权接口 | `P0` | 登录、令牌签发、刷新、鉴权 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.2** | 设备接口 | `P0` | 设备建档、查询、绑定、参数配置 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.3** | 控车接口 | `P0` | 指令下发、状态查询、回执推送 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.4** | 能力接口 | `P0` | 指令字典、车型模板、可控范围查询 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.5** | 报警接口 | `P0` | 报警查询、订阅、处置回调 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.6** | 统计接口 | `P1` | 运营数据、报表查询 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.7** | 第三方推送 | `P1` | 腾讯、支付宝等第三方推送通道 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.8** | 短信 / 邮件 | `P1` | 短信、邮件通道对接 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.9** | 地图服务 | `P1` | 地图展示、逆地理编码 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **17.10** | 支付对接 | `P1` | 支付宝、PayPal 支付对接 | `/system/open-api` | `GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 18 长连接网关 (Gateway & Connection)
**归属页面集群**：`系统运维` ｜ **主要 Admin 路由**：`/monitor/gateway` ｜ **核心 API 依据**：`GET /metrics (car_active_simulators, car_websocket_connections)`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **18.1** | TCP 长连接 | `P0` | Netty 长连接管理、设备登录认证（45 秒内登录） | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.2** | TLV 编解码 | `P0` | TLV 结构解析与组包、小端序处理 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.3** | AES 加解密 | `P0` | AES-128-CBC 加解密、明文 / 加密双态 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.4** | CRC 校验 | `P0` | CRC16-XMODEM 校验 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.5** | 心跳管理 | `P0` | 心跳包处理、设备状态、电压、温度 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.6** | 定位处理 | `P0` | 定位数据包解析、经纬度、速度、方向 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.7** | 报警处理 | `P0` | 报警数据包解析与事件分发 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.8** | OTA 处理 | `P0` | 固件升级数据包处理、分片传输 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.9** | 协议适配 | `P0` | 抽象指令 ↔ 具体协议映射与转换 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **18.10** | 连接管理 | `P0` | 连接池、异步处理、背压控制、水平扩展 | `/monitor/gateway` | `GET /metrics (car_active_simulators, car_websocket_connections)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 19 通讯日志中心 (Communication Logs)
**归属页面集群**：`运维保障` ｜ **主要 Admin 路由**：`/logs` ｜ **核心 API 依据**：`GET /api/v1/logs/communication, GET /api/v1/logs/export`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **19.1** | 网络通讯日志 | `P0` | 记录 TCP 上行 / 下行原始通讯数据，含设备号、时间戳、通讯数据明文 | `/logs` | `GET /api/v1/logs/communication, GET /api/v1/logs/export` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **19.2** | 日志保留策略 | `P0` | 网络通讯日志至少保留 7 天，支持配置保留时长，过期自动归档或清理 | `/logs` | `GET /api/v1/logs/communication, GET /api/v1/logs/export` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **19.3** | 日志一键导出 | `P0` | 支持按设备号 / 时间范围筛选，一键导出为 Excel 表格 | `/logs` | `GET /api/v1/logs/communication, GET /api/v1/logs/export` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **19.4** | 蓝牙通讯日志（本地） | `P0` | APP 端记录蓝牙上行 / 下行原始数据在本地，至少保留 3 天 | `/logs` | `GET /api/v1/logs/communication, GET /api/v1/logs/export` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **19.5** | 蓝牙日志上传 | `P0` | APP 端支持一键将本地蓝牙日志上传至服务器存储 | `/logs` | `GET /api/v1/logs/communication, GET /api/v1/logs/export` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **19.6** | 蓝牙日志下载 | `P0` | 平台端可查看已上传的蓝牙日志，并支持下载至本地 | `/logs` | `GET /api/v1/logs/communication, GET /api/v1/logs/export` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **19.7** | 日志检索 | `P1` | 按设备号、时间范围、指令类型、通讯方向等多维度检索日志 | `/logs` | `GET /api/v1/logs/communication, GET /api/v1/logs/export` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **19.8** | 日志解码展示 | `P1` | 原始数据支持 TLV 结构解码展示，便于排查问题 | `/logs` | `GET /api/v1/logs/communication, GET /api/v1/logs/export` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 20 部署与基础设施 (Multi-region & Infra)
**归属页面集群**：`系统运维` ｜ **主要 Admin 路由**：`/system/regions` ｜ **核心 API 依据**：`GET /api/v1/regions (多区域集群状态)`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **20.1** | 双区域架构 | `P0` | 内地（华东/华南）与香港节点部署，车辆就近接入，满足数据合规要求 | `/system/regions` | `GET /api/v1/regions (多区域集群状态)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **20.2** | 配置数据同步 | `P0` | 内地服务器修改的配置（指令字典、车型模板、可控范围等）快速同步到香港服务器 | `/system/regions` | `GET /api/v1/regions (多区域集群状态)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **20.3** | 数据同步机制 | `P0` | 基于消息队列 / 数据订阅的近实时同步，秒级延迟 | `/system/regions` | `GET /api/v1/regions (多区域集群状态)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **20.4** | 同步状态监控 | `P1` | 同步延迟、同步成功率、异常告警可视化监控 | `/system/regions` | `GET /api/v1/regions (多区域集群状态)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **20.5** | 冲突解决策略 | `P1` | 双写冲突检测与解决策略（以国内节点为准 / 时间戳优先） | `/system/regions` | `GET /api/v1/regions (多区域集群状态)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **20.6** | 管理面互通 | `P1` | 管理员可从任一节点登录管理，操作在双区域生效 | `/system/regions` | `GET /api/v1/regions (多区域集群状态)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **20.7** | 数据分区存储 | `P0` | 国内车辆数据存国内节点，海外车辆数据存香港节点，核心配置双向同步 | `/system/regions` | `GET /api/v1/regions (多区域集群状态)` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 21 项目化管理 (Project Management)
**归属页面集群**：`平台中枢` ｜ **主要 Admin 路由**：`/projects` ｜ **核心 API 依据**：`GET /api/v1/projects, POST /api/v1/projects`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **21.1** | 项目管理 | `P0` | 项目创建、编辑、停用，项目基础信息（名称、编码、客户、周期）维护 | `/projects` | `GET /api/v1/projects, POST /api/v1/projects` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **21.2** | 设备项目归属 | `P0` | 设备绑定到指定项目，一台设备仅属于一个项目 | `/projects` | `GET /api/v1/projects, POST /api/v1/projects` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **21.3** | 项目功能配置 | `P0` | 按项目配置启用 / 禁用功能模块，控制该项目可见的功能范围 | `/projects` | `GET /api/v1/projects, POST /api/v1/projects` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **21.4** | 平台端界面定制 | `P0` | 平台端按项目显示对应界面，隐藏或禁用该项目没有的功能菜单与页面 | `/projects` | `GET /api/v1/projects, POST /api/v1/projects` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **21.5** | APP 端界面定制 | `P0` | APP 端根据设备所属项目，动态显示对应的功能界面与按钮 | `/projects` | `GET /api/v1/projects, POST /api/v1/projects` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **21.6** | 项目数据隔离 | `P0` | 不同项目数据相互隔离，项目内用户仅可见本项目设备与数据 | `/projects` | `GET /api/v1/projects, POST /api/v1/projects` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **21.7** | 项目模板 | `P1` | 支持从现有项目复制配置，快速创建新项目 | `/projects` | `GET /api/v1/projects, POST /api/v1/projects` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **21.8** | 项目品牌定制 | `P2` | 项目级 Logo、主题色、欢迎页等品牌元素定制（可选扩展） | `/projects` | `GET /api/v1/projects, POST /api/v1/projects` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 22 SaaS 多租户管理 (Multi-tenant Architecture)
**归属页面集群**：`平台中枢` ｜ **主要 Admin 路由**：`/tenants` ｜ **核心 API 依据**：`GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **22.1** | 租户隔离 | `P0` | 数据级租户隔离，各租户数据独立存储、互不可见 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **22.2** | 租户自助开通 | `P1` | 支持租户在线注册、申请开通、试用转正式 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **22.3** | 租户配额管理 | `P0` | 按租户配置设备数、用户数、存储容量、API 调用量等配额 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **22.4** | 租户计费 | `P1` | 按设备量 / 使用量 / 套餐计费，支持预付费、后付费模式 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **22.5** | 租户管理员 | `P0` | 租户自管理：用户、角色、机构、项目等租户级管理后台 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **22.6** | 共享基础设施 | `P0` | 计算、存储、网络资源共享，通过逻辑隔离实现多租户 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **22.7** | 租户定制化 | `P1` | 支持租户级功能开关、界面配置、品牌定制 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **22.8** | 运营总控台 | `P0` | 平台运营方总控台，统一管理所有租户、监控资源使用 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **22.9** | 租户数据导出 | `P2` | 租户可导出自身全部数据，支持数据迁移与注销 | `/tenants` | `GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |

## 23 用户体验与设计规范 (UX & Design Guidelines)
**归属页面集群**：`UI/UX规范` ｜ **主要 Admin 路由**：`全局交互标准` ｜ **核心 API 依据**：`前端设计规范与通用交互组件`

| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |
|---|---|:---:|---|---|---|---|
| **23.1** | 自然交互语言 | `P0` | 界面文案采用人工自然表达，避免 AI 生成感的套话与模板化措辞 | `全局交互标准` | `前端设计规范与通用交互组件` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **23.2** | 界面细节打磨 | `P0` | 按钮、图标、间距、动效等细节经过精心设计，避免批量生成的粗糙感 | `全局交互标准` | `前端设计规范与通用交互组件` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **23.3** | 功能逻辑严谨 | `P0` | 业务流程、异常处理、边界条件经过深度梳理，确保逻辑闭环无遗漏 | `全局交互标准` | `前端设计规范与通用交互组件` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **23.4** | 品牌调性统一 | `P1` | 整体视觉风格、交互模式、文案风格保持一致，体现专业产品品质 | `全局交互标准` | `前端设计规范与通用交互组件` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **23.5** | 真实业务场景 | `P0` | 功能设计贴合实际用车场景，而非抽象的功能堆砌 | `全局交互标准` | `前端设计规范与通用交互组件` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |
| **23.6** | 人性化容错 | `P1` | 误操作可撤回、关键操作二次确认、异常状态有明确引导 | `全局交互标准` | `前端设计规范与通用交互组件` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |