/**
 * LLM 配置弹窗（spec §3.1 / §13）：baseUrl / apiKey（密码遮罩）/ model 三输入 +
 * 「提示词」预设管理区。
 *
 * 配置存 localStorage（设备级，key 见 utils/vocabLlm.ts），不进备份、不上传服务器；
 * 三字段均非空才算「已配置」——此处保存前同样按该口径校验。
 *
 * 「测试连接」按当前输入值发一条最小对话（HTTP 2xx 即成功）：成功后绿色「连接正常」，
 * 失败按 LlmError.message 展示分类原因；关闭弹窗即中止在途请求。
 *
 * 「提示词」（spec §13）：契约骨架固定不可改，仅 extra 内容要求可自定义；
 * 预设列表首项常驻「默认」（activeId=null），选中即落 localStorage 立即生效；
 * 生效中的预设删除需确认，删除后回落默认；新建/编辑表单内嵌「提示词预览」
 * 折叠区展示 buildVocabSystemPrompt 全文。提示词区与「测试连接」互不影响。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import { showToast } from '../ui/Toast';
import {
  DEFAULT_EXTRA_REQUIREMENT,
  buildVocabSystemPrompt,
  loadLlmConfig,
  loadPromptStore,
  saveLlmConfig,
  savePromptStore,
  testLlmConnection,
  type VocabPromptPreset,
  type VocabPromptStore,
} from '../../utils/vocabLlm';
import { generateUUID } from '../../utils/uuid';

interface VocabLlmConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 保存成功回调（父级刷新「已配置/未配置」状态） */
  onSaved?: () => void;
}

/** 新建/编辑表单态（id=null 表示新建） */
interface PromptEditor {
  id: string | null;
  name: string;
  extraRequirement: string;
}

const PLACEHOLDER = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-…',
  model: 'deepseek-chat',
};

const EMPTY_STORE: VocabPromptStore = { presets: [], activeId: null };

export function VocabLlmConfigModal({ isOpen, onClose, onSaved }: VocabLlmConfigModalProps) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);

  /* 提示词预设（spec §13.3）：打开时读 localStorage，选中/保存即写回 */
  const [store, setStore] = useState<VocabPromptStore>(EMPTY_STORE);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [editor, setEditor] = useState<PromptEditor | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VocabPromptPreset | null>(null);

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
      setStore(loadPromptStore());
      setPromptsOpen(false);
      setEditor(null);
      setPreviewOpen(false);
      setDeleteTarget(null);
      return;
    }
    testAbortRef.current?.abort();
    testAbortRef.current = null;
    setTesting(false);
    setTestResult(null);
  }, [isOpen]);

  /* ---- 提示词预设管理 ---- */

  /** 写回并同步本地状态；localStorage 写入失败（配额/隐私模式）不吞异常，改为 Toast 提示 */
  const persistPromptStore = (next: VocabPromptStore) => {
    try {
      savePromptStore(next);
    } catch {
      showToast('error', '提示词保存失败：浏览器存储不可用');
      return;
    }
    setStore(next);
  };

  const activePreset = useMemo(
    () => store.presets.find((preset) => preset.id === store.activeId) ?? null,
    [store]
  );

  const handleSelectPreset = (preset: VocabPromptPreset | null) => {
    const id = preset?.id ?? null;
    if (id === store.activeId) return;
    persistPromptStore({ ...store, activeId: id });
    showToast('success', preset ? `已切换提示词：${preset.name}` : '已切换提示词：默认');
  };

  const removePreset = (preset: VocabPromptPreset) => {
    persistPromptStore({
      presets: store.presets.filter((item) => item.id !== preset.id),
      activeId: store.activeId === preset.id ? null : store.activeId,
    });
    if (editor?.id === preset.id) setEditor(null);
    showToast('success', `已删除提示词：${preset.name}`);
  };

  /** 生效中的预设删除后回落默认，先确认；非生效预设直接删除 */
  const handleDeletePreset = (preset: VocabPromptPreset) => {
    if (store.activeId === preset.id) setDeleteTarget(preset);
    else removePreset(preset);
  };

  const openNewEditor = () => {
    setEditor({ id: null, name: '', extraRequirement: '' });
    setPreviewOpen(false);
  };

  const openEditEditor = (preset: VocabPromptPreset) => {
    setEditor({ id: preset.id, name: preset.name, extraRequirement: preset.extraRequirement });
    setPreviewOpen(false);
  };

  const handleApplyEditor = () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) return;
    const extraRequirement = editor.extraRequirement.trim();
    if (editor.id) {
      persistPromptStore({
        ...store,
        presets: store.presets.map((preset) =>
          preset.id === editor.id ? { ...preset, name, extraRequirement } : preset
        ),
      });
      showToast('success', `提示词已更新：${name}`);
    } else {
      const preset: VocabPromptPreset = { id: generateUUID(), name, extraRequirement };
      /* 新建后立即选中：用户的意图就是马上用上这条预设 */
      persistPromptStore({ presets: [...store.presets, preset], activeId: preset.id });
      showToast('success', `提示词已保存并启用：${name}`);
    }
    setEditor(null);
    setPreviewOpen(false);
  };

  /** 预览：编辑中的 extra 要求实时构建全文（契约骨架只读，让用户看到不可改） */
  const promptPreview = useMemo(
    () => buildVocabSystemPrompt(editor?.extraRequirement),
    [editor?.extraRequirement]
  );

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

        {/* 提示词预设区（spec §13）：折叠收纳，不参与「测试连接」 */}
        <div className="vocab-llm__prompts">
          <button
            type="button"
            className="vocab-llm__prompts-toggle"
            aria-expanded={promptsOpen}
            onClick={() => setPromptsOpen((prev) => !prev)}
          >
            <span className="vocab-llm__prompts-title">提示词</span>
            <span className="vocab-llm__prompts-current">当前：{activePreset?.name ?? '默认'}</span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className={
                promptsOpen ? 'vocab-llm__chevron vocab-llm__chevron--open' : 'vocab-llm__chevron'
              }
            />
          </button>

          {promptsOpen && (
            <div className="vocab-llm__prompts-body">
              <p className="vocab-llm__hint">
                提示词契约骨架（JSON 结构 / 数量 / 格式要求）固定不可改，仅 extra 拓展内容的要求可自定义。
                预设仅存本机浏览器，不进备份。
              </p>

              <div className="vocab-llm__prompt-list" role="radiogroup" aria-label="提示词预设">
                <div
                  className={
                    store.activeId === null
                      ? 'vocab-llm__prompt-item vocab-llm__prompt-item--active'
                      : 'vocab-llm__prompt-item'
                  }
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={store.activeId === null}
                    className="vocab-llm__prompt-choice"
                    onClick={() => handleSelectPreset(null)}
                  >
                    <span className="vocab-llm__prompt-radio" aria-hidden="true" />
                    <span className="vocab-llm__prompt-name">默认</span>
                    <span className="vocab-llm__prompt-desc">{DEFAULT_EXTRA_REQUIREMENT}</span>
                  </button>
                </div>

                {store.presets.map((preset) => (
                  <div
                    key={preset.id}
                    className={
                      store.activeId === preset.id
                        ? 'vocab-llm__prompt-item vocab-llm__prompt-item--active'
                        : 'vocab-llm__prompt-item'
                    }
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={store.activeId === preset.id}
                      className="vocab-llm__prompt-choice"
                      onClick={() => handleSelectPreset(preset)}
                    >
                      <span className="vocab-llm__prompt-radio" aria-hidden="true" />
                      <span className="vocab-llm__prompt-name">{preset.name}</span>
                      <span className="vocab-llm__prompt-desc">
                        {preset.extraRequirement || DEFAULT_EXTRA_REQUIREMENT}
                      </span>
                    </button>
                    <div className="vocab-llm__prompt-actions">
                      <button
                        type="button"
                        className="vocab-llm__prompt-action"
                        onClick={() => openEditEditor(preset)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="vocab-llm__prompt-action vocab-llm__prompt-action--danger"
                        onClick={() => handleDeletePreset(preset)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {store.presets.length === 0 && (
                <p className="vocab-llm__prompts-empty">还没有自定义预设，当前使用默认提示词。</p>
              )}

              {editor === null ? (
                <Button size="sm" variant="glass" onClick={openNewEditor}>
                  新建预设
                </Button>
              ) : (
                <div className="vocab-llm__prompt-form">
                  <div className="vocab-llm__field">
                    <label className="vocab-llm__label" htmlFor="vocab-prompt-name">
                      预设名称（必填，最多 30 字）
                    </label>
                    <input
                      id="vocab-prompt-name"
                      className="vocab-field"
                      type="text"
                      value={editor.name}
                      maxLength={30}
                      onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                      placeholder="如：只讲词根"
                      autoComplete="off"
                    />
                  </div>

                  <div className="vocab-llm__field">
                    <label className="vocab-llm__label" htmlFor="vocab-prompt-extra">
                      extra 拓展内容的要求（留空 = 使用默认）
                    </label>
                    <textarea
                      id="vocab-prompt-extra"
                      className="vocab-field vocab-llm__prompt-textarea"
                      rows={3}
                      maxLength={2000}
                      value={editor.extraRequirement}
                      onChange={(e) => setEditor({ ...editor, extraRequirement: e.target.value })}
                      placeholder={`留空使用默认：${DEFAULT_EXTRA_REQUIREMENT}`}
                    />
                  </div>

                  <button
                    type="button"
                    className="vocab-llm__preview-toggle"
                    aria-expanded={previewOpen}
                    onClick={() => setPreviewOpen((prev) => !prev)}
                  >
                    提示词预览（契约骨架固定，不可编辑）
                    <ChevronDown
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className={
                        previewOpen ? 'vocab-llm__chevron vocab-llm__chevron--open' : 'vocab-llm__chevron'
                      }
                    />
                  </button>
                  {previewOpen && <pre className="vocab-llm__preview">{promptPreview}</pre>}

                  <div className="vocab-llm__prompt-form-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditor(null); setPreviewOpen(false); }}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!editor.name.trim()}
                      onClick={handleApplyEditor}
                    >
                      保存预设
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
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

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) removePreset(deleteTarget); }}
        title="删除提示词预设"
        message={`删除「${deleteTarget?.name ?? ''}」？`}
        detail="该预设正在生效，删除后将回落「默认」提示词。"
        confirmLabel="删除"
      />
    </Modal>
  );
}
