# Car Control Platform — Implementation Task Plan

## Milestone Overview & Gate Progression

- [x] **Gate 0 (Week 1-2): Transport POC & Device Simulator**
  - [x] Monorepo workspace setup & packages
  - [x] DeviceSimulator with network latency, ACKs, packet loss simulation
  - [x] CommandService status machine & InMemoryMessagingAdapter
  - [x] 6/6 E2E acceptance test suite passing

- [x] **Gate 1 (Week 2-4): Platform Safe (Auth, RBAC, Multi-Tenant & Audit)**
  - [x] Dual-token authentication (Access Token + Refresh Token with JTI)
  - [x] PBKDF2/Scrypt salted password hashing
  - [x] RBAC permission guards & tenant resource quota enforcement
  - [x] AuditService security audit log trailing
  - [x] 7/7 E2E acceptance test suite passing

- [x] **Gate 2 (Week 3-6): Vehicle Online (Device & Vehicle Management)**
  - [x] Device CRUD & batch import with intra-batch uniqueness
  - [x] Vehicle-device hardware binding & unbinding flow
  - [x] 4-tier hierarchy traceability (Device -> Vehicle -> Project -> Tenant)
  - [x] Realtime online/offline status synchronization
  - [x] 7/7 E2E acceptance test suite passing

- [x] **Gate 3 (Week 5-10): Control Closed Loop & Capability Engine**
  - [x] 4-level capability inheritance algorithm (Global -> Project -> Model -> Vehicle)
  - [x] ControlSecurityService (L0 / L1 security PIN / L2 confirmation token)
  - [x] Sliding window rate limiting & operational risk control (`LOCKED` / `MAINTENANCE`)
  - [x] Full closed loop with simulator ACK & WebSocket push
  - [x] 8/8 E2E acceptance test suite passing

- [x] **Gate 4 (Week 7-12): Telemetry, Geofence & Alert Center**
  - [x] **Task 1**: Telemetry & Alert specifications (`docs/specs/telemetry.md`, `alert.md`, `ADR-006`, `ADR-007`)
  - [x] **Task 2**: Shared contracts & DTOs (`TelemetryLocationPayload`, `AlarmRecordDto`, `CommunicationLogDto`, `MqttTopicBuilder`)
  - [x] **Task 3**: Multi-tenant database repositories (`LocationRepository`, `AlarmRepository`, `CommunicationLogRepository`)
  - [x] **Task 4**: Simulator extensions for telemetry location & proactive alarm uplinks
  - [x] **Task 5**: Douglas-Peucker trajectory simplification engine & `TelemetryService` / `GeofenceService`
  - [x] **Task 6**: `AlarmService` lifecycle & `CommunicationLogService` auto-archiving
  - [x] **Task 7**: Gate 4 E2E acceptance suite (`realtime-telemetry-alarm.e2e.test.ts`) & full regression verification
    - [x] Criteria 1: Realtime location uplink and WebSocket broadcast
    - [x] Criteria 2: Douglas-Peucker trajectory simplification (<20% points, corners preserved)
    - [x] Criteria 3: Circular geofence containment check & `GEOFENCE_OUT` alarm trigger
    - [x] Criteria 4: Device proactive alarm uplink (`LOW_BATTERY` & `VIBRATION`) & WS broadcast
    - [x] Criteria 5: Alarm lifecycle management, audit logging & irreversible terminal state protection
    - [x] Criteria 6: Communication log auto-archiving & multi-dimensional queries
    - [x] Criteria 7: Multi-tenant security isolation boundary across all telemetry/alarm/log resources

- [x] **Gate 5 (Week 11-16): OTA Firmware Upgrade System**
  - [x] **Task 1**: OTA domain specifications & ADRs (`docs/specs/ota.md`, `ADR-013`, `ADR-014`)
  - [x] **Task 2**: OTA shared contracts & DTOs (`packages/contracts`, `packages/domain-types`)
  - [x] **Task 3**: Multi-tenant database repositories (`FirmwareRepository`, `OtaPlanRepository`, `OtaTaskRepository`)
  - [x] **Task 4**: Simulator extensions for OTA upgrade reception, safety pre-check & progress simulation
  - [x] **Task 5**: Core business services & scheduling engine (`FirmwareService`, `OtaSafetyService`, `OtaPlanService`, `OtaProgressService`, `OtaController`)
  - [x] **Task 6**: Gate 5 E2E acceptance suite (`ota-firmware.e2e.test.ts`) & full regression verification
    - [x] Criteria 1: Firmware package management & SHA256 integrity check (auto-calculation & uniqueness constraint)
    - [x] Criteria 2: Multi-dimensional target resolution (MODEL / PROJECT / DEVICE_LIST / ALL) & QUEUED initialization
    - [x] Criteria 3: Safety pre-check enforcement (Engine ON / Low Voltage < 12.0V -> SKIPPED_UNSAFE) & atomic skipped counter
    - [x] Criteria 4: Batch scheduling & downlink MQTT upgrade command dispatch
    - [x] Criteria 5: Device simulator full upgrade lifecycle closed loop & WebSocket broadcast (DOWNLOADING -> VERIFYING -> FLASHING -> SUCCESS -> COMPLETED)
    - [x] Criteria 6: Upgrade failure handling & retry counter increment (FLASHING failure simulation)
    - [x] Criteria 7: Multi-tenant security isolation boundary across firmware, plans, and tasks

- [x] **Gate 6 (Week 15-18): Production Readiness & Observability**
  - [x] **Task 1**: Observability specifications & ADRs (`docs/specs/observability.md`, `ADR-015`, `ADR-016`)
  - [x] **Task 2**: Distributed cache & mutex lock (`CachePort`, `DistributedLockPort`, `InMemoryLockAdapter`, `RedisLockAdapter`, `CommandService` lock integration)
  - [x] **Task 3**: Prometheus metrics service & `GET /metrics` exposition (`MetricsService`, `MetricsController`, `ObservabilityModule`)
  - [x] **Task 4**: OpenTelemetry W3C 5-Span distributed tracing (`TracerService`, `CommandTrace`, `STANDARD_SPAN_NAMES`)
  - [x] **Task 5**: Tiered load test runner & performance benchmark generator (`LoadTestRunner`, `calculatePercentile`, `verifySla`, `generateMarkdownReport`)
  - [x] **Task 6**: Gate 6 E2E acceptance suite (`production-readiness.e2e.test.ts`) & full regression verification
    - [x] Criteria 1: Distributed cache & mutex lock (Single-vehicle concurrent lock 409 `VEHICLE_COMMAND_IN_PROGRESS`, terminal release)
    - [x] Criteria 2: Prometheus metrics exposition (`GET /metrics` exports all 7 metrics with SLA buckets and types)
    - [x] Criteria 3: OpenTelemetry 5-stage distributed span tracing (5 spans captured, contiguous, sum equals totalDurationMs)
    - [x] Criteria 4: 100 device concurrency benchmark (Tier 1: 100 devices concurrent heartbeats and commands, 100% success, 0 error)
    - [x] Criteria 5: 500 device concurrency smooth scaling (Tier 2: 500 devices concurrent commands via LoadTestRunner, success >= 99.9%, zero race conditions)
    - [x] Criteria 6: 1000 device high-concurrency load test & SLA hard gates (Tier 3: 1000 requests, assert SLA: Success >= 99.9%, P50 <= 1.0s, P95 <= 2.0s, P99 <= 5.0s, print Markdown benchmark table)
    - [x] Criteria 7: Multi-tenant strict isolation boundary under high load (Tenant B cannot read or mutate Tenant A lock or commands, isolation holds under load)

