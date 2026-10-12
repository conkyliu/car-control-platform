import React, { useState } from 'react';
import {
  Modal,
  Steps,
  Button,
  Upload,
  Alert,
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Space,
  Typography,
  Result,
  Progress,
  message,
} from 'antd';
import type { TableProps } from 'antd';
import {
  DownloadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import {
  generateDeviceImportTemplate,
  parseDeviceImportCsv,
  generateSkippedErrorsCsv,
  type ImportValidationResult,
  type ImportInvalidRow,
} from './excel-import-core.ts';
import {
  batchImportDevicesApi,
  type BatchImportResultDto,
  type BatchImportErrorItem,
} from '../../api/device.ts';

const { Text, Paragraph } = Typography;

export interface BatchImportModalProps {
  visible?: boolean;
  open?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  remainingQuota?: number;
}

/**
 * 触发浏览器安全下载 CSV 纯函数
 */
function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const BatchImportModal: React.FC<BatchImportModalProps> = ({
  visible,
  open,
  onClose,
  onSuccess,
  remainingQuota = 1000,
}) => {
  const isModalOpen = open ?? visible ?? false;

  // 步骤索引：0 = 下载模板，1 = 上传预检，2 = 执行与结果
  const [currentStep, setCurrentStep] = useState(0);

  // 文件解析结果与元数据
  const [fileName, setFileName] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);

  // 执行导入状态
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<BatchImportResultDto | null>(null);

  // 重置整个向导
  const handleReset = () => {
    setCurrentStep(0);
    setFileName('');
    setValidationResult(null);
    setImporting(false);
    setImportResult(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Step 1: 下载标准模板
  const handleDownloadTemplate = () => {
    const templateContent = generateDeviceImportTemplate();
    downloadCsv(templateContent, 'device_batch_import_template.csv');
    message.success('设备导入模板已开始下载');
  };

  // Step 2: 文件上传拦截与预解析
  const handleFileRead = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        message.error('文件内容为空，请重新选择');
        return;
      }

      setFileName(file.name);
      const result = parseDeviceImportCsv(content, { remainingQuota });
      setValidationResult(result);

      if (result.maxRowsExceeded) {
        message.error(`单批次超过上限 1,000 行（当前 ${result.totalRows} 行），请拆分后重新上传`);
      } else if (result.isQuotaExceeded) {
        message.warning(`待导入 ${result.quotaRequired} 台超过剩余配额 ${result.quotaAvailable} 台`);
      } else if (result.validItems.length > 0) {
        message.success(`文件解析完成：共 ${result.totalRows} 行，有效 ${result.validItems.length} 行`);
      }
    };
    reader.onerror = () => {
      message.error('文件读取失败，请检查文件权限后重试');
    };
    reader.readAsText(file);
    return false; // 阻止 AntD 自动上传
  };

  // Step 2 -> Step 3: 开始导入调用 API
  const handleStartImport = async () => {
    if (!validationResult || validationResult.validItems.length === 0) {
      message.error('无可导入的有效设备记录');
      return;
    }

    if (validationResult.isQuotaExceeded) {
      message.error('当前待导入设备已超出租户配额，禁止提交');
      return;
    }

    if (validationResult.maxRowsExceeded) {
      message.error('单批次不能超过 1,000 行限制');
      return;
    }

    setCurrentStep(2);
    setImporting(true);

    try {
      const res = await batchImportDevicesApi(validationResult.validItems);
      setImportResult(res);
      if (res.successCount > 0) {
        message.success(`成功导入 ${res.successCount} 台设备！`);
      } else {
        message.warning('导入完成，但所有记录均被跳过或失败');
      }
    } catch (err: any) {
      message.error(`导入请求失败: ${err?.message || '网络异常'}`);
      setImportResult({
        total: validationResult.validItems.length,
        successCount: 0,
        errors: validationResult.validItems.map((item, idx) => ({
          rowNumber: idx + 1,
          deviceNo: item.deviceNo,
          imei: item.imei,
          reason: err?.message || '服务端异常',
        })),
      });
    } finally {
      setImporting(false);
    }
  };

  // 汇总所有被跳过或失败的错误行（包含预检格式错误行 + 后端导入错误行）
  const getAllErrors = (): ImportInvalidRow[] => {
    const list: ImportInvalidRow[] = [];

    // 1. 预检发现的格式错误行
    if (validationResult?.invalidRows) {
      list.push(...validationResult.invalidRows);
    }

    // 2. 后端执行失败或跳过的行
    if (importResult?.errors) {
      importResult.errors.forEach((err: BatchImportErrorItem) => {
        list.push({
          rowNumber: err.rowNumber ?? 0,
          deviceNo: err.deviceNo,
          imei: err.imei,
          reason: err.reason,
        });
      });
    }

    return list;
  };

  // 导出错误/跳过清单
  const handleExportSkippedErrors = () => {
    const allErrors = getAllErrors();
    if (allErrors.length === 0) {
      message.info('当前批次无失败或跳过记录');
      return;
    }

    const csvContent = generateSkippedErrorsCsv(allErrors);
    downloadCsv(csvContent, `device_import_skipped_errors_${Date.now()}.csv`);
    message.success('跳过与错误清单已导出');
  };

  // 完成并刷新
  const handleFinishAndClose = () => {
    handleClose();
    onSuccess?.();
  };

  // 预检错误预览表格列
  const errorColumns: TableProps<ImportInvalidRow>['columns'] = [
    {
      title: '行号',
      dataIndex: 'rowNumber',
      key: 'rowNumber',
      width: 70,
      render: (val: number) => <Text strong>{val}</Text>,
    },
    {
      title: '设备编号',
      dataIndex: 'deviceNo',
      key: 'deviceNo',
      width: 140,
      render: (val?: string) => (
        <Text style={{ fontFamily: 'monospace' }}>{val || '-'}</Text>
      ),
    },
    {
      title: 'IMEI',
      dataIndex: 'imei',
      key: 'imei',
      width: 160,
      render: (val?: string) => (
        <Text style={{ fontFamily: 'monospace' }}>{val || '-'}</Text>
      ),
    },
    {
      title: '校验未通过原因',
      dataIndex: 'reason',
      key: 'reason',
      render: (val: string) => <Text type="danger">{val}</Text>,
    },
  ];

  const allErrorsList = getAllErrors();
  const totalSkippedCount = allErrorsList.length;

  return (
    <Modal
      open={isModalOpen}
      title="批量设备导入向导"
      onCancel={handleClose}
      width={740}
      footer={null}
      destroyOnClose
    >
      <div style={{ padding: '8px 0 16px 0' }}>
        <Steps
          current={currentStep}
          items={[
            { title: '下载模板', description: '获取规范 CSV' },
            { title: '上传预检', description: '行级语法校验' },
            { title: '执行入库', description: '批量入网台账' },
          ]}
        />
      </div>

      {/* Step 1: 下载标准模板 */}
      {currentStep === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Alert
            type="info"
            showIcon
            message="批量导入规范指引"
            description={
              <ul style={{ paddingLeft: 18, margin: '6px 0 0 0' }}>
                <li>单批次文件最大支持 <strong>1,000</strong> 台设备导入；</li>
                <li><strong>设备编号</strong>为必填项，长度在 3~32 位字符之间；</li>
                <li><strong>IMEI 硬件标识</strong>为必填项，必须为严格 15 位全数字；</li>
                <li><strong>硬件型号ProductKey</strong>为必填项（如 TBOX-G4-STD, TBOX-G5-PRO 等）；</li>
                <li><strong>归属项目ID</strong>与 <strong>ICCID (19~20位)</strong> 为选填项。</li>
              </ul>
            }
          />

          <Card
            style={{
              textAlign: 'center',
              backgroundColor: 'var(--ant-color-bg-layout, #f5f5f5)',
              borderRadius: 8,
              padding: '24px 0',
            }}
          >
            <Space orientation="vertical" size="middle">
              <FileTextOutlined style={{ fontSize: 48, color: '#1677ff' }} />
              <div>
                <Text strong style={{ fontSize: 16 }}>
                  车控终端批量导入模板 (CSV / UTF-8)
                </Text>
                <Paragraph type="secondary" style={{ marginTop: 4 }}>
                  包含规范表头与示范示例数据，请在编辑后保存并上传
                </Paragraph>
              </div>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                size="large"
                onClick={handleDownloadTemplate}
              >
                📥 下载标准导入模板 (.csv)
              </Button>
            </Space>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button
              type="primary"
              onClick={() => setCurrentStep(1)}
              icon={<ArrowRightOutlined />}
            >
              下一步：上传文件
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: 上传文件与前端预检 */}
      {currentStep === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Upload.Dragger
            name="file"
            accept=".csv,text/csv"
            multiple={false}
            showUploadList={false}
            beforeUpload={handleFileRead}
            style={{ padding: '20px 0', borderRadius: 8 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: '#1677ff', fontSize: 44 }} />
            </p>
            <p className="ant-upload-text">点击或将编辑好的 CSV 文件拖拽到此处</p>
            <p className="ant-upload-hint">支持 UTF-8 编码 CSV 文件，系统将执行逐行秒级格式预校验</p>
          </Upload.Dragger>

          {fileName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileTextOutlined style={{ color: '#1677ff' }} />
              <Text strong>已选文件：{fileName}</Text>
            </div>
          )}

          {/* 预检统计卡片 */}
          {validationResult && (
            <>
              {/* 超限 / 配额告警 Alert */}
              {validationResult.maxRowsExceeded && (
                <Alert
                  type="error"
                  showIcon
                  icon={<CloseCircleOutlined />}
                  message="单批次导入超限阻断"
                  description={`当前文件共有 ${validationResult.totalRows} 行数据，已超过单批次 1,000 行硬上限！请拆分文件后再重新导入。`}
                />
              )}

              {validationResult.isQuotaExceeded && (
                <Alert
                  type="error"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message="租户设备配额硬约束拦截"
                  description={`当前有效待导入设备 ${validationResult.quotaRequired} 台，已超过租户剩余可用配额 ${validationResult.quotaAvailable} 台（总配额 ${remainingQuota} 台）！请删减数据或联系平台管理员扩容。`}
                />
              )}

              <Row gutter={12}>
                <Col span={6}>
                  <Card size="small" style={{ borderRadius: 6, textAlign: 'center' }}>
                    <Statistic title="总数据行数" value={validationResult.totalRows} suffix="行" />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ borderRadius: 6, textAlign: 'center' }}>
                    <Statistic
                      title="有效记录数"
                      value={validationResult.validItems.length}
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<CheckCircleOutlined />}
                      suffix="台"
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ borderRadius: 6, textAlign: 'center' }}>
                    <Statistic
                      title="格式错误行"
                      value={validationResult.invalidRows.length - validationResult.duplicateCount}
                      valueStyle={{
                        color:
                          validationResult.invalidRows.length > 0 ? '#ff4d4f' : 'inherit',
                      }}
                      prefix={<CloseCircleOutlined />}
                      suffix="行"
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ borderRadius: 6, textAlign: 'center' }}>
                    <Statistic
                      title="批内重复"
                      value={validationResult.duplicateCount}
                      valueStyle={{
                        color: validationResult.duplicateCount > 0 ? '#faad14' : 'inherit',
                      }}
                      prefix={<ExclamationCircleOutlined />}
                      suffix="项"
                    />
                  </Card>
                </Col>
              </Row>

              {/* 错误行清单展示 */}
              {validationResult.invalidRows.length > 0 && (
                <Card
                  size="small"
                  title={
                    <Space>
                      <Text type="danger" strong>
                        格式错误或重复项预览 (共 {validationResult.invalidRows.length} 项)
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        - 导入时将自动跳过这些行
                      </Text>
                    </Space>
                  }
                  style={{ borderRadius: 8 }}
                >
                  <Table<ImportInvalidRow>
                    size="small"
                    rowKey={(r) => `${r.rowNumber}-${r.deviceNo ?? ''}`}
                    columns={errorColumns}
                    dataSource={validationResult.invalidRows}
                    pagination={{ pageSize: 5, size: 'small', showTotal: (t) => `共 ${t} 条` }}
                  />
                </Card>
              )}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(0)}>
              上一步
            </Button>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              disabled={
                !validationResult ||
                validationResult.validItems.length === 0 ||
                validationResult.isQuotaExceeded ||
                validationResult.maxRowsExceeded
              }
              onClick={handleStartImport}
            >
              开始导入 ({validationResult?.validItems.length || 0} 台)
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: 执行导入与结果反馈 */}
      {currentStep === 2 && (
        <div style={{ padding: '16px 0' }}>
          {importing && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Progress
                percent={88}
                status="active"
                strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
              />
              <Paragraph style={{ marginTop: 16 }}>正在批量写入设备台账与分配项目，请稍候...</Paragraph>
            </div>
          )}

          {!importing && importResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Result
                status={importResult.successCount > 0 ? 'success' : 'warning'}
                title={
                  importResult.successCount > 0
                    ? '批量设备导入已完成！'
                    : '批量导入未产生有效入库'
                }
                subTitle={`提交 ${importResult.total} 台，成功入库 ${importResult.successCount} 台，跳过/失败 ${totalSkippedCount} 台`}
                extra={[
                  <Button
                    key="done"
                    type="primary"
                    size="large"
                    onClick={handleFinishAndClose}
                  >
                    完成并关闭
                  </Button>,
                  totalSkippedCount > 0 && (
                    <Button
                      key="export"
                      icon={<DownloadOutlined />}
                      size="large"
                      onClick={handleExportSkippedErrors}
                    >
                      📥 导出跳过/错误清单 CSV
                    </Button>
                  ),
                ].filter(Boolean)}
              />

              {totalSkippedCount > 0 && (
                <Card
                  size="small"
                  title="失败与跳过清单明细"
                  style={{ borderRadius: 8, marginTop: 8 }}
                >
                  <Table<ImportInvalidRow>
                    size="small"
                    rowKey={(r, i) => `${r.rowNumber}-${r.deviceNo ?? ''}-${i}`}
                    columns={errorColumns}
                    dataSource={allErrorsList}
                    pagination={{ pageSize: 5, size: 'small' }}
                  />
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default BatchImportModal;
