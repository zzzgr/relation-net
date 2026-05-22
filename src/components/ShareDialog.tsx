import { ShareAltOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ALL_VISIBLE_FIELDS,
  VISIBLE_FIELD_LABEL,
  createShare,
  type ShareMode,
  type VisibleField,
} from '@/api/shares';
import { toast } from '@/lib/message';
import { buildShareUrl } from '@/lib/share-password';

type ExpiresPreset = 'never' | '7' | '30' | '90' | '365' | 'custom';

interface FormValues {
  password: string;
  title: string;
  expires_preset: ExpiresPreset;
  expires_custom: number;
  visible_fields: VisibleField[];
}

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  rootPersonId: number;
  defaultTitle: string;
  mode: ShareMode;
}

export function ShareDialog({
  open,
  onClose,
  rootPersonId,
  defaultTitle,
  mode,
}: ShareDialogProps) {
  const [form] = Form.useForm<FormValues>();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [sharePassword, setSharePassword] = useState<string | null>(null);
  const expiresPreset = Form.useWatch('expires_preset', form);

  const shareMut = useMutation({
    mutationFn: createShare,
    onSuccess: (share) => {
      const url = buildShareUrl(share.token);
      setShareUrl(url);
      setShareToken(share.token);
      setSharePassword(share.password);
      toast.success('分享链接已生成');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFinish = (values: FormValues) => {
    let expires_days: number | undefined;
    if (values.expires_preset === 'never') {
      expires_days = undefined;
    } else if (values.expires_preset === 'custom') {
      expires_days = Number(values.expires_custom) || undefined;
    } else {
      expires_days = Number(values.expires_preset);
    }
    shareMut.mutate({
      root_person_id: rootPersonId,
      title: values.title.trim() || defaultTitle,
      password: values.password,
      expires_days,
      mode,
      visible_fields: mode === 'person' ? values.visible_fields ?? [] : undefined,
    });
  };

  const handleClose = () => {
    setShareUrl(null);
    setShareToken(null);
    setSharePassword(null);
    form.resetFields();
    onClose();
  };

  const copyUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => toast.success('已复制'));
  };

  const copyUrlWithPassword = () => {
    if (!shareToken || !sharePassword) return;
    const url = buildShareUrl(shareToken, sharePassword);
    navigator.clipboard.writeText(url).then(() => toast.success('已复制（含密码）'));
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      title={mode === 'person' ? '分享此人' : '分享家族树'}
      destroyOnHidden
      width={460}
    >
      {!shareUrl ? (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          requiredMark={false}
          autoComplete="off"
          initialValues={{
            title: defaultTitle,
            password: '',
            expires_preset: 'never',
            expires_custom: 30,
            visible_fields: [] as VisibleField[],
          }}
        >
          <Form.Item name="title" label="分享标题">
            <Input placeholder="显示给访问者的标题" />
          </Form.Item>

          <Form.Item
            name="password"
            label="访问密码"
            rules={[
              { required: true, message: '请设置访问密码' },
              { min: 4, message: '至少 4 位' },
            ]}
          >
            <Input.Password placeholder="访问者需要输入此密码" autoComplete="new-password" />
          </Form.Item>

          <Form.Item name="expires_preset" label="有效期">
            <Select
              options={[
                { value: 'never', label: '永不失效' },
                { value: '7', label: '7 天' },
                { value: '30', label: '30 天' },
                { value: '90', label: '90 天' },
                { value: '365', label: '1 年' },
                { value: 'custom', label: '自定义天数' },
              ]}
            />
          </Form.Item>
          {expiresPreset === 'custom' && (
            <Form.Item
              name="expires_custom"
              label="自定义天数"
              rules={[
                { required: true, message: '请输入天数' },
                { type: 'number', min: 1, message: '至少 1 天' },
              ]}
            >
              <InputNumber min={1} max={3650} style={{ width: '100%' }} addonAfter="天" />
            </Form.Item>
          )}

          {mode === 'person' && (
            <Form.Item
              name="visible_fields"
              label="访问者可以看到的内容"
              tooltip="不勾选的字段会被隐藏；姓名未勾选时按首字打码"
            >
              <Checkbox.Group
                options={ALL_VISIBLE_FIELDS.map((f) => ({
                  label: VISIBLE_FIELD_LABEL[f],
                  value: f,
                }))}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '6px 12px',
                }}
              />
            </Form.Item>
          )}

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={shareMut.isPending}
            icon={<ShareAltOutlined />}
          >
            生成分享链接
          </Button>
        </Form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] text-[var(--color-muted-fg)]">
            分享链接已生成，将链接和密码发送给对方即可查看：
          </p>
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          >
            <code className="flex-1 truncate text-[12px] text-[var(--color-foreground)]">
              {shareUrl}
            </code>
            <Button size="small" onClick={copyUrl}>
              复制链接
            </Button>
          </div>
          <Button type="primary" block onClick={copyUrlWithPassword}>
            复制链接（含密码）
          </Button>
          <p className="m-0 text-[11px] text-[var(--color-muted-fg)]">
            含密码链接打开后自动验证。若之后修改了密码，旧链接将失效。
          </p>
          <Button block onClick={handleClose}>
            完成
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default ShareDialog;

