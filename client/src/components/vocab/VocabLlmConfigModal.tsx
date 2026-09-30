/**
 * LLM 配置弹窗（spec §3.1）：baseUrl / apiKey（密码遮罩）/ model 三输入。
 * 配置存 localStorage（设备级，key 见 utils/vocabLlm.ts），不进备份、不上传服务器；
 * 三字段均非空才算「已配置」——此处保存前同样按该口径校验。
 */
import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { loadLlmConfig, saveLlmConfig } from '../../utils/vocabLlm';

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

  /* 每次打开回显已存配置（apiKey 以密码型输入框遮罩） */
  useEffect(() => {
    if (!isOpen) return;
    const config = loadLlmConfig();
    setBaseUrl(config?.baseUrl ?? '');
    setApiKey(config?.apiKey ?? '');
    setModel(config?.model ?? '');
    setError(null);
  }, [isOpen]);

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
            onChange={(e) => setBaseUrl(e.target.value)}
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
            onChange={(e) => setApiKey(e.target.value)}
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
            onChange={(e) => setModel(e.target.value)}
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
