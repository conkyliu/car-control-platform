import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAuditStats,
  filterAuditLogs,
  getRiskLevel,
  generateAuditLogCsv,
  isApiError,
  SEED_AUDIT_LOGS,
  AUDIT_MODULES,
  AUDIT_ACTIONS,
} from '../views/rbac/audit-core.ts';
import {
  fetchAuditLogsApi,
  exportAuditLogsApi,
  type AuditLogDto,
  type AuditLogQueryParams,
} from '../api/audit.ts';
import { ApiError } from '../api/client.ts';

describe('Audit Log Center Core Logic Test Suite (TDD)', () => {
  const sampleLogs: AuditLogDto[] = [
    {
      id: 'log-001',
      traceId: 'trace-4bf92f3577b34da6a3ce929d0e0e4736',
      operatorId: 'user-001',
      operatorName: '张伟',
      operatorUsername: 'zhangwei',
      orgId: 'org-01',
      orgName: '华东运营中心',
      clientIp: '192.168.1.100',
      clientLocation: '上海市 (电信)',
      module: 'VEHICLE_CONTROL',
      action: 'REMOTE_ENGINE_STOP',
      actionName: '远程发动机熄火',
      resourceType: 'Vehicle',
      resourceId: 'VIN: LFPH2E023N10001',
      status: 'SUCCESS',
      executionTimeMs: 1420,
      signatureHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      createdAt: '2026-10-12 09:30:00',
    },
    {
      id: 'log-002',
      traceId: 'trace-c8b92f3577b34da6a3ce929d0e0e4737',
      operatorId: 'user-002',
      operatorName: '李强',
      operatorUsername: 'liqiang',
      orgId: 'org-02',
      orgName: '华南车队中心',
      clientIp: '10.0.0.12',
      clientLocation: '广州市 (联通)',
      module: 'VEHICLE_CONTROL',
      action: 'REMOTE_UNLOCK',
      actionName: '远程开锁',
      resourceType: 'Vehicle',
      resourceId: 'VIN: LFPH2E023N10002',
      status: 'FAILED',
      executionTimeMs: 350,
      errorMessage: '终端应答超时 (10s)',
      signatureHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      createdAt: '2026-10-12 10:15:00',
    },
    {
      id: 'log-003',
      traceId: 'trace-7bf92f3577b34da6a3ce929d0e0e4738',
      operatorId: 'user-001',
      operatorName: '张伟',
      operatorUsername: 'zhangwei',
      orgId: 'org-01',
      orgName: '华东运营中心',
      clientIp: '192.168.1.100',
      clientLocation: '上海市 (电信)',
      module: 'USER_IAM',
      action: 'PASSWORD_RESET',
      actionName: '重置用户密码',
      resourceType: 'User',
      resourceId: 'USER_2004',
      status: 'SUCCESS',
      executionTimeMs: 85,
      signatureHash: 'f4b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef1',
      createdAt: '2026-10-11 14:00:00',
    },
    {
      id: 'log-004',
      traceId: 'trace-1bf92f3577b34da6a3ce929d0e0e4739',
      operatorId: 'user-003',
      operatorName: '王芳',
      operatorUsername: 'wangfang',
      clientIp: '172.16.5.20',
      module: 'USER_IAM',
      action: 'LOGIN',
      actionName: '管理员登录',
      resourceType: 'Auth',
      resourceId: 'SESSION_9981',
      status: 'SUCCESS',
      executionTimeMs: 42,
      signatureHash: 'b5b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef2',
      createdAt: '2026-10-10 08:00:00',
    },
    {
      id: 'log-005',
      traceId: 'trace-3bf92f3577b34da6a3ce929d0e0e4740',
      operatorId: 'user-002',
      operatorName: '李强',
      operatorUsername: 'liqiang',
      clientIp: '10.0.0.12',
      module: 'USER_IAM',
      action: 'DELETE',
      actionName: '删除用户账号',
      resourceType: 'User',
      resourceId: 'USER_9090',
      status: 'FAILED',
      executionTimeMs: 120,
      errorMessage: '禁止删除内置超级管理员',
      signatureHash: 'c6b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef3',
      createdAt: '2026-10-12 11:20:00',
    },
  ];

  it('calculateAuditStats accurately computes summary metrics', () => {
    const stats = calculateAuditStats(sampleLogs);
    assert.equal(stats.totalCount, 5);
    // Control audits: log-001 (REMOTE_ENGINE_STOP) + log-002 (REMOTE_UNLOCK) = 2
    assert.equal(stats.controlCount, 2);
    // High-risk operations:
    // log-001: REMOTE_ENGINE_STOP (HIGH)
    // log-003: PASSWORD_RESET (HIGH)
    // log-005: DELETE (HIGH)
    // total = 3
    assert.equal(stats.highRiskCount, 3);
    // Failed operations: log-002 (FAILED) + log-005 (FAILED) = 2
    assert.equal(stats.failedCount, 2);

    // Empty list boundary
    const emptyStats = calculateAuditStats([]);
    assert.equal(emptyStats.totalCount, 0);
    assert.equal(emptyStats.controlCount, 0);
    assert.equal(emptyStats.highRiskCount, 0);
    assert.equal(emptyStats.failedCount, 0);
  });

  it('getRiskLevel evaluates high, medium, and low operational risk correctly', () => {
    // High risk actions
    assert.equal(getRiskLevel('VEHICLE_CONTROL', 'REMOTE_ENGINE_STOP'), 'HIGH');
    assert.equal(getRiskLevel('USER_IAM', 'DELETE'), 'HIGH');
    assert.equal(getRiskLevel('USER_IAM', 'USER_DELETE'), 'HIGH');
    assert.equal(getRiskLevel('USER_IAM', 'PASSWORD_RESET'), 'HIGH');
    assert.equal(getRiskLevel('OTA_UPDATE', 'OTA_BATCH_TRIGGER'), 'HIGH');
    assert.equal(getRiskLevel('DEVICE_MANAGE', 'DEVICE_UNBIND'), 'HIGH');
    assert.equal(getRiskLevel('TENANT_CONFIG', 'TENANT_DISABLE'), 'HIGH');

    // Medium risk actions
    assert.equal(getRiskLevel('VEHICLE_CONTROL', 'REMOTE_UNLOCK'), 'MEDIUM');
    assert.equal(getRiskLevel('VEHICLE_CONTROL', 'REMOTE_AC_CONTROL'), 'MEDIUM');
    assert.equal(getRiskLevel('USER_IAM', 'CREATE'), 'MEDIUM');
    assert.equal(getRiskLevel('USER_IAM', 'UPDATE'), 'MEDIUM');
    assert.equal(getRiskLevel('GEOFENCE', 'GEOFENCE_UPDATE'), 'MEDIUM');
    assert.equal(getRiskLevel('PLATFORM', 'EXPORT'), 'MEDIUM');

    // Low risk actions
    assert.equal(getRiskLevel('USER_IAM', 'LOGIN'), 'LOW');
    assert.equal(getRiskLevel('USER_IAM', 'LOGOUT'), 'LOW');
    assert.equal(getRiskLevel('TELEMETRY', 'QUERY'), 'LOW');
    assert.equal(getRiskLevel('AUDIT', 'VIEW'), 'LOW');

    // Object overload support
    assert.equal(getRiskLevel({ module: 'VEHICLE_CONTROL', action: 'REMOTE_ENGINE_STOP' }), 'HIGH');
    assert.equal(getRiskLevel({ module: 'USER_IAM', action: 'LOGIN' }), 'LOW');
  });

  it('filterAuditLogs filters across keyword, module, action, status, and date range', () => {
    // 1. Keyword search: operator name
    const byName = filterAuditLogs(sampleLogs, { keyword: '张伟' });
    assert.equal(byName.length, 2);
    assert.ok(byName.every((l) => l.operatorName === '张伟'));

    // Keyword search: Trace ID substring
    const byTrace = filterAuditLogs(sampleLogs, { keyword: '4bf92f35' });
    assert.equal(byTrace.length, 1);
    assert.equal(byTrace[0]?.id, 'log-001');

    // Keyword search: IP address
    const byIp = filterAuditLogs(sampleLogs, { keyword: '10.0.0.12' });
    assert.equal(byIp.length, 2);

    // Keyword search: Resource ID
    const byResource = filterAuditLogs(sampleLogs, { keyword: 'LFPH2E023N10002' });
    assert.equal(byResource.length, 1);
    assert.equal(byResource[0]?.id, 'log-002');

    // 2. Module filter
    const controlModuleLogs = filterAuditLogs(sampleLogs, { module: 'VEHICLE_CONTROL' });
    assert.equal(controlModuleLogs.length, 2);

    // 3. Action filter
    const actionLogs = filterAuditLogs(sampleLogs, { action: 'PASSWORD_RESET' });
    assert.equal(actionLogs.length, 1);
    assert.equal(actionLogs[0]?.id, 'log-003');

    // 4. Status filter
    const failedLogs = filterAuditLogs(sampleLogs, { status: 'FAILED' });
    assert.equal(failedLogs.length, 2);

    // 5. Risk level filter
    const highRiskLogs = filterAuditLogs(sampleLogs, { riskLevel: 'HIGH' });
    assert.equal(highRiskLogs.length, 3);

    // 6. Date range filter
    const rangeLogs = filterAuditLogs(sampleLogs, {
      startTime: '2026-10-12 00:00:00',
      endTime: '2026-10-12 23:59:59',
    });
    // Should contain log-001, log-002, log-005 (on 2026-10-12)
    assert.equal(rangeLogs.length, 3);

    // 7. Multi-condition intersection
    const multiFiltered = filterAuditLogs(sampleLogs, {
      module: 'VEHICLE_CONTROL',
      status: 'FAILED',
    });
    assert.equal(multiFiltered.length, 1);
    assert.equal(multiFiltered[0]?.id, 'log-002');
  });

  it('generateAuditLogCsv creates spec-compliant UTF-8 BOM CSV text with proper escaping', () => {
    const csvContent = generateAuditLogCsv(sampleLogs);

    // 1. Must start with UTF-8 BOM (\uFEFF)
    assert.ok(csvContent.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');

    // 2. Header columns must be complete
    const lines = csvContent.slice(1).trim().split('\n');
    const header = lines[0]!;
    assert.ok(header.includes('日志ID'));
    assert.ok(header.includes('Trace ID'));
    assert.ok(header.includes('操作时间'));
    assert.ok(header.includes('操作人'));
    assert.ok(header.includes('业务模块'));
    assert.ok(header.includes('操作行为'));
    assert.ok(header.includes('风险等级'));
    assert.ok(header.includes('状态'));
    assert.ok(header.includes('防篡改哈希'));

    // 3. Data lines count matches logs count
    assert.equal(lines.length - 1, sampleLogs.length);

    // 4. Escaping special characters test
    const trickyLogs: AuditLogDto[] = [
      {
        id: 'log-tricky',
        traceId: 'tr-999',
        operatorId: 'u-1',
        operatorName: '测试,包含逗号"与引号"',
        operatorUsername: 'tricky_user',
        clientIp: '127.0.0.1',
        module: 'VEHICLE_CONTROL',
        action: 'CUSTOM_CMD',
        actionName: '带换行\n指令',
        resourceType: 'Vehicle',
        resourceId: 'VIN: TRICKY_001',
        status: 'SUCCESS',
        executionTimeMs: 10,
        createdAt: '2026-10-12 12:00:00',
      },
    ];
    const trickyCsv = generateAuditLogCsv(trickyLogs);
    // Escaped quotes must be doubled ""
    assert.ok(trickyCsv.includes('""与引号""'));
    assert.ok(trickyCsv.includes('"测试,包含逗号""与引号"""'));
  });

  it('SEED_AUDIT_LOGS contains production-grade sample entries with valid SHA-256 signatures', () => {
    assert.ok(SEED_AUDIT_LOGS.length >= 10, 'SEED_AUDIT_LOGS must contain at least 10 realistic logs');

    for (const log of SEED_AUDIT_LOGS) {
      assert.ok(log.id, 'Log must have ID');
      assert.ok(log.traceId, 'Log must have Trace ID');
      assert.ok(log.operatorName, 'Log must have operator name');
      assert.ok(log.module, 'Log must have module');
      assert.ok(log.action, 'Log must have action');
      assert.ok(log.createdAt, 'Log must have timestamp');
      assert.ok(
        log.status === 'SUCCESS' || log.status === 'FAILED',
        'Status must be SUCCESS or FAILED'
      );
      assert.ok(typeof log.executionTimeMs === 'number', 'Latency must be numeric');
      if (log.signatureHash) {
        assert.equal(log.signatureHash.length, 64, 'SHA-256 digest must be 64 hex characters');
      }
    }

    const stats = calculateAuditStats(SEED_AUDIT_LOGS);
    assert.ok(stats.controlCount > 0, 'Seed logs should include vehicle control audits');
    assert.ok(stats.highRiskCount > 0, 'Seed logs should include high-risk operations');
    assert.ok(stats.failedCount > 0, 'Seed logs should include failed operations');
  });

  it('isApiError differentiates server ApiError instances correctly', () => {
    const err400 = new ApiError('Bad Request', 400);
    assert.equal(isApiError(err400), true);

    const genericErr = new Error('Network Timeout');
    assert.equal(isApiError(genericErr), false);

    assert.equal(isApiError(null), false);
    assert.equal(isApiError(undefined), false);
    assert.equal(isApiError({ statusCode: 500, message: 'Server internal error' }), true);
  });

  it('fetchAuditLogsApi and exportAuditLogsApi are exported and handle fallback gracefully', async () => {
    assert.equal(typeof fetchAuditLogsApi, 'function');
    assert.equal(typeof exportAuditLogsApi, 'function');

    // In testing environment without live backend, fetch falls back gracefully to filtered seed logs
    const logs = await fetchAuditLogsApi({ module: 'VEHICLE_CONTROL' });
    assert.ok(Array.isArray(logs));
    assert.ok(logs.length > 0);
    assert.ok(logs.every((l) => l.module === 'VEHICLE_CONTROL'));

    const csvBlobOrStr = await exportAuditLogsApi({ status: 'SUCCESS' });
    assert.ok(csvBlobOrStr, 'Export must return CSV content');
    if (typeof csvBlobOrStr === 'string') {
      assert.ok(csvBlobOrStr.startsWith('\uFEFF'));
    } else {
      const buf = new Uint8Array(await (csvBlobOrStr as Blob).arrayBuffer());
      assert.equal(buf[0], 0xef);
      assert.equal(buf[1], 0xbb);
      assert.equal(buf[2], 0xbf);
    }
  });

  it('AUDIT_MODULES and AUDIT_ACTIONS contain complete standard categories', () => {
    assert.ok(AUDIT_MODULES.length >= 6);
    assert.ok(AUDIT_MODULES.some((m) => m.value === 'VEHICLE_CONTROL'));
    assert.ok(AUDIT_MODULES.some((m) => m.value === 'USER_IAM'));
    assert.ok(AUDIT_MODULES.some((m) => m.value === 'OTA_UPDATE'));

    assert.ok(AUDIT_ACTIONS.length >= 6);
    assert.ok(AUDIT_ACTIONS.some((a) => a.value === 'DELETE'));
    assert.ok(AUDIT_ACTIONS.some((a) => a.value === 'PASSWORD_RESET'));
  });
});
