import {
  editTask,
  lockProblems,
  minutesOf,
  newTask,
  removeTask,
  taskProblems,
} from '@/lib/plan-draft';
import { sampleToday } from './support/fakes';

const tasks = sampleToday().plan!.tasks;
const [first, second] = tasks as [(typeof tasks)[number], (typeof tasks)[number]];
const skill = { id: '01920000-0000-7000-8000-00000000b001', verifier: 'reading' as const };

test('editTask changes one task immutably and converts minutes to seconds', () => {
  const edited = editTask(tasks, first.id, { title: 'Decimals', minutes: 45, when: 'after lunch' });
  expect(edited[0]).toMatchObject({
    when: 'after lunch',
    full: { title: 'Decimals', seconds: 2700 },
  });
  expect(edited[1]).toBe(second);
  expect(tasks[0]!.full.title).toBe('Fractions practice');
  expect(minutesOf(edited[0]!)).toBe(45);
});

test('the smallest version keeps its own criteria unless it mirrored the title', () => {
  const blank = newTask(skill, 'id-new');
  const named = editTask([blank], 'id-new', { smallTitle: 'Read one page' })[0]!;
  expect(named.twoMinute).toEqual({
    title: 'Read one page',
    criteria: 'Read one page',
    seconds: 120,
  });
  const kept = editTask(tasks, first.id, { smallTitle: 'Two problems' })[0]!;
  expect(kept.twoMinute.criteria).toBe('Solve one problem');
});

test('a new task uses the skill and its verifier and starts empty', () => {
  expect(newTask(skill, 'id-new')).toEqual({
    id: 'id-new',
    skillId: skill.id,
    verifier: 'reading',
    when: '',
    full: { title: '', criteria: '', seconds: 1800 },
    twoMinute: { title: '', criteria: '', seconds: 120 },
  });
});

test('removeTask drops one task', () => {
  expect(removeTask(tasks, first.id)).toEqual([second]);
});

test('taskProblems name each empty or out-of-range field', () => {
  const bad = editTask([newTask(skill, 'n1')], 'n1', { minutes: 3 });
  expect(taskProblems(bad).map((p) => p.message)).toEqual([
    'Give the task a title.',
    'Say how you will know it is done.',
    'Say when you will do it.',
    'Minutes must be 5 to 120.',
    'Give the 2-minute version a title.',
  ]);
  expect(taskProblems(editTask(tasks, first.id, { minutes: 121 }))).toEqual([
    { taskId: first.id, message: 'Minutes must be 5 to 120.' },
  ]);
  expect(taskProblems(tasks)).toEqual([]);
});

test('lockProblems add the 3-to-5 task rule', () => {
  expect(lockProblems(tasks)).toEqual([
    { taskId: null, message: 'A plan needs 3 to 5 tasks to lock.' },
  ]);
  const three = [...tasks, { ...first, id: 'x3' }];
  expect(lockProblems(three)).toEqual([]);
  const six = [...three, { ...first, id: 'x4' }, { ...first, id: 'x5' }, { ...first, id: 'x6' }];
  expect(lockProblems(six)).toHaveLength(1);
});

test('minutes are rounded to whole numbers', () => {
  expect(minutesOf(editTask(tasks, first.id, { minutes: 12.6 })[0]!)).toBe(13);
});
