# Sprint 1 Task 5 Report: 用户与 RBAC 角色权限中心 (`UserListView.tsx` + `RolePermissionView.tsx`)

## 1. 任务基本信息
- **任务编号**：Sprint 1 Task 5
- **任务目标**：交付企业级用户管理与细粒度 RBAC 角色权限配置中心（包含用户列表、统计指标、筛选、模态框、40%/60% 左右分栏角色权限工作台、数据权限范围单选组、6大业务集群权限树等）。
- **Base Commit**：`97a3e1532102d3ebea26b9de4191b8599dbcb22b`
- **Current Commit**：`419c74b` (`feat(web): implement UserListView and RolePermissionView RBAC center`)
- **状态**：COMPLETED (100% 验收达标)

---

## 2. 交付物清单与代码路径

### 2.1 API 契约与 HTTP 客户端
1. `apps/web/src/api/user.ts`:
   - `fetchUsersApi(params)`: 用户列表检索接口
   - `createUserApi(data)`: 新增平台/租户用户账号
   - `updateUserApi(id, data)`: 用户信息及角色调整
   - `deleteUserApi(id)`: 用户账号注销删除
   - `resetUserPasswordApi(id, newPassword)`: 强密码重置
   - `updateUserStatusApi(id, status)`: 启用 / 停用状态流转
2. `apps/web/src/api/role.ts`:
   - `fetchRolesApi()`: 角色定义列表
   - `createRoleApi(data)`: 新建角色
   - `updateRoleApi(id, data)`: 编辑角色元数据
   - `deleteRoleApi(id)`: 删除自定义角色
   - `updateRolePermissionsApi(id, permissions, dataScope)`: 角色细粒度权限列表与数据权限范围持久化
   - `fetchPermissionTreeApi()`: 获取功能与操作级权限树

### 2.2 核心纯逻辑与安全门禁
3. `apps/web/src/views/rbac/rbac-core.ts`:
   - 手机号强正则校验 (`^1[3-9]\d{9}$`) 与邮箱规范校验
   - 用户名与密码复杂度校验、高强度随机密码生成器 (`generateRandomPassword`)
   - 手机号脱敏过滤 (`maskPhone`: `138****8001`)
   - 数据权限范围枚举 (`ALL`, `ORG_AND_CHILDREN`, `ORG_ONLY`, `SELF_ONLY`)、文案标签与色彩映射
   - 用户核心统计计算 (`calculateUserStats`) 与多维组合过滤 (`filterUsers`)
   - 角色统计指标 (`calculateRoleStats`) 与用户归属汇总 (`aggregateRoleUserCounts`)
   - 安全防误触与保护门禁：
     - 当前登录账号 (`useAuthStore.user.id`) 禁止停用或删除自身
     - 超级管理员账户 (`admin` / `SUPER_ADMIN`) 永久禁止删除
     - 系统内置角色 (`isSystem === true` / `SUPER_ADMIN` / `TENANT_ADMIN`) 禁止删除
     - 拥有关联用户的角色阻断删除
   - 6 大业务集群细粒度权限树体系定义与遍历工具 (`flattenPermissionKeys`, `getAllPermissionNodeKeys`)
   - 超级管理员核心管理权限锁定保护机制 (`SUPER_ADMIN_LOCKED_PERMISSIONS`)
   - 生产级种子数据备选 (`SEED_USERS`, `SEED_ROLES`)，支持离线与本地平滑降级

### 2.3 业务视图与主布局挂载
4. `apps/web/src/views/rbac/UserListView.tsx`:
   - 顶部指标卡片：用户总数、正常启用用户、已停用账号、待分配机构用户预警
   - 多维筛选工具栏：关键字（用户名/姓名/手机号）、所属机构 TreeSelect/Select、账号状态、角色多选与刷新
   - Ant Design 6 响应式 Table：头像与当前账号高亮、脱敏手机号与悬浮 Tooltip、机构 Tag、彩色角色 Tag、启停 Popconfirm 与安全保护删除按钮
   - 新建/编辑用户模态框：严格字段正则约束与机构树级联选择
   - 重置密码模态框：支持一键生成强密码与强制首登修改提示
5. `apps/web/src/views/rbac/RolePermissionView.tsx`:
   - 40%/60% Master-Detail 左右分栏工作台
   - 左侧 (40%)：角色列表卡片流、内置角色 Tag、关联用户人数徽标、新建角色弹窗、选中高亮与删除安全保护
   - 右侧 (60%)：当前角色标识与超级管理员警示通告、数据权限范围单选卡片组 (`ALL`, `ORG_AND_CHILDREN`, `ORG_ONLY`, `SELF_ONLY`)、6大业务集群可勾选权限树 (`Tree checkable`)、快捷全选/全不选/展开/折叠工具栏、超级管理员核心权限锁定保护、保存持久化操作
6. `apps/web/src/views/rbac/index.ts`:
   - 统一导出 `UserListView` 与 `RolePermissionView`
7. `apps/web/src/layouts/AdminLayout.tsx`:
   - 挂载路由：
     - `RoutePath.USERS` (`/users`) -> `<UserListView />`
     - `RoutePath.ROLES` (`/roles`) -> `<RolePermissionView />`

---

## 3. 自动化测试结果与覆盖率 (TDD)
- 测试文件：`apps/web/src/test/rbac-views.test.ts`
- 执行命令：`pnpm --filter @car-control/web test`
- 测试统计：53 个测试用例全部通过 (0 失败，0 告警)
- 覆盖测试点：
  1. `phone and email regex accurately validate standard formats and reject invalid inputs`
  2. `username and password validation enforce enterprise complexity constraints`
  3. `maskPhone masks sensitive middle 4 digits correctly`
  4. `data scope metadata correctly formats labels and theme colors`
  5. `calculateUserStats accurately computes summary metrics`
  6. `filterUsers filters across keyword, organization, status, and role`
  7. `canDeleteUser and canDisableUser safety guards enforce critical protections`
  8. `calculateRoleStats and aggregateRoleUserCounts compute counts accurately`
  9. `canDeleteRole protects system roles and roles with bound users`
  10. `permission tree contains all 6 clusters and supports traversal utilities`
  11. `isApiError differentiates server ApiError instances correctly`
  12. `user and role API client functions are exported and invoke http methods properly`

---

## 4. 生产构建验证
- 执行命令：`pnpm --filter @car-control/web build`
- 结果：TypeScript 5 类型检查 0 报错，Vite 8 / Rolldown 生产打包构建成功 (`dist/assets/index-B7sk58IK.js`)。

---

## 5. 潜在关注点与后续建议 (Concerns & Next Steps)
1. **真实后端接口联调**：当前前端已内置标准 RESTful 路径契约与网络降级兜底，微服务就绪后直接对接 `/api/v1/users` 与 `/api/v1/roles` 无缝上线；
2. **多租户数据权限联动**：数据权限范围（如 `ORG_AND_CHILDREN`）在后续车辆管理（Task 7）和车控工作台（Task 8）列表中，需在查询入参注入相应组织作用域。
