import type {
  INestApplication,
} from '@nestjs/common';

import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module.js';

describe('Vera API', () => {
  let app:
    INestApplication;

  beforeAll(async () => {
    const moduleRef =
      await Test.createTestingModule({
        imports: [
          AppModule,
        ],
      }).compile();

    app =
      moduleRef
        .createNestApplication();

    app.setGlobalPrefix(
      'api',
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should initialize', () => {
    expect(
      app,
    ).toBeDefined();
  });
});