import type { Generator } from '../types';
import { linearInequalitiesGenerator } from './linear-inequalities';
import { exponentsAndRootsGenerator } from './exponents-and-roots';
import { ratiosAndRatesGenerator } from './ratios-and-rates';
import { percentsGenerator } from './percents';
import { decimalsGenerator } from './decimals';
import { factorsAndMultiplesGenerator } from './factors-and-multiples';
import { wholeNumberOperationsGenerator } from './whole-number-operations';
import { algebraicExpressionsGenerator } from './algebraic-expressions';
import { fractionsGenerator } from './fractions';
import { integersGenerator } from './integers';
import { linearEquationsGenerator } from './linear-equations';
import { orderOfOperationsGenerator } from './order-of-operations';

export type GeneratorRegistry = ReadonlyMap<string, Generator>;

export function createRegistry(generators: readonly Generator[]): GeneratorRegistry {
  const ids = generators.map((g) => g.topicId);
  if (new Set(ids).size !== ids.length) throw new Error('two generators for one topic');
  return new Map(generators.map((g) => [g.topicId, g]));
}

export const DEFAULT_REGISTRY: GeneratorRegistry = createRegistry([
  wholeNumberOperationsGenerator,
  integersGenerator,
  fractionsGenerator,
  decimalsGenerator,
  percentsGenerator,
  ratiosAndRatesGenerator,
  exponentsAndRootsGenerator,
  orderOfOperationsGenerator,
  factorsAndMultiplesGenerator,
  algebraicExpressionsGenerator,
  linearEquationsGenerator,
  linearInequalitiesGenerator,
]);
