export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    Array.from(value).some(
      (char) => char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return '/library';
  try {
    const url = new URL(value, 'https://app.invalid');
    return url.origin === 'https://app.invalid'
      ? `${url.pathname}${url.search}${url.hash}`
      : '/library';
  } catch {
    return '/library';
  }
}
