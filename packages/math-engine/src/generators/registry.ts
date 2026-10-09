import type { Generator } from '../types';
import { analyticGeometryGenerator } from './analytic-geometry';
import { linearSystemsGenerator } from './linear-systems';
import { quadraticRelationsGenerator } from './quadratic-relations';
import { quadraticEquationsGenerator } from './quadratic-equations';
import { factoringGenerator } from './factoring';
import { polynomialOperationsGenerator } from './polynomial-operations';
import { financialLiteracyGenerator } from './financial-literacy';
import { dataAndStatisticsGenerator } from './data-and-statistics';
import { measurementAndGeometryGenerator } from './measurement-and-geometry';
import { exponentLawsGenerator } from './exponent-laws';
import { linearRelationsGenerator } from './linear-relations';
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
  linearRelationsGenerator,
  exponentLawsGenerator,
  measurementAndGeometryGenerator,
  dataAndStatisticsGenerator,
  financialLiteracyGenerator,
  polynomialOperationsGenerator,
  factoringGenerator,
  quadraticEquationsGenerator,
  quadraticRelationsGenerator,
  linearSystemsGenerator,
  analyticGeometryGenerator,
]);
