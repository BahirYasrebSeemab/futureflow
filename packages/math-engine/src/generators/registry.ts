import type { Generator } from '../types';
import { fractionsGenerator } from './fractions';
import { integersGenerator } from './integers';
import { orderOfOperationsGenerator } from './order-of-operations';

export type GeneratorRegistry = ReadonlyMap<string, Generator>;

export function createRegistry(generators: readonly Generator[]): GeneratorRegistry {
  const ids = generators.map((g) => g.topicId);
  if (new Set(ids).size !== ids.length) throw new Error('two generators for one topic');
  return new Map(generators.map((g) => [g.topicId, g]));
}

export const DEFAULT_REGISTRY: GeneratorRegistry = createRegistry([
  integersGenerator,
  fractionsGenerator,
  orderOfOperationsGenerator,
]);
