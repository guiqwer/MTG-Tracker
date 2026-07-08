// Password hashing. `Bun.password` uses argon2id by default — a strong,
// memory-hard algorithm and the current OWASP recommendation. Passwords are
// therefore always stored as an argon2id hash, never in plain text.
export function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash)
}
