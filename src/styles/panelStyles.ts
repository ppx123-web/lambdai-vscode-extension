import * as vscode from "vscode";

/**
 * 获取基于当前主题的CSS样式
 */
export function getPanelStyles(isDarkTheme: boolean): string {
  return `
    :root {
      --background-color: ${isDarkTheme ? "#1e1e1e" : "#ffffff"};
      --text-color: ${isDarkTheme ? "#cccccc" : "#333333"};
      --border-color: ${isDarkTheme ? "#3c3c3c" : "#eaecef"};
      --code-background: ${isDarkTheme ? "#2d2d2d" : "#f5f5f5"};
      --link-color: ${isDarkTheme ? "#3794ff" : "#0366d6"};
      --heading-color: ${isDarkTheme ? "#e0e0e0" : "#24292e"};
    }
    
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      padding: 20px; 
      line-height: 1.6;
      color: var(--text-color);
      background-color: var(--background-color);
      max-width: 800px;
      margin: 0 auto;
    }
    
    pre { 
      background-color: var(--code-background); 
      padding: 16px; 
      border-radius: 6px; 
      overflow: auto;
      margin: 16px 0;
    }
    
    code { 
      font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
      font-size: 14px;
    }
    
    h1 { 
      color: var(--heading-color); 
      border-bottom: 1px solid var(--border-color); 
      padding-bottom: 0.3em;
      margin-top: 24px;
    }
    
    h2 { 
      margin-top: 24px; 
      margin-bottom: 16px; 
      font-weight: 600; 
      line-height: 1.25;
      color: var(--heading-color);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.3em;
    }
    
    ul {
      padding-left: 2em;
    }
    
    li {
      margin: 0.25em 0;
    }
    
    p {
      margin: 16px 0;
    }
    
    a {
      color: var(--link-color);
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    strong {
      font-weight: 600;
    }
  `;
}
