import type { Skill } from '@futureflow/contracts';
import { addDays, type TaskSpec } from '@futureflow/core';
import { useCallback, useEffect, useState } from 'react';
import type { ApiFailure, ApiResult, Plan } from '@/lib/api/client';
import { useApp } from '@/lib/app';
import { editTask, newTask, removeTask, type TaskEdit } from '@/lib/plan-draft';

export type PlanTarget = 'today' | 'tomorrow';
type Source = 'ai' | 'template' | null;

type State = Readonly<{
  day: string | null;
  loading: boolean;
  busy: boolean;
  saved: Plan | null;
  tasks: TaskSpec[];
  source: Source;
  message: string | null;
  skills: Skill[];
}>;

const INITIAL: State = {
  day: null,
  loading: true,
  busy: false,
  saved: null,
  tasks: [],
  source: null,
  message: null,
  skills: [],
};

const REFUSALS: Readonly<Record<string, string>> = {
  nothing_to_plan: 'Add skills to your roadmap first.',
  plan_locked: 'This plan is already locked.',
  too_few_tasks: 'A plan needs 3 to 5 tasks to lock.',
  too_many_tasks: 'A plan needs 3 to 5 tasks to lock.',
  day_out_of_range: 'You can only plan today or tomorrow.',
};

export function planMessage(error: ApiFailure): string {
  switch (error.kind) {
    case 'network':
      return 'Planning needs a connection.';
    case 'invalid_response':
      return 'This app is out of date for the server. Update the app.';
    case 'server':
      return 'The server had a problem. Try again soon.';
    case 'rejected':
      return REFUSALS[error.code] ?? error.message;
  }
}

const sameTasks = (a: readonly TaskSpec[], b: readonly TaskSpec[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Today's or tomorrow's plan: local edits until Save; Lock saves first. Online only. */
export function usePlan() {
  const { services } = useApp();
  const [target, setTarget] = useState<PlanTarget>('today');
  const [state, setState] = useState<State>(INITIAL);

  const load = useCallback(
    async (which: PlanTarget) => {
      setState((s) => ({ ...s, loading: true, message: null }));
      try {
        const snapshot = await services.store.savedToday();
        if (snapshot === null) {
          const message = 'Open Today once, online, before planning.';
          setState((s) => ({ ...s, loading: false, day: null, message }));
          return;
        }
        const day = which === 'today' ? snapshot.today.day : addDays(snapshot.today.day, 1);
        const [plan, roadmap] = await Promise.all([
          services.api.getPlan(day),
          services.api.getRoadmap(),
        ]);
        const saved = plan.ok ? plan.data : null;
        setState((s) => ({
          ...s,
          day,
          loading: false,
          saved,
          tasks: saved?.tasks ?? [],
          source: null,
          skills: roadmap.ok ? (roadmap.data?.skills ?? []) : s.skills,
          message: plan.ok ? null : planMessage(plan.error),
        }));
      } catch {
        const message = "Could not read this phone's saved data.";
        setState((s) => ({ ...s, loading: false, message }));
      }
    },
    [services],
  );

  useEffect(() => {
    void load(target);
  }, [load, target]);

  /** One server call with the busy flag; returns the plan on success, null on failure. */
  const run = useCallback(async (call: () => Promise<ApiResult<Plan>>): Promise<Plan | null> => {
    setState((s) => ({ ...s, busy: true, message: null }));
    try {
      const result = await call();
      if (!result.ok) {
        setState((s) => ({ ...s, message: planMessage(result.error) }));
        return null;
      }
      setState((s) => ({ ...s, saved: result.data, tasks: result.data.tasks }));
      return result.data;
    } finally {
      setState((s) => ({ ...s, busy: false }));
    }
  }, []);

  const { day, saved, tasks } = state;
  const dirty = saved === null ? tasks.length > 0 : !sameTasks(saved.tasks, tasks);

  const propose = async () => {
    if (day === null) return;
    setState((s) => ({ ...s, busy: true, message: null }));
    try {
      const result = await services.api.proposePlan(day);
      if (!result.ok) {
        setState((s) => ({ ...s, message: planMessage(result.error) }));
        return;
      }
      const { plan, source } = result.data;
      setState((s) => ({ ...s, saved: plan, tasks: plan.tasks, source }));
    } finally {
      setState((s) => ({ ...s, busy: false }));
    }
  };

  const save = async () => {
    if (day !== null) await run(() => services.api.savePlan(day, tasks));
  };

  const lock = async () => {
    if (day === null) return;
    if (dirty && (await run(() => services.api.savePlan(day, tasks))) === null) return;
    await run(() => services.api.lockPlan(day));
  };

  return {
    ...state,
    target,
    dirty,
    /** Ignored while there are unsaved edits. */
    setTarget: (next: PlanTarget) => {
      if (!dirty) setTarget(next);
    },
    edit: (id: string, edit: TaskEdit) =>
      setState((s) => ({ ...s, tasks: editTask(s.tasks, id, edit) })),
    remove: (id: string) => setState((s) => ({ ...s, tasks: removeTask(s.tasks, id) })),
    add: (skill: Skill) =>
      setState((s) => ({ ...s, tasks: [...s.tasks, newTask(skill, services.ids.newId())] })),
    discard: () => setState((s) => ({ ...s, tasks: s.saved?.tasks ?? [] })),
    propose,
    save,
    lock,
  };
}
