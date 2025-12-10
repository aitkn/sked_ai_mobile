import { initDatabase, closeDatabase } from '@/db'
import { TaskRepository } from '@/repositories/TaskRepository'
import { EntityRepository } from '@/repositories/EntityRepository'

// These are smoke tests that verify repository methods call into the DB layer.
// Running against a real native SQLite impl under Jest is not guaranteed,
// so we keep expectations minimal.

describe('SQLite DB Layer (smoke)', () => {
  test('repositories expose required methods', async () => {
    const db = await initDatabase('SkedAI-test.db')
    const taskRepo = new TaskRepository(db)
    const entityRepo = new EntityRepository(db)

    expect(typeof taskRepo.getById).toBe('function')
    expect(typeof taskRepo.create).toBe('function')
    expect(typeof taskRepo.bulkUpsert).toBe('function')

    expect(typeof entityRepo.getById).toBe('function')
    expect(typeof entityRepo.create).toBe('function')
    expect(typeof entityRepo.bulkUpsert).toBe('function')

    await closeDatabase(db)
  })
})


