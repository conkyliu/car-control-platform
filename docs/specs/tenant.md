# Multi-Tenant & Organization Specification (多租户与组织权限规范)

## 1. 业务目标
实现企业级 SaaS 多租户深度隔离、组织树分级管理、项目划分及资源配额管控。

## 2. 租户模型体系

```text
SaaS 运营总控台 (Super Admin)
  │
  ├─ 租户 A (Tenant A) ── 独立配额 (如最多接入 5,000 台设备)
  │    ├─ 组织机构 (Organization Tree: 华南分部 -> 深圳车队)
  │    ├─ 用户与角色 (RBAC: 租户管理员, 运维调度员, 普通车主)
  │    └─ 项目 (Project: 鹏程网约车一期, 租赁业务二期)
  │         ├─ 绑定车辆
  │         └─ 绑定设备
  │
  └─ 租户 B (Tenant B) ── 独立配额 (如最多接入 2,000 台设备)
       └─ ... (数据完全逻辑隔离，物理互不穿透)
```

## 3. 多租户数据隔离防线
1. **HTTP 边界**：`JwtAuthGuard` 从请求 Token 提取 `tenantId`，注入 `AsyncLocalStorage (TenantContext)`。
2. **Repository 边界**：所有业务 Repository 继承 `TenantAwareRepository`，强制拼装 `tenantId = TenantContext.getTenantId()` 查询与写入条件。
3. **禁止唯 ORM 防线**：禁止仅靠单个全局 ORM 拦截器，代码必须显式声明边界。
4. **配额硬防线**：设备建档与激活时，若租户名下设备总数 >= `quotaDeviceCount`，则强制拒绝建档（HTTP 400 `QUOTA_EXCEEDED`）。
