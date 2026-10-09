import { err, ok, type Result } from '@mflow/core';
import type { Topic } from './types';

/** Topics in teaching order; every prerequisite appears earlier (so the graph is acyclic). */
export type KnowledgeGraph = Readonly<{ topics: readonly Topic[] }>;

export type GraphError = 'duplicate_topic' | 'unknown_prerequisite' | 'prerequisite_out_of_order';

export function validateGraph(graph: KnowledgeGraph): Result<KnowledgeGraph, GraphError> {
  const all = new Set(graph.topics.map((topic) => topic.id));
  if (all.size !== graph.topics.length) return err('duplicate_topic');
  const seen = new Set<string>();
  for (const topic of graph.topics) {
    for (const prerequisite of topic.prerequisites) {
      if (!all.has(prerequisite)) return err('unknown_prerequisite');
      if (!seen.has(prerequisite)) return err('prerequisite_out_of_order');
    }
    seen.add(topic.id);
  }
  return ok(graph);
}

export function isUnlocked(
  graph: KnowledgeGraph,
  topicId: string,
  mastered: ReadonlySet<string>,
): boolean {
  const topic = graph.topics.find((t) => t.id === topicId);
  return topic !== undefined && topic.prerequisites.every((p) => mastered.has(p));
}

export const frontier = (graph: KnowledgeGraph, mastered: ReadonlySet<string>): Topic[] =>
  graph.topics.filter((t) => !mastered.has(t.id) && t.prerequisites.every((p) => mastered.has(p)));
