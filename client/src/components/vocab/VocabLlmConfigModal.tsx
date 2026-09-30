/**
 * LLM 配置弹窗（spec §3.1）：baseUrl / apiKey（密码遮罩）/ model 三输入。
 * 配置存 localStorage（设备级，key 见 utils/vocabLlm.ts），不进备份、不上传服务器；
 * 三字段均非空才算「已配置」——此处保存前同样按该口径校验。
 *
 * 「测试连接」按当前输入值发一条最小对话（HTTP 2xx 即成功）：成功后绿色「连接正常」，
 * 失败按 LlmError.message 展示分类原因；关闭弹窗即中止在途请求。
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { loadLlmConfig, saveLlmConfig, testLlmConnection } from '../../utils/vocabLlm';

interface VocabLlmConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 保存成功回调（父级刷新「已配置/未配置」状态） */
  onSaved?: () => void;
}

const PLACEHOLDER = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-…',
  model: 'deepseek-chat',
};

export function VocabLlmConfigModal({ isOpen, onClose, onSaved }: VocabLlmConfigModalProps) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);

  /* 每次打开回显已存配置（apiKey 以密码型输入框遮罩）；关闭时中止在途测试并清结果 */
  useEffect(() => {
    if (isOpen) {
      const config = loadLlmConfig();
      setBaseUrl(config?.baseUrl ?? '');
      setApiKey(config?.apiKey ?? '');
      setModel(config?.model ?? '');
      setError(null);
      setTesting(false);
      setTestResult(null);
      return;
    }
    testAbortRef.current?.abort();
    testAbortRef.current = null;
    setTesting(false);
    setTestResult(null);
  }, [isOpen]);

  /** 以当前输入（未保存也可）发最小对话验证连通性；失败原因即 LlmError.message */
  const handleTest = async () => {
    const next = { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() };
    if (!next.baseUrl || !next.apiKey || !next.model) {
      setTestResult({ ok: false, message: '三项均为必填，填完后再测试' });
      return;
    }
    const controller = new AbortController();
    testAbortRef.current = controller;
    setTesting(true);
    setTestResult(null);
    try {
      await testLlmConnection(next, controller.signal);
      setTestResult({ ok: true, message: '连接正常' });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : '连接测试失败，请检查配置',
      });
    } finally {
      if (testAbortRef.current === controller) testAbortRef.current = null;
      setTesting(false);
    }
  };

  const handleSave = () => {
    const next = { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() };
    if (!next.baseUrl || !next.apiKey || !next.model) {
      setError('三项均为必填，且都非空才算配置完成');
      return;
    }
    saveLlmConfig(next);
    showToast('success', 'LLM 配置已保存（仅存本机浏览器）');
    onSaved?.();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="LLM 配置" size="sm">
      <div className="vocab-llm">
        <div className="vocab-llm__field">
          <label className="vocab-llm__label" htmlFor="vocab-llm-base-url">
            接口地址 baseURL
          </label>
          <input
            id="vocab-llm-base-url"
            className="vocab-field"
            type="text"
            value={baseUrl}
            onChange={(e) => { setBaseUrl(e.target.value); setTestResult(null); }}
            placeholder={PLACEHOLDER.baseUrl}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="vocab-llm__field">
          <label className="vocab-llm__label" htmlFor="vocab-llm-api-key">
            API Key
          </label>
          <input
            id="vocab-llm-api-key"
            className="vocab-field"
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
            placeholder={PLACEHOLDER.apiKey}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="vocab-llm__field">
          <label className="vocab-llm__label" htmlFor="vocab-llm-model">
            模型
          </label>
          <input
            id="vocab-llm-model"
            className="vocab-field"
            type="text"
            value={model}
            onChange={(e) => { setModel(e.target.value); setTestResult(null); }}
            placeholder={PLACEHOLDER.model}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {error && (
          <p className="vocab-llm__error" role="alert">
            {error}
          </p>
        )}

        <p className="vocab-llm__hint">
          配置仅保存在本机浏览器（localStorage），不会进入备份、不会上传服务器。
          需要服务商允许浏览器直连（CORS）。
        </p>

        <div className="vocab-llm__test">
          <Button variant="glass" loading={testing} onClick={() => { void handleTest(); }}>
            测试连接
          </Button>
          {testResult && (
            <span
              className={
                testResult.ok
                  ? 'vocab-llm__test-result vocab-llm__test-result--ok'
                  : 'vocab-llm__test-result vocab-llm__test-result--error'
              }
              role="status"
            >
              {testResult.message}
            </span>
          )}
        </div>

        <div className="vocab-llm__actions">
          <Button variant="glass" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
}
