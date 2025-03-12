// src/extension.ts
import * as vscode from 'vscode';
import { createCustomHoverProvider } from "./providers/hoverProvider";
import { AIExecuteCodeLensProvider } from "./providers/codeLensProvider";
import { AIExecuteHoverProvider } from "./providers/aiExecuteHoverProvider";
import {
  showExecutionPanel,
  AIExecutionViewProvider,
} from "./views/executionPanel";
import {
  aiExecuteDecoration,
  aiExecuteInfoDecoration,
  updateAIExecuteDecorations,
  updateAIExecuteInfoDecorations,
} from "./utils/decorationProvider";
import { replaceWithAICode } from "./commands/replaceWithAICode";
import { editCode } from "./commands/editCode";

export function activate(context: vscode.ExtensionContext) {
  console.log("AI Hover Extension is now active!");

  const pythonExtension = vscode.extensions.getExtension("ms-python.python");
  console.log("Python extension found:", pythonExtension?.id);

  // 注册悬停提供程序
  const hoverProvider = vscode.languages.registerHoverProvider(
    "python",
    createCustomHoverProvider()
  );
  context.subscriptions.push(hoverProvider);

  // 注册 AI.execute 悬停提供程序
  const aiExecuteHoverProvider = vscode.languages.registerHoverProvider(
    "*",
    new AIExecuteHoverProvider()
  );
  context.subscriptions.push(aiExecuteHoverProvider);

  // 注册WebviewView提供程序
  const viewProvider = new AIExecutionViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("aiExecutionView", viewProvider)
  );

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aiHover.showDialog",
      async (line: number) => {
        await showExecutionPanel(line, context);
      }
    )
  );

  // 注册替换命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aiHover.replaceWithAICode",
      async (uri: vscode.Uri, range: vscode.Range) => {
        await replaceWithAICode(uri, range);
      }
    )
  );

  // 注册编辑代码命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aiHover.editCode",
      async (uri: vscode.Uri, line: number) => {
        await editCode(uri, line);
      }
    )
  );

  // 注册CodeLens提供程序
  vscode.languages.registerCodeLensProvider(
    "*",
    new AIExecuteCodeLensProvider()
  );

  // 初始化装饰
  updateAIExecuteDecorations(vscode.window.activeTextEditor);
  updateAIExecuteInfoDecorations(vscode.window.activeTextEditor);

  // 监听编辑器变化
  vscode.window.onDidChangeActiveTextEditor(
    async (editor) => {
      updateAIExecuteDecorations(editor);
      await updateAIExecuteInfoDecorations(editor);
    },
    null,
    context.subscriptions
  );

  // 监听文档变化
  vscode.workspace.onDidChangeTextDocument(
    async (event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        updateAIExecuteDecorations(editor);
        await updateAIExecuteInfoDecorations(editor);
      }
    },
    null,
    context.subscriptions
  );
}

export function deactivate() {}