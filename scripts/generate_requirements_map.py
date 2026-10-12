import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile('手机控车平台功能清单.docx') as z:
    xml_content = z.read('word/document.xml')

root = ET.fromstring(xml_content)
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
tables = root.findall('.//w:tbl', ns)

all_rows = []
for tbl in tables:
    for tr in tbl.findall('.//w:tr', ns):
        cells = []
        for tc in tr.findall('.//w:tc', ns):
            cells.append(''.join(tc.itertext()).strip())
        if cells and len(cells) >= 4 and cells[0] != '编号':
            all_rows.append(cells[:4])

print(f'Parsed {len(all_rows)} rows.')

module_names = {
    '1': '01 系统登录与认证 (Auth & SSO)',
    '2': '02 机构管理 (Organization Management)',
    '3': '03 用户与权限管理 (User & RBAC)',
    '4': '04 设备管理 (Device Management)',
    '5': '05 车辆管理 (Vehicle Management)',
    '6': '06 车控中心 (Car Control Center)',
    '7': '07 能力配置中心 (Capability Configuration)',
    '8': '08 报警通知中心 (Alarm & Alert Center)',
    '9': '09 钥匙管理与蓝牙 (Digital Key & BLE)',
    '10': '10 定位管理 (Location & Geofence)',
    '11': '11 数据统计分析 (Data & Dashboard)',
    '12': '12 财务与增值服务 (Billing & Value-added)',
    '13': '13 物联卡管理 (SIM & IoT Card)',
    '14': '14 固件与软件升级 (Firmware OTA)',
    '15': '15 版本与应用管理 (App & Version)',
    '16': '16 系统运维管理 (System Ops & Monitoring)',
    '17': '17 开放 API 与对接 (Open API & Integration)',
    '18': '18 长连接网关 (Gateway & Connection)',
    '19': '19 通讯日志中心 (Communication Logs)',
    '20': '20 部署与基础设施 (Multi-region & Infra)',
    '21': '21 项目化管理 (Project Management)',
    '22': '22 SaaS 多租户管理 (Multi-tenant Architecture)',
    '23': '23 用户体验与设计规范 (UX & Design Guidelines)'
}

page_details = {
    '1': ('/login', '认证鉴权', 'POST /api/v1/auth/login, POST /api/v1/auth/refresh'),
    '2': ('/orgs', '平台中枢', 'GET /api/v1/tenants/:id/orgs, POST /api/v1/tenants/:id/orgs'),
    '3': ('/users, /roles', '平台中枢', 'GET /api/v1/users, POST /api/v1/users, GET /api/v1/roles'),
    '4': ('/devices', '资产管理', 'GET /api/v1/devices, POST /api/v1/devices, POST /api/v1/devices/import'),
    '5': ('/vehicles', '资产管理', 'GET /api/v1/vehicles, POST /api/v1/vehicles, POST /api/v1/vehicles/:id/bind'),
    '6': ('/commands', '车控运营', 'POST /api/v1/commands, WS: command.status'),
    '7': ('/commands/capabilities', '车控运营', 'GET /api/v1/capabilities/templates, POST /api/v1/capabilities/override'),
    '8': ('/alarms', '运维保障', 'GET /api/v1/alarms, POST /api/v1/alarms/:id/process, WS: alarm.triggered'),
    '9': ('/keys', '资产管理', 'GET /api/v1/keys, POST /api/v1/keys/share'),
    '10': ('/telemetry, /geofence', '位置与围栏', 'GET /api/v1/locations/latest, GET /api/v1/locations/trajectory, GET /api/v1/geofences'),
    '11': ('/dashboard', '概览看板', 'GET /api/v1/dashboard/stats, GET /api/v1/metrics'),
    '12': ('/billing', '财务增值', 'GET /api/v1/billing/orders (待二期补齐)'),
    '13': ('/devices/sim', '资产管理', 'GET /api/v1/sim-cards (关联设备详情)'),
    '14': ('/ota', '运维保障', 'POST /api/v1/ota/firmware, POST /api/v1/ota/plans, WS: ota.progress'),
    '15': ('/system/app-versions', '系统运维', 'GET /api/v1/app/versions (系统配置)'),
    '16': ('/monitor', '系统运维', 'GET /metrics, GET /api/v1/monitor/health'),
    '17': ('/system/open-api', '系统运维', 'GET /api/v1/open-api/credentials, POST /api/v1/open-api/tokens'),
    '18': ('/monitor/gateway', '系统运维', 'GET /metrics (car_active_simulators, car_websocket_connections)'),
    '19': ('/logs', '运维保障', 'GET /api/v1/logs/communication, GET /api/v1/logs/export'),
    '20': ('/system/regions', '系统运维', 'GET /api/v1/regions (多区域集群状态)'),
    '21': ('/projects', '平台中枢', 'GET /api/v1/projects, POST /api/v1/projects'),
    '22': ('/tenants', '平台中枢', 'GET /api/v1/tenants, POST /api/v1/tenants, GET /api/v1/tenants/:id/quota'),
    '23': ('全局交互标准', 'UI/UX规范', '前端设计规范与通用交互组件')
}

out = []
out.append('# 手机控车平台 188 项全量功能需求与 Admin 页面映射追踪矩阵 (Requirements Traceability Matrix)\n')
out.append('> **规范版本**：v2.1 (Sprint 0 需求与设计基线)')
out.append('> **原始文件依据**：《手机控车平台功能清单.docx》（东莞市新粤电子）')
out.append('> **统计汇总**：全量 **23 个业务模块**，共 **188 项功能点**（P0 核心必备：111 项，P1 重要：65 项，P2 可选：12 项）')
out.append('> **归属路径**：`docs/product/requirements-map.md`\n')
out.append('---\n')

current_mod = ''
for r in all_rows:
    idx, name, desc, prio = r[0], r[1], r[2], r[3]
    mod_prefix = idx.split('.')[0] if '.' in idx else 'other'
    if mod_prefix != current_mod:
        current_mod = mod_prefix
        mod_title = module_names.get(current_mod, f'模块 {current_mod}')
        target_page, cluster, api_dep = page_details.get(current_mod, ('/other', '其他', '/api/v1/...'))
        out.append(f'\n## {mod_title}')
        out.append(f'**归属页面集群**：`{cluster}` ｜ **主要 Admin 路由**：`{target_page}` ｜ **核心 API 依据**：`{api_dep}`\n')
        out.append('| 编号 | 功能名称 | 优先级 | 功能说明与业务细节 | 对应 Admin 界面 / 组件 | 依赖后端接口 / 事件 | 验收判定标准 (AC) |')
        out.append('|---|---|:---:|---|---|---|---|')
    
    target_page, cluster, api_dep = page_details.get(mod_prefix, ('/other', '通用', '/api/v1/...'))
    clean_desc = desc.replace('|', '\\|').replace('\n', ' ')
    clean_name = name.replace('|', '\\|').replace('\n', ' ')
    out.append(f'| **{idx}** | {clean_name} | `{prio}` | {clean_desc} | `{target_page}` | `{api_dep}` | 1. 正常业务流可触发 2. 异常权限/离线友好提示 3. 结果状态双向闭环 |')

with open('docs/product/requirements-map.md', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

print('Wrote docs/product/requirements-map.md successfully.')
