import React from 'react';
import { Tabs, Dropdown, Button, Space } from 'antd';
import type { MenuProps } from 'antd';
import {
  ReloadOutlined,
  CloseOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  EllipsisOutlined,
} from '@ant-design/icons';
import { useNavTabsStore, NavTabItem } from '../store/useNavTabsStore.ts';

export const NavTabs: React.FC = () => {
  const tabs = useNavTabsStore((s) => s.tabs);
  const activeKey = useNavTabsStore((s) => s.activeKey);
  const switchTab = useNavTabsStore((s) => s.switchTab);
  const closeTab = useNavTabsStore((s) => s.closeTab);
  const closeOthers = useNavTabsStore((s) => s.closeOthers);
  const closeAll = useNavTabsStore((s) => s.closeAll);
  const refreshTab = useNavTabsStore((s) => s.refreshTab);

  const getContextMenuItems = (tab: NavTabItem): MenuProps['items'] => [
    {
      key: 'refresh',
      icon: <ReloadOutlined />,
      label: '刷新当前标签',
      onClick: () => refreshTab(tab.key),
    },
    {
      key: 'close-current',
      icon: <CloseOutlined />,
      label: '关闭当前标签',
      disabled: !tab.closable,
      onClick: () => closeTab(tab.key),
    },
    {
      key: 'close-others',
      icon: <CloseCircleOutlined />,
      label: '关闭其他标签',
      disabled: tabs.length <= 1,
      onClick: () => closeOthers(tab.key),
    },
    {
      key: 'close-all',
      icon: <MinusCircleOutlined />,
      label: '全部关闭',
      disabled: tabs.every((t) => !t.closable),
      onClick: () => closeAll(),
    },
  ];

  const globalActionItems: MenuProps['items'] = [
    {
      key: 'refresh-active',
      icon: <ReloadOutlined />,
      label: '刷新当前',
      onClick: () => refreshTab(activeKey),
    },
    {
      key: 'close-active',
      icon: <CloseOutlined />,
      label: '关闭当前',
      disabled: tabs.find((t) => t.key === activeKey)?.closable === false,
      onClick: () => closeTab(activeKey),
    },
    {
      key: 'close-others',
      icon: <CloseCircleOutlined />,
      label: '关闭其他',
      disabled: tabs.length <= 1,
      onClick: () => closeOthers(activeKey),
    },
    {
      key: 'close-all',
      icon: <MinusCircleOutlined />,
      label: '关闭全部',
      disabled: tabs.every((t) => !t.closable),
      onClick: () => closeAll(),
    },
  ];

  const tabItems = tabs.map((tab) => ({
    key: tab.key,
    closable: tab.closable,
    label: (
      <Dropdown menu={{ items: getContextMenuItems(tab) }} trigger={['contextMenu']}>
        <span style={{ userSelect: 'none', padding: '0 4px' }}>{tab.title}</span>
      </Dropdown>
    ),
  }));

  const handleEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: 'add' | 'remove'
  ) => {
    if (action === 'remove' && typeof targetKey === 'string') {
      closeTab(targetKey);
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        padding: '6px 16px 0',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Tabs
          type="editable-card"
          hideAdd
          size="small"
          activeKey={activeKey}
          onChange={switchTab}
          onEdit={handleEdit}
          items={tabItems}
          style={{ marginBottom: -1 }}
        />
      </div>

      <div style={{ marginLeft: 8, paddingBottom: 6 }}>
        <Dropdown menu={{ items: globalActionItems }} placement="bottomRight">
          <Button size="small" type="text" icon={<EllipsisOutlined />} title="标签页批量操作" />
        </Dropdown>
      </div>
    </div>
  );
};

export default NavTabs;
