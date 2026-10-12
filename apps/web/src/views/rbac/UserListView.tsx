import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Modal,
  Form,
  Popconfirm,
  message,
  Typography,
  Tooltip,
  TreeSelect,
  Avatar,
  Alert,
} from 'antd';
import type { TableProps } from 'antd';
import {
  UserOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
  StopOutlined,
  AlertOutlined,
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  KeyOutlined,
  DeleteOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { useTenantStore } from '../../store/useTenantStore.ts';
import type { UserDto, CreateUserInput, UpdateUserInput } from '../../api/user.ts';
import {
  fetchUsersApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  resetUserPasswordApi,
  updateUserStatusApi,
} from '../../api/user.ts';
import type { RoleDto } from '../../api/role.ts';
import { fetchRolesApi } from '../../api/role.ts';
import {
  calculateUserStats,
  filterUsers,
  canDeleteUser,
  canDisableUser,
  maskPhone,
  validatePhone,
  validateEmail,
  validateUsername,
  validatePassword,
  generateRandomPassword,
  isApiError,
  SEED_USERS,
  SEED_ROLES,
} from './rbac-core.ts';

const { Title, Text, Paragraph } = Typography;

export const UserListView: React.FC = () => {
  const currentUser = useAuthStore((s) => s.user);
  const orgTree = useTenantStore((s) => s.orgTree);

  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);

  // 筛选器状态
  const [keyword, setKeyword] = useState('');
  const [orgFilter, setOrgFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // 新建/编辑弹窗状态
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [userForm] = Form.useForm();

  // 重置密码弹窗状态
  const [resetPwdModalVisible, setResetPwdModalVisible] = useState(false);
  const [targetResetUser, setTargetResetUser] = useState<UserDto | null>(null);
  const [submittingResetPwd, setSubmittingResetPwd] = useState(false);
  const [resetPwdForm] = Form.useForm();

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedUsers, fetchedRoles] = await Promise.allSettled([
        fetchUsersApi(),
        fetchRolesApi(),
      ]);

      if (fetchedUsers.status === 'fulfilled' && Array.isArray(fetchedUsers.value) && fetchedUsers.value.length > 0) {
        setUsers(fetchedUsers.value);
      } else if (users.length === 0) {
        setUsers(SEED_USERS);
      }

      if (fetchedRoles.status === 'fulfilled' && Array.isArray(fetchedRoles.value) && fetchedRoles.value.length > 0) {
        setRoles(fetchedRoles.value);
      } else if (roles.length === 0) {
        setRoles(SEED_ROLES);
      }
    } catch (err: unknown) {
      if (isApiError(err)) {
        message.error(`拉取用户列表失败: ${err.message}`);
      }
      if (users.length === 0) {
        setUsers(SEED_USERS);
      }
      if (roles.length === 0) {
        setRoles(SEED_ROLES);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const effectiveUsers = users.length > 0 ? users : SEED_USERS;
  const effectiveRoles = roles.length > 0 ? roles : SEED_ROLES;

  // 统计概览指标
  const stats = useMemo(() => calculateUserStats(effectiveUsers), [effectiveUsers]);

  // 筛选过滤后的用户列表
  const filteredUsers = useMemo(
    () =>
      filterUsers(effectiveUsers, {
        keyword,
        orgId: orgFilter,
        status: statusFilter,
        role: roleFilter,
      }),
    [effectiveUsers, keyword, orgFilter, statusFilter, roleFilter]
  );

  // 角色代码到名称及标签颜色的映射字典
  const roleMetaMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    const colorPalette = ['purple', 'blue', 'cyan', 'gold', 'green', 'geekblue', 'magenta'];
    effectiveRoles.forEach((r, idx) => {
      let color = colorPalette[idx % colorPalette.length]!;
      if (r.code === 'SUPER_ADMIN') color = 'purple';
      else if (r.code === 'TENANT_ADMIN') color = 'blue';
      else if (r.code === 'OPERATOR') color = 'cyan';
      else if (r.code === 'AUDITOR') color = 'gold';
      else if (r.code === 'CAR_OWNER') color = 'green';
      map.set(r.code, { name: r.name, color });
    });
    return map;
  }, [effectiveRoles]);

  // 机构树转换为 TreeSelect 格式
  const orgTreeSelectData = useMemo(() => {
    const convertNode = (node: any): any => ({
      value: node.id,
      title: node.name,
      children: node.children ? node.children.map(convertNode) : undefined,
    });

    const tree = orgTree && orgTree.length > 0 ? orgTree.map(convertNode) : [];

    // 若无机构树，以已有用户中的机构构建备选项
    if (tree.length === 0) {
      const distinctOrgs = new Map<string, string>();
      effectiveUsers.forEach((u) => {
        if (u.orgId && u.orgName) {
          distinctOrgs.set(u.orgId, u.orgName);
        }
      });
      return Array.from(distinctOrgs.entries()).map(([id, name]) => ({
        value: id,
        title: name,
      }));
    }

    return tree;
  }, [orgTree, effectiveUsers]);

  // 打开新建弹窗
  const handleOpenCreateModal = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({
      status: 'ACTIVE',
      roles: ['OPERATOR'],
    });
    setUserModalVisible(true);
  };

  // 打开编辑弹窗
  const handleOpenEditModal = (user: UserDto) => {
    setEditingUser(user);
    userForm.resetFields();
    userForm.setFieldsValue({
      username: user.username,
      realName: user.realName,
      phone: user.phone,
      email: user.email,
      orgId: user.orgId || undefined,
      roles: user.roles || [],
      status: user.status,
    });
    setUserModalVisible(true);
  };

  // 提交新建/编辑
  const handleSubmitUserModal = async () => {
    try {
      const values = await userForm.validateFields();
      setSubmittingUser(true);

      const resolvedOrgName =
        orgTreeSelectData.find((o: any) => o.value === values.orgId)?.title ||
        effectiveUsers.find((u) => u.orgId === values.orgId)?.orgName ||
        '';

      if (editingUser) {
        // 编辑模式
        const updatePayload: UpdateUserInput = {
          realName: values.realName.trim(),
          phone: values.phone.trim(),
          email: values.email ? values.email.trim() : undefined,
          orgId: values.orgId || '',
          orgName: resolvedOrgName,
          roles: values.roles,
          status: values.status,
        };

        try {
          await updateUserApi(editingUser.id, updatePayload);
        } catch (apiErr: unknown) {
          if (isApiError(apiErr)) {
            message.error(`修改用户失败: ${apiErr.message}`);
            return;
          }
        }

        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id
              ? {
                  ...u,
                  ...updatePayload,
                  updatedAt: new Date().toISOString(),
                }
              : u
          )
        );
        message.success(`用户 ${editingUser.username} 信息更新成功`);
      } else {
        // 新建模式
        const createPayload: CreateUserInput = {
          username: values.username.trim(),
          realName: values.realName.trim(),
          phone: values.phone.trim(),
          email: values.email ? values.email.trim() : undefined,
          orgId: values.orgId || '',
          orgName: resolvedOrgName,
          roles: values.roles,
          password: values.password,
          status: values.status || 'ACTIVE',
        };

        let newCreated: UserDto | null = null;
        try {
          newCreated = await createUserApi(createPayload);
        } catch (apiErr: unknown) {
          if (isApiError(apiErr)) {
            message.error(`创建用户失败: ${apiErr.message}`);
            return;
          }
        }

        const newUserItem: UserDto = newCreated || {
          id: `user-${Date.now()}`,
          username: createPayload.username,
          realName: createPayload.realName,
          phone: createPayload.phone,
          email: createPayload.email,
          orgId: createPayload.orgId,
          orgName: createPayload.orgName,
          roles: createPayload.roles,
          status: createPayload.status || 'ACTIVE',
          createdAt: new Date().toISOString(),
        };

        setUsers((prev) => [newUserItem, ...prev]);
        message.success(`用户 ${createPayload.username} 创建成功`);
      }

      setUserModalVisible(false);
    } catch {
      // 客户端表单未通过校验
    } finally {
      setSubmittingUser(false);
    }
  };

  // 启停状态切换
  const handleToggleStatus = async (user: UserDto) => {
    const nextStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await updateUserStatusApi(user.id, nextStatus);
    } catch (apiErr: unknown) {
      if (isApiError(apiErr)) {
        message.error(`状态切换失败: ${apiErr.message}`);
        return;
      }
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
    );
    message.success(`已将用户 ${user.username} 状态调整为 ${nextStatus === 'ACTIVE' ? '正常' : '已停用'}`);
  };

  // 删除用户
  const handleDeleteUser = async (user: UserDto) => {
    try {
      await deleteUserApi(user.id);
    } catch (apiErr: unknown) {
      if (isApiError(apiErr)) {
        message.error(`删除用户失败: ${apiErr.message}`);
        return;
      }
    }

    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    message.success(`用户 ${user.username} 已成功注销删除`);
  };

  // 打开重置密码弹窗
  const handleOpenResetPwd = (user: UserDto) => {
    setTargetResetUser(user);
    resetPwdForm.resetFields();
    resetPwdForm.setFieldsValue({
      newPassword: generateRandomPassword(12),
    });
    setResetPwdModalVisible(true);
  };

  // 随机生成强密码
  const handleGenerateRandomPwd = () => {
    const randomPwd = generateRandomPassword(12);
    resetPwdForm.setFieldsValue({ newPassword: randomPwd });
  };

  // 提交重置密码
  const handleSubmitResetPwd = async () => {
    if (!targetResetUser) return;
    try {
      const values = await resetPwdForm.validateFields();
      setSubmittingResetPwd(true);

      try {
        await resetUserPasswordApi(targetResetUser.id, values.newPassword);
      } catch (apiErr: unknown) {
        if (isApiError(apiErr)) {
          message.error(`重置密码失败: ${apiErr.message}`);
          return;
        }
      }

      message.success(`用户 ${targetResetUser.username} 的密码重置成功，首次登录需修改`);
      setResetPwdModalVisible(false);
    } catch {
      // 表单未校验通过
    } finally {
      setSubmittingResetPwd(false);
    }
  };

  // 表格列定义
  const columns: TableProps<UserDto>['columns'] = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 170,
      render: (text: string, record: UserDto) => {
        const isSelf =
          (currentUser?.id && record.id === currentUser.id) ||
          (currentUser?.username && record.username === currentUser.username);

        return (
          <Space align="center" size="small">
            <Avatar
              size="small"
              style={{
                backgroundColor: isSelf ? '#1677ff' : '#87d068',
                verticalAlign: 'middle',
              }}
              icon={<UserOutlined />}
            />
            <span style={{ fontWeight: 600 }}>{text}</span>
            {isSelf && (
              <Tag color="blue" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
                当前登录
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '真实姓名',
      dataIndex: 'realName',
      key: 'realName',
      width: 120,
    },
    {
      title: '手机号码',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
      render: (phone?: string) => {
        if (!phone) return <span style={{ color: 'rgba(0, 0, 0, 0.25)' }}>未填写</span>;
        return (
          <Tooltip title={`完整手机号码: ${phone}`}>
            <Text code style={{ cursor: 'pointer' }}>
              {maskPhone(phone)}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: '所属机构',
      dataIndex: 'orgName',
      key: 'orgName',
      width: 170,
      render: (orgName?: string) => {
        if (orgName && orgName.trim()) {
          return <Tag color="geekblue">{orgName}</Tag>;
        }
        return (
          <Tag color="warning" icon={<AlertOutlined />}>
            待分配机构
          </Tag>
        );
      },
    },
    {
      title: '拥有角色',
      dataIndex: 'roles',
      key: 'roles',
      width: 220,
      render: (roleCodes?: string[]) => {
        if (!roleCodes || roleCodes.length === 0) {
          return <span style={{ color: 'rgba(0, 0, 0, 0.25)' }}>暂无角色</span>;
        }
        return (
          <Space size={[4, 4]} wrap>
            {roleCodes.map((code) => {
              const meta = roleMetaMap.get(code);
              return (
                <Tag key={code} color={meta?.color ?? 'default'}>
                  {meta?.name ?? code}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: '账号状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: 'ACTIVE' | 'DISABLED') => {
        if (status === 'ACTIVE') {
          return <Tag color="success">正常</Tag>;
        }
        return <Tag color="error">已停用</Tag>;
      },
    },
    {
      title: '最近登录时间',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 170,
      render: (val?: string) => (
        <span style={{ fontSize: 13, color: 'rgba(0, 0, 0, 0.65)' }}>{val || '-'}</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: UserDto) => {
        const disableGuard = canDisableUser(record, currentUser?.id, currentUser?.username);
        const deleteGuard = canDeleteUser(record, currentUser?.id, currentUser?.username);

        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEditModal(record)}
            >
              编辑
            </Button>

            <Button
              type="link"
              size="small"
              icon={<KeyOutlined />}
              onClick={() => handleOpenResetPwd(record)}
            >
              重置密码
            </Button>

            {disableGuard.allowed ? (
              <Popconfirm
                title={
                  record.status === 'ACTIVE'
                    ? `确认要停用用户 ${record.username} 吗？`
                    : `确认要启用用户 ${record.username} 吗？`
                }
                description={
                  record.status === 'ACTIVE'
                    ? '停用后该用户将立即失去平台登录与接口调用权限。'
                    : '启用后该用户恢复正常的平台系统操作权限。'
                }
                okText="确认"
                cancelText="取消"
                onConfirm={() => handleToggleStatus(record)}
              >
                <Button
                  type="link"
                  size="small"
                  danger={record.status === 'ACTIVE'}
                >
                  {record.status === 'ACTIVE' ? '停用' : '启用'}
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title={disableGuard.message}>
                <Button type="link" size="small" disabled>
                  停用
                </Button>
              </Tooltip>
            )}

            {deleteGuard.allowed ? (
              <Popconfirm
                title={`确认彻底删除账号 ${record.username} 吗？`}
                description="删除后该用户的登录凭证和历史关联记录将被注销，该操作不可逆！"
                okText="确认删除"
                okType="danger"
                cancelText="取消"
                onConfirm={() => handleDeleteUser(record)}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title={deleteGuard.message}>
                <Button type="link" size="small" disabled icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部指标概览卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card
            hoverable
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title="用户总数"
              value={stats.totalUsers}
              prefix={<UserOutlined style={{ color: '#1677ff' }} />}
              suffix="人"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            hoverable
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title="正常启用用户"
              value={stats.activeUsers}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              suffix="人"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            hoverable
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title="已停用账号"
              value={stats.disabledUsers}
              valueStyle={{ color: '#8c8c8c' }}
              prefix={<StopOutlined style={{ color: '#8c8c8c' }} />}
              suffix="人"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            hoverable
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title="待分配机构用户"
              value={stats.unassignedOrgUsers}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<AlertOutlined style={{ color: '#fa8c16' }} />}
              suffix="人"
            />
          </Card>
        </Col>
      </Row>

      {/* 主数据列表与筛选器卡片 */}
      <Card
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* 多维筛选工具栏 */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Space size="middle" wrap>
            <Input
              placeholder="搜索用户名 / 姓名 / 手机号"
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
              style={{ width: 230 }}
            />

            <Select
              value={orgFilter}
              onChange={setOrgFilter}
              style={{ width: 180 }}
              options={[
                { value: 'ALL', label: '全部机构' },
                { value: 'UNASSIGNED', label: '待分配机构' },
                ...orgTreeSelectData.map((item: any) => ({
                  value: item.value,
                  label: item.title,
                })),
              ]}
            />

            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 120 }}
              options={[
                { value: 'ALL', label: '全部状态' },
                { value: 'ACTIVE', label: '正常' },
                { value: 'DISABLED', label: '已停用' },
              ]}
            />

            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              style={{ width: 150 }}
              options={[
                { value: 'ALL', label: '全部角色' },
                ...effectiveRoles.map((r) => ({
                  value: r.code,
                  label: r.name,
                })),
              ]}
            />

            <Button icon={<ReloadOutlined />} onClick={loadData}>
              刷新
            </Button>
          </Space>

          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={handleOpenCreateModal}
          >
            新增用户
          </Button>
        </div>

        {/* 用户列表表格 */}
        <Table<UserDto>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredUsers}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 位用户账号`,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 新增 / 编辑用户模态框 */}
      <Modal
        title={editingUser ? `编辑用户: ${editingUser.username}` : '新增企业用户账号'}
        open={userModalVisible}
        onOk={handleSubmitUserModal}
        onCancel={() => setUserModalVisible(false)}
        confirmLoading={submittingUser}
        destroyOnClose
        width={560}
      >
        <Form form={userForm} layout="vertical" preserve={false}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              {
                validator: (_, val) => {
                  if (editingUser) return Promise.resolve();
                  const res = validateUsername(val);
                  return res.valid ? Promise.resolve() : Promise.reject(new Error(res.error));
                },
              },
            ]}
            extra="4-20位英文字母、数字或下划线，创建后不可修改"
          >
            <Input
              disabled={Boolean(editingUser)}
              placeholder="例如: zhangsan"
              prefix={<UserOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="真实姓名"
                name="realName"
                rules={[{ required: true, message: '请输入真实姓名' }]}
              >
                <Input placeholder="例如: 张三" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label="手机号码"
                name="phone"
                rules={[
                  { required: true, message: '请输入手机号码' },
                  {
                    validator: (_, val) => {
                      const res = validatePhone(val);
                      return res.valid ? Promise.resolve() : Promise.reject(new Error(res.error));
                    },
                  },
                ]}
              >
                <Input placeholder="11位中国大陆手机号" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="电子邮箱"
            name="email"
            rules={[
              {
                validator: (_, val) => {
                  const res = validateEmail(val);
                  return res.valid ? Promise.resolve() : Promise.reject(new Error(res.error));
                },
              },
            ]}
          >
            <Input placeholder="选填，例如: zhangsan@company.com" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="所属机构" name="orgId">
                <TreeSelect
                  showSearch
                  allowClear
                  placeholder="请选择归属组织机构"
                  treeData={orgTreeSelectData}
                  treeDefaultExpandAll
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label="账号状态"
                name="status"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select
                  options={[
                    { value: 'ACTIVE', label: '正常' },
                    { value: 'DISABLED', label: '已停用' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="分配角色"
            name="roles"
            rules={[{ required: true, message: '请至少分配一个角色' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择分配的角色"
              options={effectiveRoles.map((r) => ({
                value: r.code,
                label: `${r.name} (${r.code})`,
              }))}
            />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              label="初始登录密码"
              name="password"
              rules={[
                { required: true, message: '请输入初始密码' },
                {
                  validator: (_, val) => {
                    const res = validatePassword(val);
                    return res.valid ? Promise.resolve() : Promise.reject(new Error(res.error));
                  },
                },
              ]}
              extra="8位以上，须包含英文字母与数字"
            >
              <Input.Password
                placeholder="请输入初始登录密码"
                prefix={<LockOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 重置密码模态框 */}
      <Modal
        title={
          <Space align="center">
            <SafetyCertificateOutlined style={{ color: '#fa8c16' }} />
            <span>重置用户密码</span>
          </Space>
        }
        open={resetPwdModalVisible}
        onOk={handleSubmitResetPwd}
        onCancel={() => setResetPwdModalVisible(false)}
        confirmLoading={submittingResetPwd}
        destroyOnClose
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          <Alert
            type="info"
            showIcon
            message="重置密码安全须知"
            description="密码重置后，该用户下次登录系统时将被强制要求自行设定新密码。"
            style={{ marginBottom: 16 }}
          />
          <Paragraph>
            目标账号：<Text strong>{targetResetUser?.username}</Text> (
            {targetResetUser?.realName})
          </Paragraph>
        </div>

        <Form form={resetPwdForm} layout="vertical">
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              {
                validator: (_, val) => {
                  const res = validatePassword(val);
                  return res.valid ? Promise.resolve() : Promise.reject(new Error(res.error));
                },
              },
            ]}
          >
            <Input.Password
              placeholder="请输入或点击下方一键生成强密码"
              prefix={<LockOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
            />
          </Form.Item>

          <Button type="dashed" onClick={handleGenerateRandomPwd} block style={{ marginBottom: 8 }}>
            随机生成强密码
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default UserListView;
