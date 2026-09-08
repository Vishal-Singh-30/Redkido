import '../prisma/env'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

// NOTE: package.json has no "type":"module", so tsx transpiles these scripts to
// CJS, where TOP-LEVEL AWAIT IS A HARD ERROR. Every tsx-run script in this repo
// (including prisma/seed.ts) must wrap its awaits in an async main().
async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? '1'),
  })
  const prisma = new PrismaClient({ adapter })

  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema='public' order by 1`
  console.log('tables:', tables.map((r) => r.table_name).join(', '))
  console.log(
    'admins:', await prisma.admin.count(),
    '| consultationTypes:', await prisma.consultationType.count(),
    '| slots:', await prisma.slot.count(),
    '| leads:', await prisma.lead.count()
  )
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
