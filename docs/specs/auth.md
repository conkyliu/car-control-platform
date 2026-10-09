# Authentication & Authorization Specification (认证与授权规范)

## 1. 业务目标
为 Web 管理控制台、车载控车移动端及开放 API 提供统一、安全的身份认证与令牌管理，防止凭证泄露、会话伪造与越权访问。

## 2. 认证架构 (Dual-Token Model)

```text
Client (Web/APP)                           API Gateway / AuthService
      │                                                │
      ├─────── 1. POST /api/v1/auth/login ────────────►│ (校验密码 Hash + 租户状态)
      │        { username, password }                  │
      │                                                ├─ 生成 Access Token (15m)
      │◄────── 2. Return { accessToken, refreshToken }─┤  生成 Refresh Token (7d)
      │                                                │
      ├─────── 3. 请求业务接口 (携带 Access Token) ────►│ (JwtAuthGuard 快速验签)
      │        Authorization: Bearer <accessToken>     │
      │                                                │
      ├─────── 4. Access Token 过期 (401 EXPIRED) ────►│
      │                                                │
      ├─────── 5. POST /api/v1/auth/refresh ──────────►│ (校验并轮换 Refresh Token)
      │        { refreshToken }                        │
      │◄────── 6. Return 新 { accessToken, refreshToken }
```

## 3. 令牌安全约束
1. **Access Token**：
   - 有效期：15 分钟
   - 载荷 (Payload)：`sub (userId)`, `tenantId`, `username`, `roles`, `permissions`
   - 特点：完全无状态，业务 API 高性能本地验签，无需频繁访问数据库。
2. **Refresh Token**：
   - 有效期：7 天
   - 载荷：`sub (userId)`, `tenantId`, `familyId`, `tokenVersion`
   - 安全防护：支持单次轮换（Token Rotation），同一家族 Token 若被重复使用即判定为盗用，立即吊销所有关联会话。
3. **密码安全**：
   - 使用加盐哈希（如 bcrypt，cost factor >= 10）存储，绝不存明文或弱散列。
   - 连续输错 5 次触发锁定机制（30 分钟）。
