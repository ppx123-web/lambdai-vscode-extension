/**
 * 将Markdown内容转换为HTML
 */
export function renderMarkdownToHtml(markdownContent: string): string {
  // 首先处理代码块，将它们替换为占位符，以防止内部内容被解析
  const codeBlocks: string[] = [];
  const withoutCodeBlocks = markdownContent.replace(
    /```([\s\S]*?)```/g,
    (match, code) => {
      const id = `CODE_BLOCK_${codeBlocks.length}`;
      codeBlocks.push(match);
      return id;
    }
  );

  // 处理其他Markdown元素
  let html = withoutCodeBlocks
    // 处理标题
    .replace(/^# (.*?)$/gm, "<h1>$1</h1>")
    .replace(/^## (.*?)$/gm, "<h2>$1</h2>")
    // 处理强调
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // 处理列表
    .replace(/^- (.*?)$/gm, "<li>$1</li>")
    // 处理段落
    .replace(/^(?!<h|<li|CODE_BLOCK)(.+)$/gm, "<p>$1</p>")
    // 包装列表项
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // 恢复代码块并正确渲染
  codeBlocks.forEach((block, index) => {
    const language = block.match(/```(\w*)\n/)?.[1] || "";
    const code = block.replace(/```(\w*)\n([\s\S]*?)```/, "$2");
    const escapedCode = code.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const formattedBlock = `<pre><code class="language-${language}">${escapedCode}</code></pre>`;
    html = html.replace(`CODE_BLOCK_${index}`, formattedBlock);
  });

  return html;
}

/**
 * 简单的Markdown转HTML处理（用于WebviewView）
 */
export function simpleMarkdownToHtml(markdown: string): string {
  return markdown
    .replace(/\n\n/g, "<br><br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/```([\s\S]*?)```/g, (match, code) => {
      return `<pre>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
    });
}
