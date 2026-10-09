# 手机控车平台 (Car Control Platform) · V2.0

基于 React 19 + NestJS 12 + PostgreSQL + Redis + BullMQ + 阿里云 IoT MQTT 的现代化企业级手机控车全栈平台。

## 项目结构 (Monorepo)

```text
car-control-platform/
├── apps/
│   ├── web/               # React 19 + Vite + AntD 管理后台
│   ├── api/               # NestJS 12 业务 API 后端
│   ├── worker/            # BullMQ 异步队列与超时任务处理器
│   ├── mobile/            # React Native 控车客户端
│   └── simulator/         # 车载 TBox 设备模拟器 (全场景/压测)
├── packages/
│   ├── contracts/         # API 契约、Command 状态机、MQTT/WS 协议
│   ├── domain-types/      # 共享领域实体与核心类型
│   └── config/            # 环境配置与校验
├── docs/
│   ├── product/           # 产品需求、追踪矩阵
│   ├── specs/             # 领域核心规范 (Command, Capability, MQTT 等)
│   └── adr/               # 架构决策记录 (ADR)
├── AGENTS.md              # AI 协同与工程红线
├── ARCHITECTURE.md        # 系统全景架构设计
├── ROADMAP.md             # 24 周路线图与门禁 (Gates)
└── CURRENT.md             # 当前工作状态记录
```

## 快速开始

### 依赖环境
- Node.js >= 22 (推荐 LTS)
- pnpm >= 10

### 1. 安装依赖与全量编译
```bash
# 切换到项目根目录
cd car-control-platform

# 安装 monorepo 依赖
pnpm install

# 编译所有 packages 与 apps
pnpm build
```

### 2. 运行自动化测试与端到端闭环验证
```bash
pnpm test
```

### 3. 本地启动服务

在不同终端窗口分别启动：

#### 终端 1：启动车载 TBox 模拟器
```bash
pnpm start:simulator
# 或使用完整指令：
# pnpm --filter @car-control/simulator start
```

#### 终端 2：启动后端业务 API 服务 (端口 3000)
```bash
pnpm start:api
# 或使用完整指令：
# pnpm --filter @car-control/api start
```

#### 终端 3：启动前端 Web 控制台 (端口 5173)
```bash
pnpm dev:web
# 或使用完整指令：
# pnpm --filter @car-control/web dev
```

启动后在浏览器打开：[http://localhost:5173](http://localhost:5173) 即可进入控车操作面板与实时指令状态流水视图。

