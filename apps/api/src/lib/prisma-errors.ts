// Narrow a thrown Prisma error by its request code without importing the Prisma
// error class. Used to turn unique-constraint races into clean 409s.
function hasCode(e: unknown, code: string): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === code
  )
}

// P2002 = unique constraint violation.
export const isUniqueViolation = (e: unknown) => hasCode(e, 'P2002')
