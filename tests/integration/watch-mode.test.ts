import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';
import { stateManager } from '../../src/core/StateManager.js';
import { DocumentBuilder } from '../helpers/DocumentBuilder.js';
import { SchemaBuilder } from '../helpers/SchemaBuilder.js';

describe('Watch Mode Cache Invalidation Integration', () => {
  const tempSpecPath = path.resolve(
    process.cwd(),
    'tests/integration/temp-watch-spec.json'
  );

  const createSpec = (minimum: number) => {
    const schema = new SchemaBuilder()
      .type('object')
      .properties({
        value: new SchemaBuilder().type('number').minimum(minimum)
      })
      .required('value')
      .build();

    const spec = new DocumentBuilder()
      .withPath('/test', 'post', {
        responses: {
          '200': {
            description: 'Success response',
            content: {
              'application/json': {
                schema
              }
            }
          }
        }
      })
      .build();

    fs.writeFileSync(tempSpecPath, JSON.stringify(spec, null, 2), 'utf-8');
  };

  afterEach(() => {
    stateManager.clear();
    if (fs.existsSync(tempSpecPath)) {
      fs.unlinkSync(tempSpecPath);
    }
  });

  it('should successfully validate payload when it satisfies the initial specification constraints', async () => {
    createSpec(10);
    const initialTime = new Date();
    fs.utimesSync(tempSpecPath, initialTime, initialTime);
    const options = {
      specPath: 'tests/integration/temp-watch-spec.json',
      path: '/test',
      method: 'POST',
      status: 200,
      body: { value: 15 }
    };

    await expect(assertResponseMatchesOpenApi(options)).resolves.not.toThrow();
  });

  it('should reject payload when specification is updated with stricter validation constraints', async () => {
    createSpec(10);
    const initialTime = new Date();
    fs.utimesSync(tempSpecPath, initialTime, initialTime);
    const options = {
      specPath: 'tests/integration/temp-watch-spec.json',
      path: '/test',
      method: 'POST',
      status: 200,
      body: { value: 15 }
    };
    await assertResponseMatchesOpenApi(options);

    createSpec(20);
    const updatedTime = new Date(Date.now() + 2000);
    fs.utimesSync(tempSpecPath, updatedTime, updatedTime);

    await expect(assertResponseMatchesOpenApi(options)).rejects.toThrow();
  });
});
