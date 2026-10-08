import type { KnowledgeGraph } from './graph';
import type { Gate, LevelId, Topic } from './types';

const topic = (id: string, level: LevelId, title: string, prerequisites: string[] = []): Topic => ({
  id,
  level,
  title,
  prerequisites,
});

/** Arithmetic → Grade 9 (MTH1W) → Grade 10 (MPM2D). L3–L5 are added in P7. */
export const ONTARIO_GRAPH: KnowledgeGraph = {
  topics: [
    // L0 — arithmetic foundations
    topic('whole-number-operations', 'L0', 'Whole-number operations'),
    topic('integers', 'L0', 'Integers (negative numbers)', ['whole-number-operations']),
    topic('order-of-operations', 'L0', 'Order of operations', ['integers']),
    topic('factors-and-multiples', 'L0', 'Factors, multiples, primes', ['whole-number-operations']),
    topic('fractions', 'L0', 'Fractions', ['factors-and-multiples', 'integers']),
    topic('decimals', 'L0', 'Decimals', ['fractions']),
    topic('percents', 'L0', 'Percents', ['decimals']),
    topic('ratios-and-rates', 'L0', 'Ratios, rates, proportions', ['fractions']),
    topic('exponents-and-roots', 'L0', 'Exponents and square roots', ['order-of-operations']),
    // L1 — Grade 9 MTH1W: Number, Algebra, Data, Geometry & Measurement, Financial Literacy
    topic('algebraic-expressions', 'L1', 'Algebraic expressions', [
      'order-of-operations',
      'exponents-and-roots',
    ]),
    topic('linear-equations', 'L1', 'Linear equations', ['algebraic-expressions', 'fractions']),
    topic('linear-inequalities', 'L1', 'Linear inequalities', ['linear-equations']),
    topic('linear-relations', 'L1', 'Linear relations, slope, y = mx + b', [
      'linear-equations',
      'ratios-and-rates',
    ]),
    topic('exponent-laws', 'L1', 'Exponent laws', ['exponents-and-roots', 'algebraic-expressions']),
    topic('measurement-and-geometry', 'L1', 'Area, volume, Pythagorean theorem', [
      'exponents-and-roots',
      'fractions',
    ]),
    topic('data-and-statistics', 'L1', 'Data and statistics', ['decimals', 'percents']),
    topic('financial-literacy', 'L1', 'Financial literacy (interest, budgets)', ['percents']),
    // L2 — Grade 10 MPM2D: Quadratic Relations, Analytic Geometry, Trigonometry
    topic('linear-systems', 'L2', 'Linear systems', ['linear-relations']),
    topic('analytic-geometry', 'L2', 'Analytic geometry', [
      'linear-relations',
      'measurement-and-geometry',
    ]),
    topic('polynomial-operations', 'L2', 'Expanding polynomials', ['exponent-laws']),
    topic('factoring', 'L2', 'Factoring', ['polynomial-operations', 'factors-and-multiples']),
    topic('quadratic-relations', 'L2', 'Quadratic relations and transformations', [
      'factoring',
      'linear-relations',
    ]),
    topic('quadratic-equations', 'L2', 'Solving quadratic equations', ['factoring']),
    topic('similar-triangles', 'L2', 'Similar triangles', [
      'ratios-and-rates',
      'measurement-and-geometry',
    ]),
    topic('right-triangle-trigonometry', 'L2', 'Right-triangle trigonometry', [
      'similar-triangles',
    ]),
    topic('sine-and-cosine-laws', 'L2', 'Sine law and cosine law', ['right-triangle-trigonometry']),
  ],
};

export const GATES: readonly Gate[] = [
  { id: 'A', level: 'L2', minScore: 0.75, requiredPasses: 2 },
  { id: 'B1', level: 'L3', minScore: 0.8, requiredPasses: 3 },
  { id: 'B2', level: 'L4', minScore: 0.8, requiredPasses: 3 },
  { id: 'B3', level: 'L5', minScore: 0.8, requiredPasses: 3 },
];
