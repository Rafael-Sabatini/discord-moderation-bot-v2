const DISCORD_INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+/i;
const MARKDOWN_HEADER_REGEX = /^#{1,3}\s+/m;

export function hasInviteLink(content: string): boolean {
  return DISCORD_INVITE_REGEX.test(content);
}

export function hasMarkdownHeader(content: string): boolean {
  return MARKDOWN_HEADER_REGEX.test(content);
}

export function validateRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch {
    return false;
  }
}
