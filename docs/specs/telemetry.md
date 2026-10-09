# Telemetry Domain Specification (遥测定位与轨迹规范)

## 1. 业务目标
遥测定位与轨迹领域负责车辆高频时空数据的摄取、校验、热缓存、时序存储与历史轨迹提取。其核心职责包括：
1. 接收来自车载 T-Box 或智能终端的高频 GPS/GNSS 报文；
2. 维护车辆最新位置（热数据），毫秒级响应监控大屏与手机 APP 的实时定位请求；
3. 历史轨迹时序归档，并提供基于 Douglas-Peucker 算法的服务端矢量抽稀回放；
4. 电子围栏（Geofence）距离判定与出入界告警触发；
5. 在多租户架构下保证车辆轨迹数据的绝对物理/逻辑隔离。

---

## 2. GPS 上报报文规范 (Uplink Telemetry Payload)

### 2.1 MQTT 通讯通道
- **Uplink Topic**: `/sys/{productKey}/{deviceNo}/location`
- **QoS 等级**: QoS 0（高频上报，允许极轻微网络丢包，避免 TCP 拥塞）
- **上报频率**:
  - 行驶状态 (ACC ON): 默认 1s ~ 5s 上报一次
  - 怠速/静止状态: 默认 15s ~ 30s 上报一次
  - 熄火休眠状态 (ACC OFF): 默认 10m ~ 30m 上报一次心跳定位包

### 2.2 报文数据结构 (JSON)
```json
{
  "lat": 31.230416,
  "lng": 121.473701,
  "altitude": 18.5,
  "speed": 62.4,
  "heading": 135.0,
  "satellites": 12,
  "gpsValid": true,
  "timestamp": 1791448800000,
  "mileage": 12450.8,
  "extra": {
    "hdop": 0.8,
    "batteryVoltage": 12.6,
    "accStatus": true
  }
}
```

### 2.3 字段约束字典
| 字段名 | 类型 | 必填 | 说明与单位 | 约束与有效范围 |
|---|---|---|---|---|
| `lat` | number | 是 | 纬度（原始 WGS-84 坐标） | [-90.0, 90.0]，保留 6 位小数（分辨率约 0.1m） |
| `lng` | number | 是 | 经度（原始 WGS-84 坐标） | [-180.0, 180.0]，保留 6 位小数 |
| `altitude` | number | 否 | 海拔高度（米，WGS-84 椭球高） | [-500.0, 9000.0] |
| `speed` | number | 否 | 地面行驶速度（km/h） | [0.0, 350.0]，非负浮点数 |
| `heading` | number | 否 | 航向角（度，正北顺时针） | [0.0, 359.9] |
| `satellites` | integer| 否 | 当前定位可见有效卫星颗数 | [0, 64]，>=4 说明具备 3D 定位能力 |
| `gpsValid` | boolean| 是 | GPS 数据是否有效 | `true` 为已有效定位；`false` 为盲区/基站粗定位 |
| `timestamp` | integer| 是 | GPS 定位时间戳（毫秒） | 当前时间前后偏差不超过 12 小时（防御时钟混乱） |
| `mileage` | number | 否 | 累计行驶总里程（km） | 浮点数，单调非递减 |

---

## 3. 坐标系规范与转换 (Coordinate System & Conversion)

### 3.1 坐标系标准
- **数据源与持久化标准 (WGS-84)**:
  - 车载 T-Box 硬件 GNSS 芯片采集的原始坐标为大地坐标系 (WGS-84)；
  - **仓储持久化强制使用 WGS-84**，保证物理真值不受算法扰动，防止历史数据多次转换导致不可逆精度衰减。
- **展示与地图合规标准 (GCJ-02 / 国测局火星坐标系)**:
  - 中国大陆范围内对外暴露的 Web/APP 地图服务（高德、腾讯、百度瓦片）强制合规使用 GCJ-02；
  - 服务端在对外提供查询接口或推流时，默认实时转换为 GCJ-02 坐标。

### 3.2 坐标转换算法与中国边界判断
WGS-84 转 GCJ-02 的数学模型如下：
- 判断是否在中国大陆境内：经度在 `[72.004, 137.8347]` 且纬度在 `[0.8293, 55.8271]` 范围内；
- 若不在境内（如海外漫游、中国港澳台部分区域），直接原样输出，不执行非线性偏移；
- 若在境内，执行高斯克吕格投影多项式偏移计算：
  $$\Delta Lat = \text{transformLat}(lng - 105.0, lat - 35.0)$$
  $$\Delta Lng = \text{transformLng}(lng - 105.0, lat - 35.0)$$
  结合克拉索夫斯基椭球偏心率参数进行微积分修正，最终得出 $(lat + \Delta Lat, lng + \Delta Lng)$。

---

## 4. 冷热存储分级与归档策略 (Storage Tiering Strategy)

为兼顾高并发写入、实时监控读与海量历史轨迹低成本存储，采用冷热分离三级架构：

```text
[T-Box 上报]
     │
     ▼
[MQTT Broker] ──► [Telemetry Service]
                        │
       ┌────────────────┴────────────────┐
       ▼                                 ▼
【热存储: Redis Cache】           【温存储: PostgreSQL 时序表】
• 键名: telemetry:latest:{vid}    • 表名: telemetry_locations
• 结构: Hash / JSON 序列化         • 分区: 按月份 Range 分区
• 读写: Sub-ms 极速读写            • 索引: (vehicle_id, timestamp DESC)
• 场景: 实时大屏/APP 状态卡片     • 场景: 近 90 天历史轨迹回放
                                         │
                                         ▼ (定时任务 > 90 天)
                                  【冷存储: 对象存储/归档表】
                                  • Parquet / OSS 冷归档
                                  • 压缩率 10:1
```

### 4.1 最新位置热缓存 (Hot Cache)
- **存储介质**: Redis In-Memory 或进程内 LRU 缓存。
- **Key 格式**: `telemetry:latest:{vehicleId}`。
- **更新策略**: 每次收到有效经纬度上报后，执行 `HSET` / `SET` 覆盖更新。
- **过期策略**: 永久保留或不过期；若设备超过 10 分钟无心跳或上报，业务层打上离线标识，但不清空最后已知位置（Last Known Location）。

### 4.2 历史轨迹温存储 (Warm Tier)
- **存储介质**: PostgreSQL 分区表 (`telemetry_locations`)。
- **分区方案**: 依据 `recorded_at` 字段按月创建 Range 子分区（如 `telemetry_locations_y2026m10`），提升历史时序查询效率，便于按月快速 Drop 废弃数据。
- **核心索引**:
  - `CREATE INDEX idx_telemetry_vehicle_time ON telemetry_locations (tenant_id, vehicle_id, recorded_at DESC);`
- **生命周期**: 在线保留 90 天。

### 4.3 历史冷归档 (Cold Tier)
- 超过 90 天的时序数据由离线定时任务导出为列式存储文件 (Apache Parquet / Gzip JSON)，转储至对象存储 (S3 / Aliyun OSS)。
- PostgreSQL 自动卸载历史子分区，保证在线数据库容量健康稳定。

---

## 5. Douglas-Peucker 轨迹抽稀容差规则

### 5.1 算法目的
车辆行车过程（如 2 小时行车产生 7,200 个点）中，大部分直行路段存在大量共线冗余点。直接将海量点返回给前端会导致：
1. 网络传输 JSON 体积达数兆字节，移动网络加载迟缓；
2. 前端 Leaflet / WebGL 渲染折线造成浏览器帧率骤降。

采用 Douglas-Peucker 算法在**服务端**完成多边形链抽稀，保持道路轮廓折线特征不变，数据压缩率可达 80% ~ 92%。

### 5.2 抽稀规则与容差 (`epsilon`)
- **算法原理**:
  1. 标记轨迹起点 $P_1$ 与终点 $P_n$，连接基线段 $P_1 P_n$；
  2. 寻找中间各点到基线段的最大垂直几何距离 $d_{max}$，记录对应点 $P_k$；
  3. 若 $d_{max} > \epsilon$（容差），保留 $P_k$，并以此点分割递归处理 $P_1 \dots P_k$ 与 $P_k \dots P_n$；
  4. 若 $d_{max} \le \epsilon$，则舍弃 $P_1$ 与 $P_n$ 之间的全部中间点，仅保留 $P_1$ 和 $P_n$。
- **首尾端点保真**: 原始轨迹序列的第一个点与最后一个点**强制保留**，不得裁剪。
- **容差参数配置字典**:
  | 场景模式 | `epsilon` (度) | 对应地面距离容差 | 适用业务场景 |
  |---|---|---|---|
  | `HIGH_PRECISION` | `0.00003` | 约 3.3 米 | 事故分析、窄路转弯微观复现 |
  | `DEFAULT` (默认) | `0.00010` | 约 11.1 米 | 城市与高速日常行车轨迹回放 |
  | `OVERVIEW` | `0.00050` | 约 55.5 米 | 跨省长途货运概览、移动端极小缩略图 |

---

## 6. 电子围栏判定规范 (Geofence Engine)

### 6.1 圆形围栏距离判定 (Haversine Formula)
计算当前车辆位置 $(lat_1, lng_1)$ 到围栏圆心 $(lat_2, lng_2)$ 的大圆球面距离 $d$：
$$a = \sin^2\left(\frac{\Delta lat}{2}\right) + \cos(lat_1) \cdot \cos(lat_2) \cdot \sin^2\left(\frac{\Delta lng}{2}\right)$$
$$c = 2 \cdot \arctan2(\sqrt{a}, \sqrt{1-a})$$
$$d = R \cdot c \quad (\text{其中地球平均半径 } R = 6371000 \text{ 米})$$

### 6.2 出入界判定与滞后防抖 (Debounce / Hysteresis)
- **状态流转**:
  - 若前一状态为 `INSIDE` 且当前 $d > \text{radius}$: 触发 `GEOFENCE_OUT` 报警；
  - 若前一状态为 `OUTSIDE` 且当前 $d \le \text{radius}$: 触发 `GEOFENCE_IN` 报警。
- **边界防抖机制**:
  - 在围栏边界设定 15 米缓冲区，或连续收到 2 个有效位置点均超出边界方可改变围栏判定状态，防止 GPS 边界微小漂移造成频繁误报。
