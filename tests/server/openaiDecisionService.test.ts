import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createControllerDecision,
  normalizeControllerDecision,
  type RawControllerDecision,
} from '../../server/openaiDecisionService';
import { validateControllerDecisionRequest } from '../../server/controllerDecisionSchema';

describe('openaiDecisionService', () => {
  it('uses explicit file extensions for relative imports in the dev server dependency chain', () => {
    const files = [
      'server/index.ts',
      'server/openaiDecisionService.ts',
      'server/controllerDecisionSchema.ts',
      'domain/decision/ControllerDesigner.ts',
      'domain/decision/TaskAnalyzer.ts',
      'domain/controllers/controllerTemplates.ts',
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const relativeImports = [...source.matchAll(/from ['"](\.{1,2}\/[^'"]+)['"]/g)].map(
        (match) => match[1]
      );

      expect(
        relativeImports.filter((importPath) => !/\.(ts|tsx|js|mjs|cjs)$/.test(importPath)),
        `${file} contains extensionless relative imports`
      ).toEqual([]);
    }
  });

  it('uses type-only imports when pulling interfaces from types.ts in the dev server dependency chain', () => {
    const files = [
      'domain/decision/ControllerDesigner.ts',
      'domain/decision/TaskAnalyzer.ts',
      'domain/controllers/controllerTemplates.ts',
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const lines = source
        .split('\n')
        .filter((line) => line.includes("from '../../types.ts'"));

      expect(
        lines.every((line) => line.trimStart().startsWith('import type ')),
        `${file} should use import type when importing from ../../types.ts`
      ).toBe(true);
    }
  });

  it('normalizes a bounded controller decision payload', () => {
    const decision = normalizeControllerDecision({
      templateId: 'joint_pd',
      optimizableParameters: ['blend', 'damping'],
      initialParameters: { blend: 0.2, damping: 0.1 },
      parameterBounds: {
        blend: { min: 0.05, max: 0.9 },
        damping: { min: 0, max: 0.4 },
      },
      selectionRationale: 'stable default',
    } satisfies RawControllerDecision);

    expect(decision.templateId).toBe('joint_pd');
    expect(decision.optimizableParameters).toEqual(['blend', 'damping']);
  });

  it('accepts a valid scenario request', () => {
    const result = validateControllerDecisionRequest({
      description: 'pick cube and place into tray',
      requirements: {
        speed: 0.5,
        accuracy: 0.8,
        stability: 0.7,
        efficiency: 0.3,
      },
    });

    expect(result.valid).toBe(true);
  });

  it('uses the Responses API json_object format for OpenAI requests', async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'local server unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            templateId: 'joint_pd',
            optimizableParameters: ['blend'],
            initialParameters: { blend: 0.3 },
            parameterBounds: {
              blend: { min: 0.05, max: 1 },
            },
            selectionRationale: 'safe default',
          }),
        }),
      });

    try {
      await createControllerDecision(
        {
          description: 'pick cube',
          requirements: { speed: 0.2, accuracy: 0.9, stability: 0.8, efficiency: 0.2 },
        },
        fetchMock as unknown as typeof fetch
      );
    } finally {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.text.format.type).toBe('json_object');
  });
});
