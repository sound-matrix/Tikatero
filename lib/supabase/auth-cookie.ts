export function isAuthCookie(name: string) {
  return /^sb-[\w-]+-auth-token(?:\.\d+)?$/.test(name);
}
