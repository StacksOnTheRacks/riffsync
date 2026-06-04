import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

import { bumpCatalogGeneration, CATALOG_META_ID, getCatalogGeneration } from './catalog-meta';

describe('catalog-meta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCatalogGeneration returns 1 when meta row is absent', async () => {
    mocks.docSend.mockResolvedValueOnce({});
    const gen = await getCatalogGeneration({ send: mocks.docSend } as never, 'catalog-table');
    expect(gen).toBe(1);
    expect(mocks.docSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: { id: CATALOG_META_ID },
        }),
      }),
    );
  });

  it('getCatalogGeneration reads stored counter', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: { id: CATALOG_META_ID, catalogGeneration: 7 } });
    await expect(getCatalogGeneration({ send: mocks.docSend } as never, 'catalog-table')).resolves.toBe(
      7,
    );
  });

  it('bumpCatalogGeneration increments via ADD and returns new value', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Attributes: { catalogGeneration: 2 },
    });
    const gen = await bumpCatalogGeneration({ send: mocks.docSend } as never, 'catalog-table');
    expect(gen).toBe(2);
    expect(mocks.docSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: { id: CATALOG_META_ID },
          UpdateExpression: 'ADD catalogGeneration :one',
        }),
      }),
    );
  });

  it('bumpCatalogGeneration throws when response lacks generation', async () => {
    mocks.docSend.mockResolvedValueOnce({ Attributes: {} });
    await expect(
      bumpCatalogGeneration({ send: mocks.docSend } as never, 'catalog-table'),
    ).rejects.toThrow(/missing catalogGeneration/);
  });
});
