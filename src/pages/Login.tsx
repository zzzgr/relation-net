import { useMutation, useQuery } from '@tanstack/react-query';
import { DeploymentUnitOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input } from 'antd';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '@/api/auth';
import { getPublicAppTitle } from '@/api/settings';
import { toast } from '@/lib/message';

interface FormValues {
  password: string;
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const [form] = Form.useForm<FormValues>();

  const titleQ = useQuery({
    queryKey: ['public-app-title'],
    queryFn: getPublicAppTitle,
    staleTime: 60_000,
  });
  const appTitle = titleQ.data || '人物关系网';

  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  const loginMut = useMutation({
    mutationFn: (pw: string) => login(pw),
    onSuccess: () => {
      toast.success('登录成功');
      navigate(next, { replace: true });
    },
    onError: (e: Error) => {
      toast.error(e.message || '登录失败');
    },
  });

  const onFinish = (values: FormValues) => {
    if (!values.password?.trim()) {
      toast.error('请输入密码');
      return;
    }
    loginMut.mutate(values.password);
  };

  return (
    <div
      className="grid min-h-dvh place-items-center px-4"
      style={{
        background:
          'radial-gradient(circle at 18% 22%, rgba(16,185,129,0.06) 0%, transparent 38%), radial-gradient(circle at 82% 78%, rgba(16,185,129,0.04) 0%, transparent 42%), var(--color-background)',
      }}
    >
      <Card
        className="w-full"
        style={{
          maxWidth: 400,
          border: '1px solid var(--color-border)',
          borderRadius: 12,
        }}
        styles={{ body: { padding: 32 } }}
      >
        <div className="flex flex-col items-center gap-3 pb-5 text-center">
          <span
            className="grid h-12 w-12 place-items-center rounded-lg text-[22px]"
            style={{
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent-strong)',
            }}
            aria-hidden
          >
            <DeploymentUnitOutlined />
          </span>
          <h1 className="m-0 text-[24px] font-semibold tracking-tight text-[var(--color-foreground)]">
            {appTitle}
          </h1>
          <p className="m-0 text-[13px] text-[var(--color-muted-fg)]">
            记录你身边的人、关系与故事
          </p>
        </div>

        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
          autoComplete="on"
        >
          <Form.Item
            name="password"
            label="访问密码"
            rules={[{ required: true, message: '请输入访问密码' }]}
          >
            <Input.Password
              size="middle"
              placeholder="请输入访问密码"
              autoFocus
              autoComplete="current-password"
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            size="middle"
            block
            loading={loginMut.isPending}
            style={{ marginTop: 4 }}
          >
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
