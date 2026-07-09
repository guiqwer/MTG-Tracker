// Short, human-friendly invite codes for groups. The alphabet omits characters
// that are easy to confuse when read aloud or copied (0/O, 1/I/L), so a code
// like "K7QX9RT" is unambiguous to share with your playgroup.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateInviteCode(length = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let code = ''
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return code
}
