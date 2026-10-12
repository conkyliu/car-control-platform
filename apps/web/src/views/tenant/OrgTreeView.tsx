import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Tree,
  Input,
  Button,
  Space,
  Tag,
  Descriptions,
  Statistic,
  Modal,
  Form,
  Popconfirm,
  message,
  Typography,
  Alert,
  Empty,
  Divider,
} from 'antd';
import type { TreeDataNode } from 'antd';
import {
  ClusterOutlined,
  PlusOutlined,
  EditOutlined,
  StopOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
  DesktopOutlined,
  CarOutlined,
  UserOutlined,
  ApartmentOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTenantStore } from '../../store/useTenantStore.ts';
import type { OrgNodeDto } from '../../store/useTenantStore.ts';
import {
  getOrgTreeApi,
  createOrgApi,
  updateOrgApi,
  deleteOrgApi,
  type CreateOrgInput,
} from '../../api/tenant.ts';
import {
  buildOrgTree,
  filterOrgTree,
  canDisableOrg,
  findOrgNodeById,
  type OrgTreeNode,
} from './tenant-core.ts';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// 机构默认种子数据
const SEED_ORGS: OrgNodeDto[] = [
  {
    id: 'org-root',
    tenantId: 'tenant-001',
    name: '华东极速车队总指挥中心',
    code: 'HQ_CENTER',
    parentId: null,
    leader: '陈总指挥',
    phone: '13800000001',
    status: 'ACTIVE',
    description: '全车队核心调度与全国运营中枢',
    deviceCount: 20,
    vehicleCount: 15,
    userCount: 8,
  },
  {
    id: 'org-east',
    tenantId: 'tenant-001',
    name: '华东干线事业部',
    code: 'DIV_EAST',
    parentId: 'org-root',
    leader: '张经理',
    phone: '13800000002',
    status: 'ACTIVE',
    description: '负责长三角跨省干线货运编组',
    deviceCount: 80,
    vehicleCount: 60,
    userCount: 18,
  },
  {
    id: 'org-hz',
    tenantId: 'tenant-001',
    name: '杭州前置仓运营中心',
    code: 'OPS_HZ',
    parentId: 'org-east',
    leader: '李站长',
    phone: '13800000003',
    status: 'ACTIVE',
    description: '杭州临平保税区快速换电与检修节点',
    deviceCount: 350,
    vehicleCount: 300,
    userCount: 45,
  },
  {
    id: 'org-nb',
    tenantId: 'tenant-001',
    name: '宁波港口海运接驳站',
    code: 'OPS_NB',
    parentId: 'org-east',
    leader: '王站长',
    phone: '13800000004',
    status: 'ACTIVE',
    description: '北仑港集装箱短驳运输车辆',
    deviceCount: 470,
    vehicleCount: 375,
    userCount: 52,
  },
  {
    id: 'org-tech',
    tenantId: 'tenant-001',
    name: '车联网技术研发中心',
    code: 'RND_TECH',
    parentId: 'org-root',
    leader: '刘总工',
    phone: '13800000005',
    status: 'ACTIVE',
    description: 'T-Box 固件研发、协议解析与数据算法',
    deviceCount: 0,
    vehicleCount: 0,
    userCount: 14,
  },
];

export const OrgTreeView: React.FC = () => {
  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const currentOrgId = useTenantStore((s) => s.currentOrgId);
  const setCurrentOrgId = useTenantStore((s) => s.setCurrentOrgId);
  const orgTreeRaw = useTenantStore((s) => s.orgTree);
  const setOrgTreeRaw = useTenantStore((s) => s.setOrgTree);

  const [loading, setLoading] = useState(false);
  const [flatOrgs, setFlatOrgs] = useState<OrgNodeDto[]>(
    orgTreeRaw.length > 0 ? orgTreeRaw : SEED_ORGS
  );
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('org-root');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['org-root', 'org-east']);
  const [autoExpandParent, setAutoExpandParent] = useState(true);

  // 模态框状态
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create-root' | 'create-sub' | 'edit'>('create-root');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [form] = Form.useForm();

  // 加载机构数据
  const loadOrgs = async () => {
    setLoading(true);
    try {
      const data = await getOrgTreeApi(currentTenantId ?? undefined);
      if (Array.isArray(data) && data.length > 0) {
        setFlatOrgs(data);
        setOrgTreeRaw(data);
      } else {
        setFlatOrgs(SEED_ORGS);
        setOrgTreeRaw(SEED_ORGS);
      }
    } catch {
      // 容错降级
      setFlatOrgs(SEED_ORGS);
      setOrgTreeRaw(SEED_ORGS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgTreeRaw.length === 0) {
      loadOrgs();
    }
  }, [currentTenantId]);

  // 构建层级树
  const fullTree = useMemo(() => buildOrgTree(flatOrgs), [flatOrgs]);

  // 搜索过滤与展开 Keys 计算
  const { filteredTree, expandedKeys: searchExpandedKeys, matchedKeys } = useMemo(
    () => filterOrgTree(fullTree, searchKeyword),
    [fullTree, searchKeyword]
  );

  useEffect(() => {
    if (searchKeyword.trim()) {
      setExpandedKeys(searchExpandedKeys);
      setAutoExpandParent(true);
    }
  }, [searchKeyword, searchExpandedKeys]);

  // 当前选中节点
  const selectedNode = useMemo(
    () => findOrgNodeById(fullTree, selectedOrgId) || fullTree[0] || null,
    [fullTree, selectedOrgId]
  );

  // 父级节点信息（用于展示路径）
  const parentNode = useMemo(() => {
    if (!selectedNode?.parentId) return null;
    return findOrgNodeById(fullTree, selectedNode.parentId);
  }, [fullTree, selectedNode]);

  // 转换为 Ant Design Tree 兼容的数据节点
  const mapToTreeData = (nodes: OrgTreeNode[]): TreeDataNode[] => {
    return nodes.map((node) => {
      const isMatched = matchedKeys.includes(node.id);
      const isSelected = node.id === selectedOrgId;
      const isDisabled = node.status === 'DISABLED';

      const titleNode = (
        <span
          style={{
            fontWeight: isSelected ? 600 : 400,
            color: isDisabled
              ? 'rgba(0,0,0,0.25)'
              : isMatched
              ? '#1677ff'
              : 'rgba(0,0,0,0.88)',
          }}
        >
          {node.name}
          {isDisabled && (
            <Tag color="default" style={{ marginLeft: 6, fontSize: 11, padding: '0 4px' }}>
              已停用
            </Tag>
          )}
          {node.aggregatedDeviceCount > 0 && (
            <span style={{ marginLeft: 6, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              ({node.aggregatedDeviceCount}台)
            </span>
          )}
        </span>
      );

      return {
        key: node.id,
        title: titleNode,
        icon: <ClusterOutlined style={{ color: isDisabled ? '#d9d9d9' : '#1677ff' }} />,
        children: node.children ? mapToTreeData(node.children) : undefined,
      };
    });
  };

  const treeData = useMemo(() => mapToTreeData(filteredTree), [filteredTree, selectedOrgId, matchedKeys]);

  // 点击树节点选择
  const handleSelectNode = (selectedKeysValue: React.Key[]) => {
    if (selectedKeysValue.length > 0) {
      const id = String(selectedKeysValue[0]);
      setSelectedOrgId(id);
      setCurrentOrgId(id);
    }
  };

  // 1. 打开新建顶级机构
  const handleOpenCreateRoot = () => {
    setModalMode('create-root');
    form.resetFields();
    form.setFieldsValue({
      status: 'ACTIVE',
      sortOrder: 1,
    });
    setModalVisible(true);
  };

  // 2. 打开新建子机构
  const handleOpenCreateSub = () => {
    if (!selectedNode) return;
    setModalMode('create-sub');
    form.resetFields();
    form.setFieldsValue({
      parentName: selectedNode.name,
      status: 'ACTIVE',
      sortOrder: (selectedNode.children?.length ?? 0) + 1,
    });
    setModalVisible(true);
  };

  // 3. 打开编辑本机构
  const handleOpenEdit = () => {
    if (!selectedNode) return;
    setModalMode('edit');
    form.setFieldsValue({
      name: selectedNode.name,
      code: selectedNode.code,
      leader: selectedNode.leader,
      phone: selectedNode.phone,
      description: selectedNode.description,
      status: selectedNode.status || 'ACTIVE',
    });
    setModalVisible(true);
  };

  // 4. 提交机构表单
  const handleModalSubmit = async () => {
    try {
      const values = await form.validateFields();
      setModalSubmitting(true);

      if (modalMode === 'create-root') {
        const newOrg: OrgNodeDto = {
          id: `org-${Date.now()}`,
          tenantId: currentTenantId || 'tenant-001',
          name: values.name,
          code: values.code.trim().toUpperCase(),
          parentId: null,
          leader: values.leader,
          phone: values.phone,
          description: values.description,
          status: 'ACTIVE',
          deviceCount: 0,
          vehicleCount: 0,
          userCount: 0,
        };
        try {
          await createOrgApi({
            tenantId: newOrg.tenantId,
            name: newOrg.name,
            code: newOrg.code,
            parentId: null,
          });
        } catch {
          // Mock 降级
        }
        const updated = [...flatOrgs, newOrg];
        setFlatOrgs(updated);
        setOrgTreeRaw(updated);
        setSelectedOrgId(newOrg.id);
        message.success(`顶级机构【${values.name}】已成功建立`);
      } else if (modalMode === 'create-sub') {
        if (!selectedNode) return;
        const newSubOrg: OrgNodeDto = {
          id: `org-${Date.now()}`,
          tenantId: currentTenantId || 'tenant-001',
          name: values.name,
          code: values.code.trim().toUpperCase(),
          parentId: selectedNode.id,
          leader: values.leader,
          phone: values.phone,
          description: values.description,
          status: 'ACTIVE',
          deviceCount: 0,
          vehicleCount: 0,
          userCount: 0,
        };
        try {
          await createOrgApi({
            tenantId: newSubOrg.tenantId,
            name: newSubOrg.name,
            code: newSubOrg.code,
            parentId: selectedNode.id,
          });
        } catch {
          // Mock 降级
        }
        const updated = [...flatOrgs, newSubOrg];
        setFlatOrgs(updated);
        setOrgTreeRaw(updated);
        setSelectedOrgId(newSubOrg.id);
        setExpandedKeys((prev) => Array.from(new Set([...prev, selectedNode.id])));
        message.success(`下级机构【${values.name}】已成功挂载至【${selectedNode.name}】`);
      } else if (modalMode === 'edit') {
        if (!selectedNode) return;
        try {
          await updateOrgApi(selectedNode.id, values);
        } catch {
          // Mock 降级
        }
        const updated = flatOrgs.map((o) =>
          o.id === selectedNode.id ? { ...o, ...values } : o
        );
        setFlatOrgs(updated);
        setOrgTreeRaw(updated);
        message.success(`机构【${values.name}】信息已更新`);
      }

      setModalVisible(false);
    } catch {
      // Form validation failed
    } finally {
      setModalSubmitting(false);
    }
  };

  // 5. 停用/启用机构
  const handleToggleOrgStatus = async () => {
    if (!selectedNode) return;

    if (selectedNode.status === 'ACTIVE') {
      // 停用前置安全校验：若本级或子机构下有有效设备或车辆，严禁直接停用
      const check = canDisableOrg(selectedNode);
      if (!check.allowed) {
        message.error(check.message);
        return;
      }
    }

    const nextStatus: 'ACTIVE' | 'DISABLED' =
      selectedNode.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await updateOrgApi(selectedNode.id, { status: nextStatus });
    } catch {
      // Mock 降级
    }

    const updated = flatOrgs.map((o) =>
      o.id === selectedNode.id ? { ...o, status: nextStatus } : o
    );
    setFlatOrgs(updated);
    setOrgTreeRaw(updated);
    message.success(`机构【${selectedNode.name}】已${nextStatus === 'ACTIVE' ? '恢复启用' : '成功停用'}`);
  };

  return (
    <Row gutter={16} style={{ minHeight: 'calc(100vh - 190px)' }}>
      {/* 左侧 35% 树形导航面板 */}
      <Col xs={24} lg={9} xl={8}>
        <Card
          bordered={false}
          style={{
            height: '100%',
            borderRadius: 8,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
          }}
          styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
        >
          {/* 顶部标题与新建顶级按钮 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Space align="center" size="small">
              <ApartmentOutlined style={{ color: '#1677ff', fontSize: 18 }} />
              <Title level={5} style={{ margin: 0 }}>
                组织机构拓扑
              </Title>
            </Space>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateRoot}
            >
              添加顶级机构
            </Button>
          </div>

          {/* 实时搜索过滤 */}
          <div style={{ marginBottom: 12 }}>
            <Input
              placeholder="快速搜索部门名称 / 机构编码"
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
            />
          </div>

          {/* 树组件 */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 400 }}>
            {treeData.length > 0 ? (
              <Tree
                showIcon
                blockNode
                treeData={treeData}
                selectedKeys={[selectedOrgId]}
                onSelect={handleSelectNode}
                expandedKeys={expandedKeys}
                onExpand={(keys) => {
                  setExpandedKeys(keys);
                  setAutoExpandParent(false);
                }}
                autoExpandParent={autoExpandParent}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未检索到匹配的组织机构"
                style={{ marginTop: 48 }}
              />
            )}
          </div>
        </Card>
      </Col>

      {/* 右侧 65% 详情与管理面板 */}
      <Col xs={24} lg={15} xl={16}>
        {selectedNode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. 机构属性基本信息卡片 */}
            <Card
              bordered={false}
              style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
              title={
                <Space align="center" size="middle">
                  <ClusterOutlined style={{ color: '#1677ff' }} />
                  <span>{selectedNode.name}</span>
                  <Tag color={selectedNode.status === 'ACTIVE' ? 'success' : 'default'}>
                    {selectedNode.status === 'ACTIVE' ? '正常运营' : '已停用'}
                  </Tag>
                </Space>
              }
              extra={
                <Space size="small">
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleOpenCreateSub}
                  >
                    添加下级子机构
                  </Button>
                  <Button icon={<EditOutlined />} onClick={handleOpenEdit}>
                    编辑本机构
                  </Button>
                  <Popconfirm
                    title={selectedNode.status === 'ACTIVE' ? '确定停用该机构？' : '确定重新启用该机构？'}
                    description={
                      selectedNode.status === 'ACTIVE'
                        ? '停用后，该机构名下将不可再新分配车辆与设备，需确认无下属资产后方可执行。'
                        : '重新启用后，该机构恢复所有层级资源关联能力。'
                    }
                    onConfirm={handleToggleOrgStatus}
                    okText={selectedNode.status === 'ACTIVE' ? '确认停用' : '确认启用'}
                    cancelText="取消"
                    okButtonProps={{ danger: selectedNode.status === 'ACTIVE' }}
                  >
                    <Button danger={selectedNode.status === 'ACTIVE'}>
                      {selectedNode.status === 'ACTIVE' ? '停用机构' : '启用机构'}
                    </Button>
                  </Popconfirm>
                </Space>
              }
            >
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="middle">
                <Descriptions.Item label="机构名称">{selectedNode.name}</Descriptions.Item>
                <Descriptions.Item label="机构唯一编码">
                  <Tag color="blue">{selectedNode.code}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="所属上级机构">
                  {parentNode ? (
                    <Text strong style={{ color: '#1677ff' }}>
                      {parentNode.name}
                    </Text>
                  ) : (
                    <Tag color="gold">顶级总部机构</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="部门负责人">
                  {selectedNode.leader || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="联络电话">
                  {selectedNode.phone || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="当前运营状态">
                  {selectedNode.status === 'ACTIVE' ? (
                    <Tag color="success">正常启用</Tag>
                  ) : (
                    <Tag color="default">停用</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="机构职责与备注" span={3}>
                  {selectedNode.description || '暂无详细描述'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 2. 机构下属及子级资源指标看板 */}
            <Card
              bordered={false}
              style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
              title="机构管辖资源全景概览 (含本级与子机构汇总)"
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={8}>
                  <Card bordered style={{ backgroundColor: '#f0f5ff', borderRadius: 6 }}>
                    <Statistic
                      title="管辖车载设备总数"
                      value={selectedNode.aggregatedDeviceCount}
                      prefix={<DesktopOutlined style={{ color: '#1677ff' }} />}
                      suffix="台"
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                      本级直属: {selectedNode.deviceCount ?? 0} 台
                    </div>
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card bordered style={{ backgroundColor: '#f6ffed', borderRadius: 6 }}>
                    <Statistic
                      title="绑定运营车辆数"
                      value={selectedNode.aggregatedVehicleCount}
                      prefix={<CarOutlined style={{ color: '#52c41a' }} />}
                      valueStyle={{ color: '#52c41a' }}
                      suffix="辆"
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                      本级直属: {selectedNode.vehicleCount ?? 0} 辆
                    </div>
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card bordered style={{ backgroundColor: '#fff7e6', borderRadius: 6 }}>
                    <Statistic
                      title="分配中台账户数"
                      value={selectedNode.aggregatedUserCount}
                      prefix={<UserOutlined style={{ color: '#fa8c16' }} />}
                      valueStyle={{ color: '#fa8c16' }}
                      suffix="人"
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                      本级直属: {selectedNode.userCount ?? 0} 人
                    </div>
                  </Card>
                </Col>
              </Row>

              {/* 资产安全防护说明 */}
              {(selectedNode.aggregatedDeviceCount > 0 || selectedNode.aggregatedVehicleCount > 0) && (
                <Alert
                  type="info"
                  showIcon
                  icon={<InfoCircleOutlined />}
                  message="资产安全防线保障中"
                  description="当前机构或其下属分支仍关联有在线车载终端或车辆，系统已开启资产防线，严禁直接物理删除或违规停用。如需停用，请先通过资产调拨将设备与车辆迁移至其他有效机构。"
                  style={{ marginTop: 16 }}
                />
              )}
            </Card>
          </div>
        ) : (
          <Card bordered={false} style={{ borderRadius: 8 }}>
            <Empty description="请从左侧组织架构树中选择一个机构查看详情" />
          </Card>
        )}
      </Col>

      {/* 模态框：创建/编辑机构 */}
      <Modal
        title={
          modalMode === 'create-root'
            ? '添加顶级组织机构'
            : modalMode === 'create-sub'
            ? `添加下级机构 - 所属上级: ${selectedNode?.name}`
            : `编辑机构属性 - ${selectedNode?.name}`
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleModalSubmit}
        confirmLoading={modalSubmitting}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical">
          {modalMode === 'create-sub' && (
            <Form.Item name="parentName" label="所属上级机构">
              <Input disabled />
            </Form.Item>
          )}

          <Form.Item
            name="name"
            label="机构名称"
            rules={[{ required: true, message: '请输入机构全称，如：华东前置仓运营中心' }]}
          >
            <Input placeholder="例：华东前置仓运营中心" maxLength={40} />
          </Form.Item>

          <Form.Item
            name="code"
            label="机构编码"
            rules={[
              { required: true, message: '请输入机构唯一识别码' },
              { pattern: /^[A-Z0-9_]{2,32}$/, message: '仅限大写英文字母、数字和下划线 (如 OPS_HZ)' },
            ]}
          >
            <Input placeholder="例：OPS_HZ" maxLength={32} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="leader" label="部门负责人">
                <Input placeholder="负责人姓名" maxLength={20} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="联系电话">
                <Input placeholder="手机号或座机" maxLength={20} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="机构职能职责说明">
            <TextArea rows={3} placeholder="可填写管辖物理区域、主要调度职能与营运责任等" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  );
};

export default OrgTreeView;
