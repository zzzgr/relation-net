import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';

// AntD v5 推荐用 <App> + App.useApp()，但业务代码大量调用 toast.success(...)
// 简化为全局桥：main.tsx 启动时注册 Bridge → 把 instance 写入这里

let messageInstance: MessageInstance | null = null;
let modalInstance: Omit<ModalStaticFunctions, 'warn'> | null = null;

export function registerMessageInstance(m: MessageInstance) {
  messageInstance = m;
}

export function registerModalInstance(m: Omit<ModalStaticFunctions, 'warn'>) {
  modalInstance = m;
}

function call(type: 'success' | 'error' | 'info' | 'warning', content: string) {
  if (!messageInstance) {
    console[type === 'error' ? 'error' : 'log'](`[toast:${type}]`, content);
    return;
  }
  messageInstance.open({ type, content });
}

export const toast = {
  success: (content: string) => call('success', content),
  error: (content: string) => call('error', content),
  info: (content: string) => call('info', content),
  warning: (content: string) => call('warning', content),
};

export function getModal() {
  return modalInstance;
}
