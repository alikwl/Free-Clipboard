export function resolveVariables(
  content: string,
  context: {
    name?: string;
    email?: string;
    url?: string;
    title?: string;
  }
): string {
  const now = new Date();

  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const firstName = context.name?.split(' ')[0] || context.name || '';

  return content
    .replace(/\{name\}/g, firstName)
    .replace(/\{email\}/g, context.email || '')
    .replace(/\{date\}/g, `${day}/${month}/${year}`)
    .replace(/\{time\}/g, `${hours}:${minutes}`)
    .replace(/\{url\}/g, context.url || '')
    .replace(/\{title\}/g, context.title || '');
}

export function detectTriggerAtCursor(
  text: string,
  cursorPos: number
): { trigger: string; startPos: number; endPos: number } | null {
  const beforeCursor = text.substring(0, cursorPos);
  const lastWordMatch = beforeCursor.match(/;;[a-zA-Z0-9_-]*$/);

  if (!lastWordMatch) return null;

  const trigger = lastWordMatch[0];
  if (trigger.length < 3) return null;

  const startPos = cursorPos - trigger.length;
  const endPos = cursorPos;

  return { trigger, startPos, endPos };
}
