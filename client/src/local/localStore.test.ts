import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from './db';
import {
  createLocalAccount,
  deleteLocalAccount,
  findLocalAccountByEmail,
  getActiveLocalAccount,
  listLocalAccounts,
  setActiveLocalAccount,
} from './accounts';
import { setLocalContext, setLocalMode } from './mode';
import { localStore } from './localStore';
import type { LocalAccount } from './types';

async function activate(email = 'user@example.com'): Promise<LocalAccount> {
  const account = await createLocalAccount(email);
  setActiveLocalAccount(account);
  return account;
}

const createTask = (input: { date: string; content: string; subject: 'math' | 'english' | '408' }) =>
  localStore.tasks.create({ ...input, isImportant: false });

function backupFile(overrides: {
  email?: string;
  tasks?: import('@shared/types').BackupFile['data']['tasks'];
  presets?: import('@shared/types').BackupFile['data']['presets'];
  reviews?: import('@shared/types').BackupFile['data']['reviews'];
  settings?: import('@shared/types').BackupFile['data']['settings'];
} = {}): import('@shared/types').BackupFile {
  const base = {
    id: 't1',
    taskDate: '2026-08-17',
    content: '导入任务',
    subject: 'math',
    subSubject: null,
    isCompleted: false,
    isImportant: false,
    sortOrder: 0,
    createdAt: '2026-08-01 00:00:00',
    updatedAt: '2026-08-01 00:00:00',
  };
  return {
    format: 'kaoyandaily-backup',
    schemaVersion: 1,
    exportedAt: '2026-08-17T00:00:00.000Z',
    account: { email: overrides.email ?? 'user@example.com', passwordHash: 'x', createdAt: '2026-08-01 00:00:00' },
    data: {
      presets: overrides.presets ?? [],
      tasks: overrides.tasks ?? [base],
      reviews: overrides.reviews ?? [],
      courses: [],
      episodes: [],
      focusSessions: [],
      studyRecords: [],
      settings: overrides.settings ?? [],
    },
  };
}

describe('账户管理', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('创建 / 列表 / 邮箱查重（大小写不敏感）', async () => {
    await createLocalAccount('User@Example.com');
    const list = await listLocalAccounts();
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe('user@example.com');
    expect(await findLocalAccountByEmail('USER@example.com')).not.toBeNull();
    await expect(createLocalAccount('user@example.com')).rejects.toThrow('已存在');
  });

  it('激活账户写入 localStorage 并切换本地模式', async () => {
    const account = await activate();
    expect(getActiveLocalAccount()).toEqual(account);
    expect(localStore.settings.get).toBeDefined();
    setActiveLocalAccount(null);
    expect(getActiveLocalAccount()).toBeNull();
    expect(localStore.settings.get).toBeDefined();
    setLocalMode(false);
  });

  it('删除账户级联清空全部业务数据', async () => {
    const account = await activate();
    await createTask({ date: '2026-08-17', content: 'x', subject: 'math' });
    await localStore.settings.update({ pomodoroSoundEnabled: false });
    await deleteLocalAccount(account.accountId);
    expect(await listLocalAccounts()).toHaveLength(0);
    expect(getActiveLocalAccount()).toBeNull();
    setLocalMode(false);
  });
});

describe('tasks', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
    await activate('tasks@example.com');
  });

  it('create 排序号 = 当日 max+1，返回不含 accountId', async () => {
    const t1 = await createTask({ date: '2026-08-17', content: 'a', subject: 'math' });
    const t2 = await createTask({ date: '2026-08-17', content: 'b', subject: 'english' });
    const t3 = await createTask({ date: '2026-08-18', content: 'c', subject: '408' });
    expect(t1.sortOrder).toBe(0);
    expect(t2.sortOrder).toBe(1);
    expect(t3.sortOrder).toBe(0);
    expect(t1).not.toHaveProperty('accountId');
  });

  it('getByDate 置顶优先、sortOrder 升序；toggle/pin/update', async () => {
    const t1 = await createTask({ date: '2026-08-17', content: 'a', subject: 'math' });
    await createTask({ date: '2026-08-17', content: 'b', subject: 'math' });
    const pinned = await localStore.tasks.pin(t1.id);
    expect(pinned.isImportant).toBe(true);
    let list = await localStore.tasks.getByDate('2026-08-17');
    expect(list.map((t) => t.content)).toEqual(['a', 'b']);

    const toggled = await localStore.tasks.toggle(t1.id);
    expect(toggled.isCompleted).toBe(true);
    list = await localStore.tasks.getByDate('2026-08-17');
    expect(list[0].isCompleted).toBe(true);
    expect(await localStore.tasks.getUnfinished('2026-08-17')).toHaveLength(1);

    const updated = await localStore.tasks.update(t1.id, { content: 'a2' });
    expect(updated.content).toBe('a2');
  });

  it('reorder 按 id 批量更新', async () => {
    const t1 = await createTask({ date: '2026-08-17', content: 'a', subject: 'math' });
    const t2 = await createTask({ date: '2026-08-17', content: 'b', subject: 'math' });
    await localStore.tasks.reorder({
      date: '2026-08-17',
      items: [
        { id: t1.id, sortOrder: 1, isImportant: false },
        { id: t2.id, sortOrder: 0, isImportant: false },
      ],
    });
    const list = await localStore.tasks.getByDate('2026-08-17');
    expect(list.map((t) => t.content)).toEqual(['b', 'a']);
  });

  it('delete / 账户隔离', async () => {
    const t1 = await createTask({ date: '2026-08-17', content: 'a', subject: 'math' });
    await localStore.tasks.delete(t1.id);
    expect(await localStore.tasks.getByDate('2026-08-17')).toHaveLength(0);
    await expect(localStore.tasks.delete(t1.id)).rejects.toThrow('不存在');

    await createTask({ date: '2026-08-17', content: 'b', subject: 'math' });
    await activate('other@example.com');
    expect(await localStore.tasks.getByDate('2026-08-17')).toHaveLength(0);
  });
});

describe('presets', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
    await activate('presets@example.com');
  });

  it('create/getAll（createdAt 倒序）/update/delete', async () => {
    vi.setSystemTime(new Date('2026-08-17T10:00:00'));
    const p1 = await localStore.presets.create({ name: '数学', subject: 'math', durationMinutes: 25 });
    vi.setSystemTime(new Date('2026-08-17T11:00:00'));
    const p2 = await localStore.presets.create({ name: '英语', subject: 'english', durationMinutes: 50 });
    let all = await localStore.presets.getAll();
    expect(all.map((p) => p.name)).toEqual(['英语', '数学']);

    const updated = await localStore.presets.update(p1.id, { durationMinutes: 30 });
    expect(updated.durationMinutes).toBe(30);
    await localStore.presets.delete(p1.id);
    all = await localStore.presets.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(p2.id);
    expect(all[0]).not.toHaveProperty('accountId');
  });
});

describe('reviews', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
    await activate('reviews@example.com');
  });

  it('upsert 按 (accountId, reviewDate) 唯一', async () => {
    const r1 = await localStore.reviews.upsert({ date: '2026-08-17', content: '第一天' });
    const r2 = await localStore.reviews.upsert({ date: '2026-08-17', content: '第二天改' });
    expect(r2.content).toBe('第二天改');
    expect(r2.id).toBe(r1.id);
    expect((await localStore.reviews.getByDate('2026-08-17'))?.content).toBe('第二天改');
    expect(await localStore.reviews.getByDate('2026-08-18')).toBeNull();
  });

  it('getHistory 按日期倒序', async () => {
    await localStore.reviews.upsert({ date: '2026-08-16', content: 'x' });
    await localStore.reviews.upsert({ date: '2026-08-18', content: 'y' });
    const history = await localStore.reviews.getHistory();
    expect(history.map((r) => r.reviewDate)).toEqual(['2026-08-18', '2026-08-16']);
  });
});

describe('courses', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
    await activate('courses@example.com');
  });

  it('create 级联写集数；getAll 统计正确', async () => {
    const course = await localStore.courses.create({
      name: '数据结构',
      subject: '408',
      subSubject: 'data_structure',
      episodes: [
        { title: '第1集', durationSeconds: 1200, durationText: '20:00' },
        { title: '第2集', durationSeconds: 600, durationText: '10:00' },
      ],
    });
    expect(course.episodeCount).toBe(2);
    expect(course.completedEpisodeCount).toBe(0);

    const detail = await localStore.courses.getById(course.id);
    await localStore.courses.toggleEpisode(course.id, detail.episodes[0].id);
    const all = await localStore.courses.getAll();
    expect(all[0].completedEpisodeCount).toBe(1);
    expect(all[0].watchedDurationSeconds).toBe(1200);
    expect(all[0].lastStudiedEpisode).toBe('第1集');
    expect(all[0]).not.toHaveProperty('accountId');

    const detail2 = await localStore.courses.getById(course.id);
    expect(detail2.episodes).toHaveLength(2);
    expect(detail2.episodes[0].isCompleted).toBe(true);
    expect(detail2.episodes[0]).not.toHaveProperty('accountId');
  });

  it('toggleEpisode 打勾不写 studyRecords；再打勾取消', async () => {
    const course = await localStore.courses.create({
      name: '课程',
      subject: 'math',
      episodes: [{ title: 'e1', durationSeconds: 100, durationText: '01:40' }],
    });
    const detail = await localStore.courses.getById(course.id);
    await localStore.courses.toggleEpisode(course.id, detail.episodes[0].id);
    const heatmap = await localStore.statistics.getHeatmap();
    expect(heatmap.days).toHaveLength(0);
    const ep = await localStore.courses.toggleEpisode(course.id, detail.episodes[0].id);
    expect(ep.isCompleted).toBe(false);
  });

  it('delete 级联删集数', async () => {
    const course = await localStore.courses.create({
      name: '课程',
      subject: 'math',
      episodes: [{ title: 'e1', durationSeconds: 100, durationText: '01:40' }],
    });
    await localStore.courses.delete(course.id);
    await expect(localStore.courses.getById(course.id)).rejects.toThrow('不存在');
  });

  it('parse 解析课程文本', async () => {
    const res = await localStore.courses.parse({ rawText: '第1集 20:00\n第2集 10:30', subject: 'math' });
    expect(res.episodes).toHaveLength(2);
    expect(res.episodes[0].title).toBe('第1集');
  });
});

describe('focus', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
    await activate('focus@example.com');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start 快照预设并更新 lastUsedAt；complete 写会话+学习记录', async () => {
    vi.setSystemTime(new Date('2026-08-17T10:00:00'));
    const preset = await localStore.presets.create({ name: '数学25', subject: 'math', durationMinutes: 25 });
    const session = await localStore.focus.start({ presetId: preset.id, plannedDurationMinutes: 25, source: 'pomodoro' });
    expect(session.subjectSnapshot).toBe('math');
    expect(session.plannedDurationSeconds).toBe(1500);
    const presets = await localStore.presets.getAll();
    expect(presets[0].lastUsedAt).toBe('2026-08-17 10:00:00');

    vi.setSystemTime(new Date('2026-08-17T10:25:00'));
    await localStore.focus.complete(session.id);
    expect(await localStore.focus.getActive()).toBeNull();

    const forest = await localStore.statistics.getForest('day', '2026-08-17');
    expect(forest.period.totalFocusSeconds).toBe(1500);
    expect(forest.period.totalCompletedSessions).toBe(1);
    expect(forest.period.treesBySubject.math).toBe(0);

    await expect(localStore.focus.complete(session.id)).rejects.toThrow('已结束');
  });

  it('cancel 置 cancelled；不产生学习记录', async () => {
    const session = await localStore.focus.start({ plannedDurationMinutes: 25, source: 'plan' });
    await localStore.focus.cancel(session.id);
    expect(await localStore.focus.getActive()).toBeNull();
    const forest = await localStore.statistics.getForest('day', '2026-08-17');
    expect(forest.period.totalCompletedSessions).toBe(0);
    await expect(localStore.focus.cancel(session.id)).rejects.toThrow('没有可取消');
  });

  it('getActive 对过期会话自动完成', async () => {
    vi.setSystemTime(new Date('2026-08-17T10:00:00'));
    const session = await localStore.focus.start({ plannedDurationMinutes: 25, source: 'course' });
    vi.setSystemTime(new Date('2026-08-17T10:26:00'));
    expect(await localStore.focus.getActive()).toBeNull();
    const forest = await localStore.statistics.getForest('day', '2026-08-17');
    expect(forest.period.totalFocusSeconds).toBe(1500);
    expect(forest.period.totalCompletedSessions).toBe(1);
    expect(session.source).toBe('course');
  });

  it('start 校验预设/集数/任务存在性', async () => {
    await expect(localStore.focus.start({ presetId: 'missing', plannedDurationMinutes: 25, source: 'pomodoro' })).rejects.toThrow('预设不存在');
    await expect(localStore.focus.start({ courseEpisodeId: 'missing', plannedDurationMinutes: 25, source: 'course' })).rejects.toThrow('集数不存在');
    await expect(localStore.focus.start({ taskId: 'missing', plannedDurationMinutes: 25, source: 'plan' })).rejects.toThrow('任务不存在');
  });

  it('并发 getActive（过期自动完成）只写一条学习记录（原子性）', async () => {
    vi.setSystemTime(new Date('2026-08-17T10:00:00'));
    await localStore.focus.start({ plannedDurationMinutes: 25, source: 'pomodoro' });
    vi.setSystemTime(new Date('2026-08-17T10:26:00'));
    const results = await Promise.all([localStore.focus.getActive(), localStore.focus.getActive()]);
    expect(results).toEqual([null, null]);
    const forest = await localStore.statistics.getForest('day', '2026-08-17');
    expect(forest.period.totalCompletedSessions).toBe(1);
    expect(forest.period.totalFocusSeconds).toBe(1500);
  });

  it('并发 complete 只写一条学习记录（原子性）', async () => {
    vi.setSystemTime(new Date('2026-08-17T10:00:00'));
    const session = await localStore.focus.start({ plannedDurationMinutes: 25, source: 'pomodoro' });
    vi.setSystemTime(new Date('2026-08-17T10:25:00'));
    const results = await Promise.allSettled([
      localStore.focus.complete(session.id),
      localStore.focus.complete(session.id),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    const forest = await localStore.statistics.getForest('day', '2026-08-17');
    expect(forest.period.totalCompletedSessions).toBe(1);
  });
});

describe('settings', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
    await activate('settings@example.com');
  });

  it('默认开启；update 生效且按账户隔离', async () => {
    expect((await localStore.settings.get()).pomodoroSoundEnabled).toBe(true);
    expect((await localStore.settings.update({ pomodoroSoundEnabled: false })).pomodoroSoundEnabled).toBe(false);
    expect((await localStore.settings.get()).pomodoroSoundEnabled).toBe(false);

    await activate('other@example.com');
    expect((await localStore.settings.get()).pomodoroSoundEnabled).toBe(true);
  });
});

describe('statistics', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
    await activate('stats@example.com');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forest/heatmap/today 基于学习记录且按账户隔离', async () => {
    vi.setSystemTime(new Date('2026-08-17T09:00:00'));
    const s1 = await localStore.focus.start({ plannedDurationMinutes: 25, source: 'pomodoro' });
    vi.setSystemTime(new Date('2026-08-17T09:25:00'));
    await localStore.focus.complete(s1.id);

    const today = await localStore.statistics.getTodaySummary();
    expect(today.completedSessions).toBe(1);
    expect(today.totalSeconds).toBe(1500);

    const heatmap = await localStore.statistics.getHeatmap();
    expect(heatmap.days).toHaveLength(1);
    expect(heatmap.days[0].seconds).toBe(1500);

    await activate('other@example.com');
    expect((await localStore.statistics.getTodaySummary()).completedSessions).toBe(0);
    expect((await localStore.statistics.getHeatmap()).days).toHaveLength(0);
  });
});

describe('backup 导出 / 导入', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
  });

  it('exportBackup 导出当前账户全量（不含 accountId）', async () => {
    await activate('export@example.com');
    await createTask({ date: '2026-08-17', content: '任务', subject: 'math' });
    const file = await localStore.backup.exportBackup();
    expect(file.format).toBe('kaoyandaily-backup');
    expect(file.schemaVersion).toBe(1);
    expect(file.account.email).toBe('export@example.com');
    expect(file.account.passwordHash).toBe('local-mode-account');
    expect(file.data.tasks).toHaveLength(1);
    expect(file.data.tasks[0]).not.toHaveProperty('accountId');
  });

  it('previewImport：未激活时对空库对比；已激活给出双模式', async () => {
    await activate('preview@example.com');
    await createTask({ date: '2026-08-17', content: '已有', subject: 'math' });
    const file = backupFile({
      tasks: [
        { id: 't1', taskDate: '2026-08-17', content: '导入任务', subject: 'math', subSubject: null, isCompleted: false, isImportant: false, sortOrder: 0, createdAt: '2026-08-01 00:00:00', updatedAt: '2026-08-01 00:00:00' },
      ],
    });
    const preview = await localStore.backup.previewImport(file);
    expect(preview.modeOptions).toEqual(['overwrite', 'merge']);
    expect(preview.diff.tasks).toEqual({ added: 1, updated: 0, kept: 1 });
    expect(preview.existingAccount).toBe(true);
  });

  it('importData：未激活 → 建本地账户并自动激活', async () => {
    const file = backupFile();
    const result = await localStore.backup.importData(file);
    expect(result.email).toBe('user@example.com');
    expect(getActiveLocalAccount()?.email).toBe('user@example.com');
    const tasks = await localStore.tasks.getByDate('2026-08-17');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].content).toBe('导入任务');
    expect(tasks[0]).not.toHaveProperty('accountId');
  });

  it('importData：未激活 + 邮箱已占用 → 报错', async () => {
    await activate('user@example.com');
    setActiveLocalAccount(null);
    const file = backupFile({ email: 'user@example.com' });
    await expect(localStore.backup.importData(file)).rejects.toThrow('该邮箱已存在本地账户');
  });

  it('importData：已激活 + 邮箱不符 → 报错', async () => {
    await activate('me@example.com');
    const file = backupFile({ email: 'other@example.com' });
    await expect(localStore.backup.importData(file)).rejects.toThrow('其他账号');
  });

  it('importData：merge 模式先删冲突再插（同 id 不重复）', async () => {
    await activate('merge@example.com');
    await createTask({ date: '2026-08-17', content: '原有任务', subject: 'math' });
    const existing = await localStore.tasks.getByDate('2026-08-17');
    const file = backupFile({
      email: 'merge@example.com',
      tasks: [
        { ...existing[0], content: '导入覆盖版' },
        { id: 't-new', taskDate: '2026-08-17', content: '新任务', subject: 'english', subSubject: null, isCompleted: false, isImportant: false, sortOrder: 1, createdAt: '2026-08-01 00:00:00', updatedAt: '2026-08-01 00:00:00' },
      ],
    });
    await localStore.backup.importData(file, 'merge');
    const tasks = await localStore.tasks.getByDate('2026-08-17');
    expect(tasks).toHaveLength(2);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    expect(byId.get(existing[0].id)?.content).toBe('导入覆盖版');
    expect(byId.get('t-new')?.subject).toBe('english');
  });

  it('importData：overwrite 清空目标账户后写入', async () => {
    await activate('overwrite@example.com');
    await createTask({ date: '2026-08-17', content: '旧数据', subject: 'math' });
    const file = backupFile({ email: 'overwrite@example.com' });
    await localStore.backup.importData(file, 'overwrite');
    const tasks = await localStore.tasks.getByDate('2026-08-17');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].content).toBe('导入任务');
  });

  it('importData：reviews 按 id/日期冲突、settings 按 key 冲突合并', async () => {
    await activate('keys@example.com');
    await localStore.reviews.upsert({ date: '2026-08-17', content: '旧' });
    await localStore.settings.update({ pomodoroSoundEnabled: false });
    const file = backupFile({
      email: 'keys@example.com',
      reviews: [{ id: 'r-import', reviewDate: '2026-08-17', content: '新', createdAt: '2026-08-01 00:00:00', updatedAt: '2026-08-01 00:00:00' }],
      settings: [{ key: 'pomodoro_sound_enabled', value: '1' }],
    });
    await localStore.backup.importData(file, 'merge');
    expect((await localStore.reviews.getByDate('2026-08-17'))?.content).toBe('新');
    expect(await localStore.reviews.getHistory()).toHaveLength(1);
    expect((await localStore.settings.get()).pomodoroSoundEnabled).toBe(true);
  });
});