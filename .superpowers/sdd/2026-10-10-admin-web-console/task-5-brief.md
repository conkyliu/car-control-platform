# Sprint 1 Task 5 Brief: 用户与 RBAC 角色权限中心 (`UserListView.tsx` + `RolePermissionView.tsx`)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 03（用户与权限管理，P0 3.1-3.4）、《开发计划-V2.1》与《docs/product/requirements-map.md》，在 `apps/web` 中交付企业级用户管理与细粒度 RBAC 角色权限配置中心。

## 2. 详细功能与交互规范

### A. 用户管理中心 (`apps/web/src/views/rbac/UserListView.tsx`)
1. **顶部指标概览卡片 (Summary Cards)**：
   - 用户总数 (Total Users)
   - 启用中用户 (Active Users，绿色)
   - 停用用户 (Disabled Users，灰色)
   - 待分配机构用户数 (Unassigned Org Users，橙色预警)
2. **多维筛选工具栏 (Filter Bar)**：
   - 关键字搜索（用户名 / 姓名 / 手机号模糊匹配）
   - 所属机构筛选（Cascader 级联或 TreeSelect 机构选择器）
   - 状态筛选（全部 / 启用 / 停用）
   - `+ 新增用户` 按钮（带 `UserAddOutlined` 图标）
3. **用户列表表格 (`Ant Design 6 Table`)**：
   - 列定义：
     - 用户名 (username，支持头像/Tag 渲染)
     - 真实姓名 (realName)
     - 手机号 (phone，脱敏展示如 `138****1234`，悬浮或点击可查看)
     - 所属机构 (orgName，Tag 标识)
     - 拥有角色 (roles，多个 Tag 渲染，不同角色区分色调)
     - 状态 (status，绿色 Tag "正常" / 红色 Tag "已停用")
     - 最近登录时间 (lastLoginAt)
     - 操作列：编辑、重置密码 (KeyOutlined)、启用/停用 (Popconfirm)、删除 (仅非系统预设且非自身账号可删)
4. **新建 / 编辑用户模态框 (UserModal)**：
   - 字段：用户名（英文及数字，4-20位）、真实姓名、手机号（中国大陆手机号强正则校验 `^1[3-9]\d{9}$`）、邮箱（可选，邮箱正则）、所属机构（TreeSelect 选择当前租户机构树）、角色多选（Select mode="multiple"）、初始密码（仅新建时必填，8位以上含字母数字）。
5. **重置密码模态框 (ResetPasswordModal)**：
   - 支持生成随机强密码或手动输入新密码，提示用户首次登录需强制修改。
6. **状态启停与安全门禁**：
   - 当前登录用户 (`useAuthStore.user.id`) 禁止停用或删除自己；
   - 超级管理员账户 (`admin`) 禁止删除。

### B. 角色与权限中枢 (`apps/web/src/views/rbac/RolePermissionView.tsx`)
1. **左右分栏响应式工作台 (Master-Detail Split Layout)**：
   - **左侧 (40%) 角色列表**：
     - 卡片列表或精简 Table 展示角色：角色名称、角色编码、数据权限范围 Tag、关联用户数、内置角色 Tag (`isSystem`)。
     - 顶部操作栏：`+ 新建角色` 按钮。
     - 选中行高亮，右侧同步加载该角色的权限树勾选状态。
     - 操作列：编辑、删除（`isSystem === true` 的内置角色禁用删除按钮，Tooltip 提示 "系统内置角色禁止删除"）。
   - **右侧 (60%) 细粒度权限配置与数据范围抽屉/卡片**：
     - 当前选中角色标题与标识。
     - **数据权限范围选择 (Data Scope)**：
       - `Radio.Group`：全部数据 (ALL)、本机构及子机构 (ORG_AND_CHILDREN)、仅本机构 (ORG_ONLY)、仅本人数据 (SELF_ONLY)。
     - **系统功能与操作权限树 (`Tree` checkable)**：
       - 包含 6 大业务集群（平台中枢、资产管理、车控运营、位置与围栏、运维保障、概览看板）。
       - 每个模块展开细分为菜单访问权限与操作级按钮权限（如 `car:control:engine`, `car:control:lock`, `device:config:write`, `ota:push:execute`）。
       - 便捷操作栏：全选、全不选、展开全部、折叠全部。
       - 内置角色保护：超级管理员 (`SUPER_ADMIN`) 核心权限只读勾选不可取消。
     - 底部保存按钮：点击持久化角色的权限代码清单与数据范围，弹出成功通知。

### C. 数据分层与 API 抽象
1. `apps/web/src/api/user.ts`:
   - `fetchUsersApi(params)`
   - `createUserApi(data)`
   - `updateUserApi(id, data)`
   - `deleteUserApi(id)`
   - `resetUserPasswordApi(id, newPassword)`
   - `updateUserStatusApi(id, status)`
2. `apps/web/src/api/role.ts`:
   - `fetchRolesApi()`
   - `createRoleApi(data)`
   - `updateRoleApi(id, data)`
   - `deleteRoleApi(id)`
   - `updateRolePermissionsApi(id, permissions, dataScope)`
   - `fetchPermissionTreeApi()`
3. 遵循 `isApiError` 模式：真实服务端异常报错中断并提示，离线环境优雅降级保底。
4. `apps/web/src/views/rbac/rbac-core.ts`:
   - 纯函数集合：手机号/邮箱格式校验、数据权限文案映射、角色列表统计、用户组合过滤、权限树递归构建与扁平展开。

### D. 路由与主布局挂载
1. 在 `apps/web/src/views/rbac/index.ts` 导出 `UserListView` 与 `RolePermissionView`。
2. 在 `apps/web/src/layouts/AdminLayout.tsx` 中挂载：
   - `activeKey === RoutePath.USERS` -> `<UserListView />`
   - `activeKey === RoutePath.ROLES` -> `<RolePermissionView />`

### E. 自动化测试要求 (`apps/web/src/test/rbac-views.test.ts`)
1. 手机号与邮箱正则校验函数测试；
2. 用户多维过滤组合测试（关键字、机构、状态）；
3. 角色统计与内置角色保护断言（禁止删除 admin/内置角色、禁止操作自身账号）；
4. 数据权限范围枚举与文案映射测试；
5. 权限树扁平化与全选/全不选纯逻辑测试；
6. 机构树与用户归属关联计算。

### F. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
