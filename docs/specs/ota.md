# OTA Domain Specification (固件升级与版本管理规范)

## 1. 业务目标
固件 OTA（Over-The-Air）升级系统负责车载终端（T-Box、智能中控网关、MCU）固件版本的全生命周期管控、分批下发调度与进度跟踪闭环。核心目标与职责包括：
1. **固件包全生命周期安全管理**：维护固件版本、硬件兼容矩阵、下载地址与双重哈希完整性校验和（SHA-256 强校验 + MD5 辅助校验），防止固件被篡改或错刷；
2. **多维目标设备灵活筛选**：支持按租户全量 (`ALL`)、指定车型 (`MODEL`)、指定项目/车队 (`PROJECT`) 或白名单设备列表 (`DEVICE_LIST`) 进行灰度发布与目标设备解析；
3. **行车安全前置检查 (Safety Pre-check 防线)**：在向设备下发升级指令前，强制校验车辆处于熄火状态（Engine Off / ACC Off 且速度为零）且 12V 蓄电池电压 $\ge 12.0\text{V}$。若不满足条件，主动拦截并标记为 `SKIPPED_UNSAFE`，坚决杜绝行驶中刷写或亏电变砖事故；
4. **平滑分批并发调度与流控**：通过 `batchSize`（批次大小）与 `batchIntervalSec`（批次间隔时间）实现梯度限流调度，平滑 CDN 带宽压力与 MQTT 网关峰值，具备单批次失败率超阈值自动熔断保护能力；
5. **分片断点续传与进度全链路闭环**：设备端基于 HTTP Range 分片拉取固件，在蜂窝弱网环境下支持断点续传；通过 MQTT 持续上报分片与步骤进度，云端消费并推送到 WebSocket 大屏，实现从下发到烧录重启的全程可视化闭环；
6. **多租户严格隔离与合规审计**：所有固件、计划、任务数据均挂载 `tenantId`，在服务层与数据层实施物理/逻辑强隔离，关键操作全程留痕审计。

---

## 2. 固件元数据模型 (`FirmwarePackage`)

### 2.1 字段定义规范
每个固件包实体对应一个具体硬件与软件版本的发布包，其字段定义如下：

| 字段名 | 类型 | 必填 | 说明 | 约束与示例 |
|---|---|---|---|---|
| `id` | string (UUID) | 是 | 固件包全局唯一标识 | UUIDv4 格式 |
| `tenantId` | string (UUID) | 是 | 所属租户 ID | 多租户隔离键 |
| `name` | string | 是 | 固件包展示名称 | 如 `T-Box-Standard-Firmware` |
| `version` | string | 是 | 固件软件版本号 | 语义化版本，如 `1.2.0`、`v2.0.1` |
| `targetModelId` | string (UUID) | 是 | 适配目标车型 ID | 关联对应车型，防止跨车型错刷 |
| `hardwareVersion`| string | 是 | 兼容的硬件版本号 | 如 `HW-TBOX-V2.1` |
| `fileUrl` | string | 是 | 固件下载 CDN/对象存储绝对地址 | 有效 HTTP/HTTPS URL |
| `fileSizeBytes` | number (int) | 是 | 固件二进制包大小（字节） | 正整数，如 `10485760` (10MB) |
| `checksumSha256` | string | 是 | SHA-256 校验和（64 位十六进制） | 固件防篡改与完整性强校验关键指纹 |
| `checksumMd5` | string | 否 | MD5 校验和（32 位十六进制） | 辅助校验指纹 |
| `description` | string | 否 | 更新日志与版本特性说明 | 文本描述 |
| `status` | string | 是 | 固件可用状态 | 枚举：`ACTIVE` (可用), `DEPRECATED` (已废弃) |
| `createdAt` | Date | 是 | 创建时间戳 | 审计时间戳 |

### 2.2 完整性防篡改与版本唯一性规则
1. **防篡改双重校验和**：
   - 上传或登记固件包时，云端必须校验 `checksumSha256` 是否为有效 64 位十六进制小写字符串；
   - 设备在下载完成后的 `VERIFYING` 阶段，必须在写入 Flash 前在内存或暂存分区计算固件整体 SHA-256 哈希，只有与下发指令中的 `checksumSha256` 绝对匹配时才允许进入 `FLASHING` 步骤；
2. **唯一性冲突保护**：
   - 同一租户下，不允许对同一 `targetModelId` 和 `hardwareVersion` 重复发布相同 `version` 的固件包；
3. **废弃保护 (Deprecation)**：
   - 处于 `DEPRECATED` 状态的固件包禁止创建新的升级计划，但已创建并正在执行的历史计划允许继续流转直至终态。

---

## 3. 升级计划与目标筛选规范 (`OtaPlan`)

### 3.1 字段定义规范

| 字段名 | 类型 | 必填 | 说明 | 约束与示例 |
|---|---|---|---|---|
| `id` | string (UUID) | 是 | 升级计划唯一标识 | UUIDv4 格式 |
| `tenantId` | string (UUID) | 是 | 所属租户 ID | 多租户隔离键 |
| `name` | string | 是 | 升级计划名称 | 如 `2026年Q4车型A批次固件推送` |
| `firmwareId` | string (UUID) | 是 | 关联固件包 ID | 必须对应有效的 `ACTIVE` 状态固件 |
| `targetType` | string | 是 | 目标设备筛选类型 | 枚举：`ALL`, `MODEL`, `PROJECT`, `DEVICE_LIST` |
| `targetIds` | string[] | 是 | 筛选目标标识列表 | 根据 `targetType` 分别存 modelId, projectId, 或 deviceNo |
| `status` | string | 是 | 升级计划整体生命周期状态 | 枚举：见 3.3 计划状态机 |
| `batchSize` | number | 是 | 每批次下发设备数量 | 正整数，范围 `[1, 1000]`，默认 `100` |
| `batchIntervalSec`| number | 是 | 批次间隔时间（秒） | 正整数，范围 `[10, 3600]`，默认 `30` |
| `maxRetries` | number | 是 | 单设备失败最大自动重试次数 | 范围 `[0, 5]`，默认 `3` |
| `preCheckRequired`| object | 是 | 行车安全前置检查开关与阈值 | `{ engineOff: boolean, minBatteryVoltage: number }` |
| `totalDevices` | number | 是 | 计划涵盖的目标设备总数 | 初始根据筛选规则计算得出 |
| `successDevices`| number | 是 | 成功完成升级的设备总数 | 原子递增 |
| `failedDevices` | number | 是 | 升级最终失败的设备总数 | 原子递增 |
| `createdAt` | Date | 是 | 创建时间戳 | 审计时间戳 |

### 3.2 目标筛选规则解析 (Target Filtering Rules)
升级计划创建后，调度器根据 `targetType` 与 `targetIds` 动态或静态计算当前租户内的目标设备清单：
1. **`ALL` (租户内车型全量)**:
   - 检索当前租户内，车型与关联固件 `targetModelId` 匹配的所有有效激活设备；
2. **`MODEL` (指定车型列表)**:
   - 在 `targetIds` 包含的车型范围内，且硬件兼容版本匹配该固件的所有激活设备；
3. **`PROJECT` (指定项目/车队列表)**:
   - 归属于 `targetIds` 中指定项目/车队 ID，且车型符合固件要求的设备集合；
4. **`DEVICE_LIST` (白名单设备列表)**:
   - 精确匹配 `targetIds` 中的设备硬件编号 (`deviceNo`) 集合，通常用于先锋测试组（Dogfooding/Canary）或小规模验证。

### 3.3 升级计划生命周期有限状态机 (`OtaPlanStatus`)
计划状态枚举包含：`DRAFT`、`SCHEDULED`、`EXECUTING`、`PAUSED`、`COMPLETED`、`CANCELLED`。

```text
         ┌───────────┐
         │   DRAFT   │ (草稿，可编辑参数与目标)
         └─────┬─────┘
               │ (排期发布)
               ▼
         ┌───────────┐
         │ SCHEDULED │ (已排期，待触发)
         └─────┬─────┘
               │ (开始执行调度)
               ▼
   ┌───────► ┌───────────┐ ◄───────┐
   │ (恢复)  │ EXECUTING │         │
   │         └─────┬─────┘         │
   │           ▲   │ (人工暂停/    │
   │           │   │  熔断暂停)    │
   │           │   ▼               │
   │         ┌───────────┐         │
   │         │  PAUSED   │         │
   │         └─────┬─────┘         │
   │ (继续)        │ (取消)        │
   └───────────────┤               │
                   ▼               ▼
             ┌───────────┐   ┌───────────┐
             │ COMPLETED │   │ CANCELLED │
             └───────────┘   └───────────┘
              (全部终态)       (计划取消)
```

- **状态转移规则**：
  - `DRAFT`: 允许修改所有配置参数与目标设备筛选器；
  - `SCHEDULED`: 进入排期锁定状态，等待定时触发或人工立即触发；
  - `EXECUTING`: 批次调度器开始按批次激活设备升级任务；
  - `PAUSED`: 暂停派发新的批次，但当前批次中已下发的设备任务允许继续上报并收敛；可由人工触发恢复 (`EXECUTING`) 或取消 (`CANCELLED`)；
  - `COMPLETED`: 计划内所有设备升级任务均已达到终态（`SUCCESS` / `FAILED` / `TIMEOUT` / `SKIPPED_UNSAFE`），计划正常归档；
  - `CANCELLED`: 计划终止，未下发的待执行任务标记取消，不可逆。

---

## 4. 行车安全前置检查防线 (Safety Pre-check Gate)

### 4.1 安全红线准则
升级车载固件涉及 ECU/T-Box 复位、Bootloader 重写与总线重启。在行车状态或亏电状态下刷写可能直接导致车辆动力丢失或设备变砖。因此，系统设立严格的**前置物理准入防线**：

1. **熄火状态强校验 (Engine Off & ACC Off)**：
   - 车辆发动机必须处于熄火状态 (`engineRunning === false`)；
   - 车辆点火开关/ACC 必须关闭 (`accStatus === false`)；
   - 车辆行驶速度必须为零 (`speed === 0` 或 `speed < 0.5 km/h`)；
   - 行车过程中**绝对禁止**下发 OTA 升级指令；
2. **12V 蓄电池电压安全门禁 (Battery Voltage $\ge 12.0\text{V}$)**：
   - 固件刷写过程伴随高功耗擦写与总线高负载，车辆熄火状态下发电机不工作；
   - 铅酸/低压蓄电池电压若低于 $12.0\text{V}$，刷写中途电压瞬时下跌将导致 MCU 欠压复位或写入半区损坏，导致硬件彻底“变砖”；
   - 因此系统设定强制门禁：蓄电池电压必须 $\ge 12.0\text{V}$；
3. **遥测数据保鲜期要求 (Freshness Window)**：
   - 用于安全前置检查的车辆状态遥测时间戳与当前调度时间差不得超过 15 分钟 (`900,000 ms`)；
   - 若遥测数据陈旧或缺失，视为状态未知，安全判定不通过。

### 4.2 拦截机制与审计处置 (`SKIPPED_UNSAFE`)
- **执行拦截**：在批次调度派发设备前，`OtaSafetyService` 查询车辆最新状态与遥测缓存。任一前置检查未通过，任务**立即熔断跳过**，状态直接置为 `SKIPPED_UNSAFE`，不得向设备下发 MQTT 下行通知；
- **错误代码与原因说明**：
  - `REASON_ENGINE_RUNNING`: 车辆处于点火或行驶状态，拦截升级；
  - `REASON_LOW_VOLTAGE`: 蓄电池电压过低（如 `11.4V < 12.0V`），拦截升级；
  - `REASON_TELEMETRY_STALE`: 遥测数据缺失或已过期，无法确认安全状态；
- **非阻塞原则**：被拦截的设备任务置为 `SKIPPED_UNSAFE` 后，不阻塞同批次中其他通过前置检查的合规车辆继续下发；
- **全链路审计留痕**：拦截事件必须写入安全审计日志，并在管理后台报表中明确标明未升级原因。

---

## 5. 设备升级任务生命周期与有限状态机 (`OtaTask`)

### 5.1 任务状态枚举 (`OtaTaskStatus`)

- `QUEUED`: 任务已生成，处于计划执行队列中等待调度；
- `NOTIFIED`: 升级通知已通过 MQTT 投递给车载终端，等待设备拉取固件；
- `DOWNLOADING`: 设备响应下发指令，正在分片下载固件包；
- `VERIFYING`: 设备固件下载完毕，正在校验 SHA-256 完整性哈希；
- `FLASHING`: 哈希校验一致，正在写入 Flash/ROM 分区；
- `SUCCESS`: 设备烧录成功并重启完成，上报新版本确认，升级顺利闭环；
- `FAILED`: 下载失败、校验不通过、烧录失败或设备主动报错；
- `TIMEOUT`: 派发后在指定超时时限内未收到设备响应或步骤超时；
- `SKIPPED_UNSAFE`: 安全前置检查未通过（行驶中或低电压），被云端主动安全拦截。

### 5.2 设备升级步骤枚举 (`OtaStep`)
用于细粒度跟踪设备当前所处物理阶段：
- `DOWNLOADING`: 固件分片拉取中；
- `VERIFYING`: 完整性哈希比对中；
- `FLASHING`: 底层固件擦除与烧录中；
- `REBOOTING`: 固件刷写完成，正在执行重启与自检；
- `SUCCESS`: 升级步骤全部成功；
- `FAILED`: 升级步骤异常中断。

### 5.3 状态转移流转图
```text
                  ┌──────────┐
                  │  QUEUED  │ (排队中)
                  └────┬─────┘
                       │
             ┌─────────┴─────────┐
      (安全前置校验通过)   (安全前置校验不通过: 行驶中/电压<12V)
             ▼                   ▼
       ┌──────────┐        ┌────────────────┐
       │ NOTIFIED │        │ SKIPPED_UNSAFE │ (终态)
       └────┬─────┘        └────────────────┘
            │
            ├──────────────────────────┐ (响应超时)
            ▼                          ▼
     ┌─────────────┐              ┌─────────┐
     │ DOWNLOADING │              │ TIMEOUT │ (终态)
     └──────┬──────┘              └─────────┘
            │ (下载完成)
            ▼
      ┌────────────┐
      │ VERIFYING  │
      └─────┬──────┘
            ├──────────────────────────┐ (SHA-256 校验失败)
            ▼                          ▼
       ┌──────────┐               ┌─────────┐
       │ FLASHING │               │ FAILED  │ (终态)
       └────┬─────┘               └─────────┘
            │                          ▲
            ├──────────────────────────┤ (刷写故障/设备报错)
            ▼ (刷写重启成功并确认版本)   │
       ┌──────────┐                    │
       │ SUCCESS  │ (终态)             │
       └──────────┘                    │
```

### 5.4 终态原则与幂等性要求
1. **终态单向不可逆**：`SUCCESS`、`FAILED`、`TIMEOUT` 与 `SKIPPED_UNSAFE` 为系统的单向终态；
2. **防重复流转**：一旦任务进入终态，禁止任何后续报文将其反向修改回中间态；
3. **迟到报文处理**：处于 `TIMEOUT` 终态后到达的设备上报，仅记录调试日志，不得擅自改变数据库终态；
4. **重试机制 (`incrementRetry`)**：对于非 `SKIPPED_UNSAFE` 的偶发失败任务，在未超过 `maxRetries` 阈值前，由调度器生成重试记录或重置为 `QUEUED` 进行再次尝试。

---

## 6. MQTT 通信协议与报文规范

设备与云端通过标准阿里云 IoT 规范 MQTT Topic 进行全双工异步交互，通讯 QoS 等级统一为 QoS 1（至少到达一次）。

### 6.1 下行升级通知指令 (Cloud -> Device)
- **Topic**: `/sys/{productKey}/{deviceNo}/ota/upgrade`
- **QoS**: 1
- **Payload 格式 (JSON)**:
```json
{
  "traceId": "c3b9e4a1-8d25-4b06-b371-294719280abc",
  "planId": "8f3e2b10-6c91-4e78-9a02-53b11893c5d4",
  "taskId": "7a1b3c4d-5e6f-7081-92a3-b4c5d6e7f809",
  "version": "1.2.0",
  "fileUrl": "https://cdn.example.com/firmware/tbox-v1.2.0.bin",
  "fileSizeBytes": 10485760,
  "checksumSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "checksumMd5": "d41d8cd98f00b204e9800998ecf8427e"
}
```

| 字段名 | 类型 | 说明 | 约束 |
|---|---|---|---|
| `traceId` | string | 全链路追踪 TraceId | UUIDv4 |
| `planId` | string | 关联的 OTA 升级计划 ID | UUIDv4 |
| `taskId` | string | 当前设备升级任务 ID | UUIDv4 |
| `version` | string | 目标固件版本号 | 如 `1.2.0` |
| `fileUrl` | string | 固件文件下载绝对地址 | HTTPS / HTTP 下载直链 |
| `fileSizeBytes`| number | 固件文件字节大小 | 正整数 |
| `checksumSha256` | string | 固件 SHA-256 完整性哈希 | 64 位十六进制 |
| `checksumMd5` | string | 固件 MD5 辅助校验和 | 32 位十六进制（可选） |

---

### 6.2 上行进度与结果上报 (Device -> Cloud)
- **Topic**: `/sys/{productKey}/{deviceNo}/ota/progress`
- **QoS**: 1
- **Payload 格式 (JSON)**:

#### 下载与步骤进度上报示例:
```json
{
  "planId": "8f3e2b10-6c91-4e78-9a02-53b11893c5d4",
  "taskId": "7a1b3c4d-5e6f-7081-92a3-b4c5d6e7f809",
  "deviceNo": "DEV-TBOX-00123",
  "step": "DOWNLOADING",
  "progressPercent": 45,
  "currentChunk": 9,
  "totalChunks": 20,
  "errorCode": 0,
  "errorMessage": ""
}
```

#### 校验或刷写异常上报示例:
```json
{
  "planId": "8f3e2b10-6c91-4e78-9a02-53b11893c5d4",
  "taskId": "7a1b3c4d-5e6f-7081-92a3-b4c5d6e7f809",
  "deviceNo": "DEV-TBOX-00123",
  "step": "FAILED",
  "progressPercent": 100,
  "errorCode": 1003,
  "errorMessage": "SHA256 checksum mismatch: expected e3b0c44... but got a8b12c..."
}
```

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `planId` | string | 是 | 关联的 OTA 升级计划 ID |
| `taskId` | string | 是 | 关联的设备升级任务 ID |
| `deviceNo` | string | 是 | 设备物理编号 |
| `step` | string | 是 | 当前步骤枚举 (`DOWNLOADING`, `VERIFYING`, `FLASHING`, `REBOOTING`, `SUCCESS`, `FAILED`) |
| `progressPercent`| number | 是 | 总体/当前步骤进度百分比 (`0` ~ `100`) |
| `currentChunk` | number | 否 | 当前已完成分片编号（断点续传跟踪） |
| `totalChunks` | number | 否 | 分片总数 |
| `errorCode` | number | 否 | 错误代码，正常流转上报 `0`，非零表示异常 |
| `errorMessage` | string | 否 | 错误原因与异常堆栈简述 |

---

## 7. 分批并发调度与断点续传规范

### 7.1 分批梯度调度 (Gradient Batch Scheduling)
1. **批次分组与限流下发**：
   - 调度器将计划内全部设备任务按 `batchSize` 切分为连续批次；
   - 调度流水线逐批触发：下发完一个批次后，调度器挂起等待 `batchIntervalSec` 秒，再唤醒派发下一批次；
2. **削峰填谷**：
   - 防止成千上万台车载终端在同一秒发起 HTTP GET 请求，彻底消除 CDN 与网关的惊群效应（Thundering Herd）；
3. **动态熔断保护 (Blast Radius Control)**：
   - 当任一批次执行中，设备的失败率（`failedDevices / batchSize`）超过设定的安全熔断阈值（如 $5\%$）时，调度引擎自动将计划置为 `PAUSED` 熔断状态；
   - 立即中断后续批次下发并向运维平台触发 `CRITICAL` 告警，阻止缺陷固件扩散至全量车队。

### 7.2 分片断点续传机制 (Resumable Chunking)
1. **HTTP Range 支持**：
   - 固件下载托管于支持 `Accept-Ranges: bytes` 响应头的对象存储（Aliyun OSS / AWS S3）；
   - 设备端按固定 Chunk 大小（如 512KB ~ 2MB）发起 `Range: bytes={start}-{end}` 分片拉取；
2. **蜂窝弱网恢复**：
   - 设备在经过隧道、地库网络中断后，本地保存已成功接收的分片 offset；
   - 恢复网络连接后，设备读取本地断点偏移量，无需从头重传，接续下载剩余分片；
3. **节流上报规范**：
   - 设备端禁止每一个分片均向 MQTT Broker 上报进度，必须实行步进节流（如进度每推进 5%~10% 或时间间隔超过 3 秒才上报一次），防止高频消息雪崩。

---

## 8. WebSocket 实时推送与大屏监控

### 8.1 事件协议定义
- `WebSocketEvent.OTA_PROGRESS` = `'ota.progress'`
  - 触发时机：设备上报有效中间进度；
  - 内容包含：`planId`, `taskId`, `deviceNo`, `step`, `progressPercent`, `timestamp`。
- `WebSocketEvent.OTA_COMPLETED` = `'ota.completed'`
  - 触发时机：设备任务达到 `SUCCESS`, `FAILED` 或计划达到 `COMPLETED`；
  - 内容包含：`planId`, `taskId`, `deviceNo`, `status`, `successDevices`, `failedDevices`。

### 8.2 房间路由机制 (Room Routing)
WebSocket 网关按照多租户与监控维度定向投递，**严禁全服广播**：
- `ota-plan:{planId}`: OTA 计划详情页与进度监控仪表盘订阅；
- `tenant:{tenantId}`: 租户总览运维监控大屏订阅；
- `project:{projectId}`: 项目车队运营看板订阅；
- `vehicle:{vehicleId}`: 单车详情与远程诊断页订阅。

---

## 9. 多租户数据隔离与合规审计

### 9.1 数据存储与服务层强隔离
1. **多租户数据建模**：`FirmwarePackage`、`OtaPlan` 与 `OtaDeviceTask` 实体必须包含 `tenant_id` 字段；
2. **上下文守卫**：仓储层所有操作必须强制提取 `TenantContext.getTenantId()`。跨租户查询或操作固件与计划直接抛出 404 或无权操作安全拦截，严防跨租户越权。

### 9.2 审计留痕标准 (Audit Log)
以下关键操作必须强制记录审计流水，保存操作人 `operatorId`、操作 IP 与前后参数快照：
- 固件包创建与状态变更 (`ACTIVE` -> `DEPRECATED`)；
- OTA 计划创建、发布执行、人工暂停与取消；
- 安全前置检查拦截事件（记录被跳过设备的 `deviceNo`、车辆点火状态、电瓶电压与时间戳）；
- 熔断保护触发事件（记录异常批次、失败率与中断时刻）。
