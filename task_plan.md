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

- [ ] **Gate 5 (Week 11-14): Production Readiness & Observability**
  - [ ] Distributed Redis cache & rate limiter integration
  - [ ] OpenTelemetry distributed tracing & Prometheus metrics
  - [ ] High-concurrency load testing & performance benchmarking
