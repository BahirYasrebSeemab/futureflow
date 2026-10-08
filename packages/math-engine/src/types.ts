import type { Answer } from './check';

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5];

export type LevelId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export type Topic = Readonly<{
  id: string;
  level: LevelId;
  title: string;
  prerequisites: readonly string[];
}>;

export type Gate = Readonly<{
  id: 'A' | 'B1' | 'B2' | 'B3';
  level: LevelId;
  minScore: number;
  requiredPasses: number;
}>;

export type Problem = Readonly<{
  topicId: string;
  seed: number;
  difficulty: Difficulty;
  prompt: string;
  answer: Answer;
  hints: readonly string[];
  steps: readonly string[];
}>;

export type Generator = Readonly<{
  topicId: string;
  generate: (seed: number, difficulty: Difficulty) => Problem;
}>;
