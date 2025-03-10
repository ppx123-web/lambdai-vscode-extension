import * as vscode from "vscode";
import {
  findSynthesizedResult,
  decodeBase64,
} from "../utils/synthesizedDataReader";

/**
 * 查找完整的赋值语句范围
 */
async function findCompleteAssignmentRange(
  document: vscode.TextDocument,
  line: number
): Promise<vscode.Range> {
  // 首先尝试使用 Python 扩展的 AST 功能
  try {
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");
    if (pythonExtension) {
      if (!pythonExtension.isActive) {
        await pythonExtension.activate();
      }

      // 尝试获取 Python AST
      const api = pythonExtension.exports;
      if (api && api.getAst) {
        const ast = await api.getAst(document.uri);
        if (ast && ast.statements) {
          // 查找包含当前行的语句
          for (const stmt of ast.statements) {
            if (
              stmt.range &&
              stmt.range.start.line <= line &&
              stmt.range.end.line >= line
            ) {
              return new vscode.Range(
                new vscode.Position(
                  stmt.range.start.line,
                  stmt.range.start.character
                ),
                new vscode.Position(
                  stmt.range.end.line,
                  stmt.range.end.character
                )
              );
            }
          }
        }
      }
    }
  } catch (error) {
    console.log("Error using Python AST:", error);
  }

  // 如果 Python AST 不可用，使用简单的文本分析
  // 从当前行开始向下查找，直到找到不属于赋值语句的行
  let startLine = line;
  let endLine = line;
  let parenthesesCount = 0;
  let bracesCount = 0;
  let bracketsCount = 0;

  // 检查当前行的括号情况
  const currentLineText = document.lineAt(line).text;
  for (const char of currentLineText) {
    if (char === "(") parenthesesCount++;
    else if (char === ")") parenthesesCount--;
    else if (char === "{") bracesCount++;
    else if (char === "}") bracesCount--;
    else if (char === "[") bracketsCount++;
    else if (char === "]") bracketsCount--;
  }

  // 如果括号不平衡，向下查找直到平衡
  while (
    endLine < document.lineCount - 1 &&
    (parenthesesCount > 0 || bracesCount > 0 || bracketsCount > 0)
  ) {
    endLine++;
    const lineText = document.lineAt(endLine).text;
    for (const char of lineText) {
      if (char === "(") parenthesesCount++;
      else if (char === ")") parenthesesCount--;
      else if (char === "{") bracesCount++;
      else if (char === "}") bracesCount--;
      else if (char === "[") bracketsCount++;
      else if (char === "]") bracketsCount--;
    }
  }

  return new vscode.Range(
    document.lineAt(startLine).range.start,
    document.lineAt(endLine).range.end
  );
}

/**
 * 从代码中提取函数名
 */
function extractFunctionName(code: string): string {
  const match = code.match(/def\s+([a-zA-Z0-9_]+)/);
  return match ? match[1] : "lambda_result";
}

/**
 * 从 AI.execute 调用中提取参数
 */
async function extractAIExecuteParams(
  document: vscode.TextDocument,
  range: vscode.Range
): Promise<string[]> {
  // 尝试使用 Python 扩展的 AST 功能
  try {
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");
    if (pythonExtension && pythonExtension.isActive) {
      const api = pythonExtension.exports;
      if (api && api.getAst) {
        const ast = await api.getAst(document.uri);
        if (ast && ast.statements) {
          // 查找包含当前行的语句
          for (const stmt of ast.statements) {
            if (
              stmt.range &&
              stmt.range.start.line <= range.start.line &&
              stmt.range.end.line >= range.start.line
            ) {
              // 如果是赋值语句
              if (stmt.nodeType === "Assign" && stmt.value) {
                const value = stmt.value;
                // 如果右侧是函数调用
                if (value.nodeType === "Call" && value.args) {
                  // 跳过第一个参数（通常是字符串模板）
                  const args = value.args.slice(1);
                  return args.map((arg: any) => {
                    // 获取参数的文本表示
                    const argRange = new vscode.Range(
                      new vscode.Position(
                        arg.range.start.line,
                        arg.range.start.character
                      ),
                      new vscode.Position(
                        arg.range.end.line,
                        arg.range.end.character
                      )
                    );
                    return document.getText(argRange);
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.log("Error extracting parameters using AST:", error);
  }

  // 如果 AST 方法失败，使用简单的文本分析
  const fullText = document.getText(range);
  const aiExecuteMatch = fullText.match(/AI\.execute\s*\(\s*(.*?)\s*\)/s);

  if (!aiExecuteMatch) {
    return [];
  }

  const argsText = aiExecuteMatch[1];

  // 分割参数，处理嵌套括号和引号
  const params: string[] = [];
  let currentParam = "";
  let inString = false;
  let stringChar = "";
  let bracketCount = 0;

  for (let i = 0; i < argsText.length; i++) {
    const char = argsText[i];

    // 处理字符串
    if (
      (char === '"' || char === "'") &&
      (i === 0 || argsText[i - 1] !== "\\")
    ) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // 处理括号
    if (!inString) {
      if (char === "(" || char === "[" || char === "{") {
        bracketCount++;
      } else if (char === ")" || char === "]" || char === "}") {
        bracketCount--;
      } else if (char === "," && bracketCount === 0) {
        // 找到参数分隔符
        if (currentParam.trim()) {
          params.push(currentParam.trim());
        }
        currentParam = "";
        continue;
      }
    }

    currentParam += char;
  }

  // 添加最后一个参数
  if (currentParam.trim()) {
    params.push(currentParam.trim());
  }

  // 跳过第一个参数（通常是字符串模板）
  return params.slice(1);
}

/**
 * 将 AI.execute 调用替换为实际生成的代码
 */
export async function replaceWithAICode(
  uri: vscode.Uri,
  range: vscode.Range
): Promise<void> {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);

    // Get complete AI.execute line
    const lineText = document.lineAt(range.start.line).text;

    // Find synthesized result
    const result = await findSynthesizedResult(
      uri.fsPath,
      range.start.line + 1
    );

    if (!result) {
      vscode.window.showErrorMessage(
        "No AI generated code found for this line."
      );
      return;
    }

    // Decode code
    const code = decodeBase64(result.step.code);

    // Determine indentation
    const indentMatch = lineText.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";

    // Add indentation to each line of code
    const indentedCode = code
      .split("\n")
      .map((line) => indent + line)
      .join("\n");

    // Extract function name
    const functionName = extractFunctionName(code);

    // Extract variable declaration part
    const varDeclMatch = lineText.match(/^(\s*)(.*?)\s*=\s*AI\.execute/);

    if (!varDeclMatch) {
      // If no variable declaration found, replace entire line
      const fullRange = document.lineAt(range.start.line).range;
      await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, indentedCode);
      });
    } else {
      // Extract variable declaration part
      const varDecl = varDeclMatch[2];

      // Get complete assignment statement range
      const fullAssignmentRange = await findCompleteAssignmentRange(
        document,
        range.start.line
      );

      // Extract AI.execute parameters
      const params = await extractAIExecuteParams(
        document,
        fullAssignmentRange
      );

      // Create call to generated function
      const functionCall = `${indent}${varDecl} = ${functionName}(${params.join(
        ", "
      )})`;

      // Execute replacement: first insert code, then replace original assignment
      await editor.edit((editBuilder) => {
        // Insert generated code before original line
        editBuilder.insert(fullAssignmentRange.start, indentedCode + "\n");

        // Replace original assignment with function call
        editBuilder.replace(fullAssignmentRange, functionCall);
      });
    }

    vscode.window.showInformationMessage(
      "AI.execute call replaced with generated code."
    );
  } catch (error) {
    console.error("Error replacing AI.execute:", error);
    vscode.window.showErrorMessage("Failed to replace AI.execute call.");
  }
}
