export const addCodeInStyleBlocks = (css: string, html: string) => {
  // from compiler/compile-blocks.ts#compileBlocks
  const getBlockPattern = (el: 'style', langAttr = 'lang') =>
    `(<${el}\\s*)(?:([\\s\\S]*?)${langAttr}\\s*=\\s*["']([A-Za-z0-9 _]*)["'])?((?:[^>]*)>)([\\s\\S]*?)(<\\/${el}>)`;
  const pattern = getBlockPattern('style');
  for (const arr of [...html.matchAll(new RegExp(pattern, 'g'))]) {
    const content = arr[5];
    if (content?.trim()) {
      // Remove any markdown-style code blocks from the content
      const cleanedContent = content.replace(/```[\s\S]*?```/g, '');
      css += `\n${cleanedContent}`;
    }
  }
  // Final cleanup: remove any stray triple backticks that might remain
  return css.replace(/```/g, '');
};
