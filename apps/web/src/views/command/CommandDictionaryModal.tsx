import React from 'react';
import { Modal, Space } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import { CommandCode } from './command-dictionary-core.ts';
import { CommandDictionaryView } from './CommandDictionaryView.tsx';

export interface CommandDictionaryModalProps {
  open: boolean;
  onClose: () => void;
  initialCommandCode?: CommandCode;
}

export const CommandDictionaryModal: React.FC<CommandDictionaryModalProps> = ({
  open,
  onClose,
  initialCommandCode,
}) => {
  return (
    <Modal
      title={
        <Space align="center" size={8}>
          <BookOutlined style={{ color: '#1677ff' }} />
          <span>全局指令字典与协议参数规范</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      destroyOnClose
      styles={{
        body: {
          maxHeight: '78vh',
          overflowY: 'auto',
          padding: '16px 20px',
        },
      }}
    >
      <CommandDictionaryView isModal={true} initialCommandCode={initialCommandCode} />
    </Modal>
  );
};
