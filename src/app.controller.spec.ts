import { Test } from '@nestjs/testing';

import { AppController } from './app.controller.js';

describe('AppController', () => {
  let controller:
    AppController;

  beforeEach(async () => {
    const moduleRef =
      await Test.createTestingModule({
        controllers: [
          AppController,
        ],
      }).compile();

    controller =
      moduleRef.get<AppController>(
        AppController,
      );
  });

  it('should be defined', () => {
    expect(
      controller,
    ).toBeDefined();
  });
});