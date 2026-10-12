import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Input,
  Tag,
  Space,
  Radio,
  Tree,
  Modal,
  Form,
  Popconfirm,
  message,
  Typography,
  Tooltip,
  Alert,
  Empty,
  Badge,
  Divider,
} from 'antd';
import type { TreeDataNode } from 'antd';
import {
  SafetyCertificateOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  ReloadOutlined,
  CheckSquareOutlined,
  BorderOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  LockOutlined,
  UserOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/useAuthStore.ts';
import type { RoleDto, RoleDataScope, CreateRoleInput, UpdateRoleInput, PermissionTreeNode } from '../../api/role.ts';
import {
  fetchRolesApi,
  createRoleApi,
  updateRoleApi,
  deleteRoleApi,
  updateRolePermissionsApi,
} from '../../api/role.ts';
import { fetchUsersApi } from '../../api/user.ts';
import {
  calculateRoleStats,
  aggregateRoleUserCounts,
  canDeleteRole,
  getDataScopeLabel,
  getDataScopeColor,
  DATA_SCOPE_OPTIONS,
  flattenPermissionKeys,
  getAllPermissionNodeKeys,
  isSuperAdminRole,
  SUPER_ADMIN_LOCKED_PERMISSIONS,
  PERMISSION_TREE_DATA,
  SEED_ROLES,
  SEED_USERS,
  isApiError,
} from './rbac-core.ts';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const RolePermissionView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  // 右侧配置区暂存编辑态
  const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
  const [currentDataScope, setCurrentDataScope] = useState<RoleDataScope>('ORG_AND_CHILDREN');

  // 权限树展开 Keys
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(() =>
    getAllPermissionNodeKeys(PERMISSION_TREE_DATA)
  );

  // 新增 / 编辑角色弹窗状态
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDto | null>(null);
  const [submittingRole, setSubmittingRole] = useState(false);
  const [roleForm] = Form.useForm();

  // 加载角色与用户列表
  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedRoles, fetchedUsers] = await Promise.allSettled([
        fetchRolesApi(),
        fetchUsersApi(),
      ]);

      let roleList = SEED_ROLES;
      let userList = SEED_USERS;

      if (fetchedRoles.status === 'fulfilled' && Array.isArray(fetchedRoles.value) && fetchedRoles.value.length > 0) {
        roleList = fetchedRoles.value;
      }
      if (fetchedUsers.status === 'fulfilled' && Array.isArray(fetchedUsers.value) && fetchedUsers.value.length > 0) {
        userList = fetchedUsers.value;
      }

      const aggregated = aggregateRoleUserCounts(roleList, userList);
      setRoles(aggregated);

      // 若未选中角色，默认选中第一项
      if (aggregated.length > 0 && !selectedRoleId) {
        const first = aggregated[0]!;
        setSelectedRoleId(first.id);
        setCurrentPermissions(first.permissions || []);
        setCurrentDataScope(first.dataScope || 'ORG_AND_CHILDREN');
      }
    } catch (err: unknown) {
      if (isApiError(err)) {
        message.error(`拉取角色数据失败: ${err.message}`);
      }
      const aggregated = aggregateRoleUserCounts(SEED_ROLES, SEED_USERS);
      setRoles(aggregated);
      if (aggregated.length > 0 && !selectedRoleId) {
        const first = aggregated[0]!;
        setSelectedRoleId(first.id);
        setCurrentPermissions(first.permissions || []);
        setCurrentDataScope(first.dataScope || 'ORG_AND_CHILDREN');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const effectiveRoles = roles.length > 0 ? roles : SEED_ROLES;
  const selectedRole = useMemo(
    () => effectiveRoles.find((r) => r.id === selectedRoleId) || effectiveRoles[0] || null,
    [effectiveRoles, selectedRoleId]
  );

  // 当切换选中角色时，同步重置右侧表单与权限树状态
  const handleSelectRole = (role: RoleDto) => {
    setSelectedRoleId(role.id);
    setCurrentPermissions(role.permissions || []);
    setCurrentDataScope(role.dataScope || 'ORG_AND_CHILDREN');
  };

  // 统计概览
  const stats = useMemo(() => calculateRoleStats(effectiveRoles), [effectiveRoles]);

  // 构建支持 Ant Design 6 Tree 的权限树数据
  const treeData = useMemo<TreeDataNode[]>(() => {
    const isSuperAdmin = selectedRole ? isSuperAdminRole(selectedRole.code) : false;

    const mapNode = (node: PermissionTreeNode): TreeDataNode => {
      const isLocked = isSuperAdmin && node.code && SUPER_ADMIN_LOCKED_PERMISSIONS.includes(node.code);
      const isAction = node.type === 'action';
      const isCluster = node.type === 'cluster';

      let titleNode = (
        <span style={{ fontSize: 13 }}>
          {isCluster ? (
            <span style={{ fontWeight: 600, color: 'rgba(0, 0, 0, 0.88)' }}>{node.title}</span>
          ) : isAction ? (
            <Space size={6}>
              <span>{node.title}</span>
              {node.code && (
                <Tag color="cyan" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
                  {node.code}
                </Tag>
              )}
            </Space>
          ) : (
            <Space size={6}>
              <span style={{ fontWeight: 500 }}>{node.title}</span>
              {node.code && (
                <Tag color="blue" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
                  {node.code}
                </Tag>
              )}
            </Space>
          )}

          {isLocked && (
            <Tooltip title="超级管理员只读保护项，不可取消勾选">
              <LockOutlined style={{ color: '#faad14', marginLeft: 6, fontSize: 12 }} />
            </Tooltip>
          )}
        </span>
      );

      return {
        key: node.code || node.key,
        title: titleNode,
        disabled: Boolean(isLocked),
        children: node.children ? node.children.map(mapNode) : undefined,
      };
    };

    return PERMISSION_TREE_DATA.map(mapNode);
  }, [selectedRole]);

  // 快捷操作：全选
  const handleSelectAll = () => {
    const allLeafKeys = flattenPermissionKeys(PERMISSION_TREE_DATA);
    setCurrentPermissions(allLeafKeys);
  };

  // 快捷操作：全不选
  const handleClearAll = () => {
    if (selectedRole && isSuperAdminRole(selectedRole.code)) {
      // 超级管理员保留受保护核心权限
      setCurrentPermissions([...SUPER_ADMIN_LOCKED_PERMISSIONS]);
      message.info('超级管理员已保留核心系统管理权限');
    } else {
      setCurrentPermissions([]);
    }
  };

  // 快捷操作：全部展开
  const handleExpandAll = () => {
    setExpandedKeys(getAllPermissionNodeKeys(PERMISSION_TREE_DATA));
  };

  // 快捷操作：全部折叠
  const handleCollapseAll = () => {
    setExpandedKeys([]);
  };

  // 树勾选触发
  const handleTreeCheck = (checkedKeysValue: any) => {
    const checked = Array.isArray(checkedKeysValue) ? checkedKeysValue : checkedKeysValue.checked;

    if (selectedRole && isSuperAdminRole(selectedRole.code)) {
      // 强制包含受保护项
      const combined = Array.from(new Set([...checked, ...SUPER_ADMIN_LOCKED_PERMISSIONS]));
      setCurrentPermissions(combined as string[]);
    } else {
      setCurrentPermissions(checked as string[]);
    }
  };

  // 保存当前角色的权限树与数据范围
  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      try {
        await updateRolePermissionsApi(selectedRole.id, currentPermissions, currentDataScope);
      } catch (apiErr: unknown) {
        if (isApiError(apiErr)) {
          message.error(`保存权限失败: ${apiErr.message}`);
          return;
        }
      }

      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRole.id
            ? {
                ...r,
                permissions: currentPermissions,
                dataScope: currentDataScope,
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );

      message.success(`角色「${selectedRole.name}」细粒度权限与数据范围配置已成功持久化`);
    } finally {
      setSaving(false);
    }
  };

  // 打开新建角色弹窗
  const handleOpenCreateRole = () => {
    setEditingRole(null);
    roleForm.resetFields();
    roleForm.setFieldsValue({
      dataScope: 'ORG_AND_CHILDREN',
    });
    setRoleModalVisible(true);
  };

  // 打开编辑角色弹窗
  const handleOpenEditRole = (role: RoleDto, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    roleForm.resetFields();
    roleForm.setFieldsValue({
      name: role.name,
      code: role.code,
      dataScope: role.dataScope,
      description: role.description,
    });
    setRoleModalVisible(true);
  };

  // 提交新建/编辑角色
  const handleSubmitRoleModal = async () => {
    try {
      const values = await roleForm.validateFields();
      setSubmittingRole(true);

      if (editingRole) {
        // 编辑
        const updatePayload: UpdateRoleInput = {
          name: values.name.trim(),
          dataScope: values.dataScope,
          description: values.description ? values.description.trim() : undefined,
        };

        try {
          await updateRoleApi(editingRole.id, updatePayload);
        } catch (apiErr: unknown) {
          if (isApiError(apiErr)) {
            message.error(`修改角色失败: ${apiErr.message}`);
            return;
          }
        }

        setRoles((prev) =>
          prev.map((r) =>
            r.id === editingRole.id
              ? {
                  ...r,
                  name: values.name.trim(),
                  dataScope: values.dataScope,
                  description: values.description ? values.description.trim() : undefined,
                  updatedAt: new Date().toISOString(),
                }
              : r
          )
        );
        if (selectedRoleId === editingRole.id) {
          setCurrentDataScope(values.dataScope);
        }
        message.success(`角色「${values.name}」修改成功`);
      } else {
        // 新建
        const createPayload: CreateRoleInput = {
          name: values.name.trim(),
          code: values.code.trim().toUpperCase(),
          dataScope: values.dataScope,
          description: values.description ? values.description.trim() : undefined,
          permissions: ['dashboard:read'],
        };

        let newCreated: RoleDto | null = null;
        try {
          newCreated = await createRoleApi(createPayload);
        } catch (apiErr: unknown) {
          if (isApiError(apiErr)) {
            message.error(`创建角色失败: ${apiErr.message}`);
            return;
          }
        }

        const newRoleItem: RoleDto = newCreated || {
          id: `role-${Date.now()}`,
          name: createPayload.name,
          code: createPayload.code,
          dataScope: createPayload.dataScope || 'ORG_AND_CHILDREN',
          description: createPayload.description,
          permissions: createPayload.permissions || ['dashboard:read'],
          userCount: 0,
          isSystem: false,
          createdAt: new Date().toISOString(),
        };

        setRoles((prev) => [...prev, newRoleItem]);
        setSelectedRoleId(newRoleItem.id);
        setCurrentPermissions(newRoleItem.permissions);
        setCurrentDataScope(newRoleItem.dataScope);
        message.success(`新角色「${createPayload.name}」创建成功`);
      }

      setRoleModalVisible(false);
    } catch {
      // 校验未通过
    } finally {
      setSubmittingRole(false);
    }
  };

  // 删除角色
  const handleDeleteRole = async (role: RoleDto, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteRoleApi(role.id);
    } catch (apiErr: unknown) {
      if (isApiError(apiErr)) {
        message.error(`删除角色失败: ${apiErr.message}`);
        return;
      }
    }

    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    if (selectedRoleId === role.id) {
      const remaining = roles.filter((r) => r.id !== role.id);
      if (remaining.length > 0) {
        handleSelectRole(remaining[0]!);
      }
    }
    message.success(`角色「${role.name}」已成功删除`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 40% / 60% 左右分栏工作台 */}
      <Row gutter={[16, 16]}>
        {/* 左侧 40%：角色列表卡片 */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space align="center" size="small">
                <SafetyCertificateOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                <span>角色定义列表</span>
                <Badge
                  count={stats.totalRoles}
                  style={{ backgroundColor: '#1677ff' }}
                  title="角色总数"
                />
              </Space>
            }
            extra={
              <Space size="small">
                <Button icon={<ReloadOutlined />} size="small" onClick={loadData}>
                  刷新
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  size="small"
                  onClick={handleOpenCreateRole}
                >
                  新建角色
                </Button>
              </Space>
            }
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
              minHeight: 680,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {effectiveRoles.map((role) => {
                const isSelected = selectedRoleId === role.id;
                const deleteGuard = canDeleteRole(role);

                return (
                  <div
                    key={role.id}
                    onClick={() => handleSelectRole(role)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: isSelected ? '1.5px solid #1677ff' : '1px solid rgba(0, 0, 0, 0.08)',
                      backgroundColor: isSelected ? '#e6f4ff' : '#ffffff',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 2px 8px rgba(22, 119, 255, 0.15)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 6,
                      }}
                    >
                      <Space size="small" wrap>
                        <Text strong style={{ fontSize: 15 }}>
                          {role.name}
                        </Text>
                        <Text code style={{ fontSize: 12 }}>
                          {role.code}
                        </Text>
                        {role.isSystem && (
                          <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
                            系统内置
                          </Tag>
                        )}
                      </Space>

                      {/* 角色卡片快捷操作按钮 */}
                      <Space size={4}>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined style={{ fontSize: 13 }} />}
                          onClick={(e) => handleOpenEditRole(role, e)}
                          title="编辑角色信息"
                        />

                        {deleteGuard.allowed ? (
                          <Popconfirm
                            title={`确认删除角色「${role.name}」吗？`}
                            description="删除后该角色的所有权限规则将同步注销。"
                            okText="删除"
                            okType="danger"
                            cancelText="取消"
                            onConfirm={(e) => e && handleDeleteRole(role, e as any)}
                            onPopupClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                              onClick={(e) => e.stopPropagation()}
                              title="删除角色"
                            />
                          </Popconfirm>
                        ) : (
                          <Tooltip title={deleteGuard.message}>
                            <Button
                              type="text"
                              disabled
                              size="small"
                              icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Tooltip>
                        )}
                      </Space>
                    </div>

                    {role.description && (
                      <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2 }}
                        style={{ fontSize: 12, marginBottom: 8 }}
                      >
                        {role.description}
                      </Paragraph>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 4,
                      }}
                    >
                      <Space size="small">
                        <Tag
                          color={getDataScopeColor(role.dataScope)}
                          style={{ margin: 0, fontSize: 12 }}
                        >
                          {getDataScopeLabel(role.dataScope)}
                        </Tag>
                        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                          {role.permissions?.length ?? 0} 项功能权限
                        </span>
                      </Space>

                      <Space size={4} style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
                        <UserOutlined style={{ color: '#1677ff' }} />
                        <span>{role.userCount ?? 0} 人</span>
                      </Space>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>

        {/* 右侧 60%：权限树配置与数据权限范围卡片 */}
        <Col xs={24} lg={14}>
          <Card
            title={
              selectedRole ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KeyOutlined style={{ color: '#1677ff' }} />
                  <span>权限分配中枢:</span>
                  <Tag color="blue" style={{ fontSize: 13, margin: 0 }}>
                    {selectedRole.name} ({selectedRole.code})
                  </Tag>
                </div>
              ) : (
                '权限中枢配置'
              )
            }
            extra={
              selectedRole && (
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={handleSavePermissions}
                >
                  保存权限配置
                </Button>
              )
            }
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
              minHeight: 680,
            }}
          >
            {selectedRole ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 超级管理员安全防护警示 */}
                {isSuperAdminRole(selectedRole.code) && (
                  <Alert
                    type="warning"
                    showIcon
                    message="系统内置超级管理员 (SUPER_ADMIN) 保护提示"
                    description="该角色为系统的核心安全基座，涵盖平台中枢、租户管理与审计查看等关键权限已被自动锁定保护，不可取消勾选。"
                  />
                )}

                {/* 1. 数据权限范围选择 (Data Scope) */}
                <div>
                  <div style={{ marginBottom: 10 }}>
                    <Text strong style={{ fontSize: 14 }}>
                      数据访问权限边界 (Data Scope)
                    </Text>
                    <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>
                      约束该角色成员在各业务模块内能检索、操作和导出的车辆与运营数据隔离级别。
                    </Paragraph>
                  </div>

                  <Radio.Group
                    value={currentDataScope}
                    onChange={(e) => setCurrentDataScope(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <Row gutter={[12, 12]}>
                      {DATA_SCOPE_OPTIONS.map((opt) => (
                        <Col span={12} key={opt.value}>
                          <div
                            onClick={() => setCurrentDataScope(opt.value)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              border:
                                currentDataScope === opt.value
                                  ? '1.5px solid #1677ff'
                                  : '1px solid rgba(0,0,0,0.1)',
                              backgroundColor:
                                currentDataScope === opt.value ? '#f0f7ff' : '#fafafa',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Radio value={opt.value}>
                              <span style={{ fontWeight: 600 }}>{opt.label}</span>
                            </Radio>
                            <div
                              style={{
                                fontSize: 12,
                                color: 'rgba(0,0,0,0.45)',
                                paddingLeft: 24,
                                marginTop: 4,
                              }}
                            >
                              {opt.description}
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </Radio.Group>
                </div>

                <Divider style={{ margin: '8px 0' }} />

                {/* 2. 6 大业务集群细粒度操作权限树 */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <Text strong style={{ fontSize: 14 }}>
                        功能菜单与细粒度按钮级权限树 (Permissions Tree)
                      </Text>
                      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                        已勾选 {currentPermissions.length} 项功能及操作权限
                      </div>
                    </div>

                    {/* 便捷操作工具栏 */}
                    <Space size="small">
                      <Button
                        size="small"
                        icon={<CheckSquareOutlined />}
                        onClick={handleSelectAll}
                      >
                        全选
                      </Button>
                      <Button
                        size="small"
                        icon={<BorderOutlined />}
                        onClick={handleClearAll}
                      >
                        全不选
                      </Button>
                      <Button
                        size="small"
                        icon={<FolderOpenOutlined />}
                        onClick={handleExpandAll}
                      >
                        展开全部
                      </Button>
                      <Button
                        size="small"
                        icon={<FolderOutlined />}
                        onClick={handleCollapseAll}
                      >
                        折叠全部
                      </Button>
                    </Space>
                  </div>

                  <div
                    style={{
                      border: '1px solid rgba(0, 0, 0, 0.08)',
                      borderRadius: 6,
                      padding: 12,
                      maxHeight: 450,
                      overflowY: 'auto',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <Tree
                      checkable
                      treeData={treeData}
                      checkedKeys={currentPermissions}
                      onCheck={handleTreeCheck}
                      expandedKeys={expandedKeys}
                      onExpand={setExpandedKeys}
                    />
                  </div>
                </div>

                {/* 底部保存按钮条 */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    paddingTop: 8,
                    borderTop: '1px solid rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <Space size="middle">
                    <Button onClick={() => handleSelectRole(selectedRole)}>重置更改</Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      onClick={handleSavePermissions}
                    >
                      保存权限配置
                    </Button>
                  </Space>
                </div>
              </div>
            ) : (
              <Empty description="请从左侧角色列表中选择一个角色以查看和配置权限" />
            )}
          </Card>
        </Col>
      </Row>

      {/* 新建 / 编辑角色模态框 */}
      <Modal
        title={editingRole ? `编辑角色: ${editingRole.name}` : '新建企业角色定义'}
        open={roleModalVisible}
        onOk={handleSubmitRoleModal}
        onCancel={() => setRoleModalVisible(false)}
        confirmLoading={submittingRole}
        destroyOnClose
        width={500}
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item
            label="角色名称"
            name="name"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如: 智能车控调度员" />
          </Form.Item>

          <Form.Item
            label="角色代码 (Role Code)"
            name="code"
            rules={[
              { required: true, message: '请输入角色唯一编码' },
              {
                pattern: /^[A-Z0-9_]{3,30}$/,
                message: '角色代码仅限3-30位大写英文字母、数字或下划线 (如 FLEET_DISPATCHER)',
              },
            ]}
            extra="系统角色代码用于权限匹配，创建后不可修改"
          >
            <Input
              disabled={Boolean(editingRole)}
              placeholder="例如: FLEET_DISPATCHER"
              style={{ textTransform: 'uppercase' }}
            />
          </Form.Item>

          <Form.Item
            label="默认数据权限范围"
            name="dataScope"
            rules={[{ required: true, message: '请选择数据权限范围' }]}
          >
            <Radio.Group style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {DATA_SCOPE_OPTIONS.map((opt) => (
                  <Radio key={opt.value} value={opt.value}>
                    <span>{opt.label}</span>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginLeft: 8 }}>
                      ({opt.description})
                    </span>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="角色业务说明" name="description">
            <TextArea
              rows={3}
              placeholder="请输入该角色的业务定位、职责边界与使用场景"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RolePermissionView;
