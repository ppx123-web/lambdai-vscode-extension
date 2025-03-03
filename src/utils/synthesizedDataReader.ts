import * as vscode from "vscode";

interface SynthesizedResult {
  path: string;
  line: number;
  args_md5: string;
  raw: string;
  code: string;
  complexity: string;
  explaination: string; // 注意：JSON 中的拼写是 explaination 而不是 explanation
}

interface SynthesizedData {
  results: SynthesizedResult[];
}

/**
 * 从 synthesized.json 文件中读取数据
 */
export async function readSynthesizedData(): Promise<SynthesizedData | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return null;
  }

  try {
    const jsonPath = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      "synthesized.json"
    );
    const jsonContent = await vscode.workspace.fs.readFile(jsonPath);
    return JSON.parse(jsonContent.toString()) as SynthesizedData;
  } catch (error) {
    console.error("Error reading synthesized.json:", error);
    return null;
  }
}

/**
 * 查找特定文件和行号的合成结果
 */
export async function findSynthesizedResult(
  filePath: string,
  line: number
): Promise<SynthesizedResult | null> {
  const data = await readSynthesizedData();
  if (!data || !data.results) {
    return null;
  }

  // 尝试精确匹配路径和行号
  const exactMatch = data.results.find(
    (result) => result.path === filePath && result.line === line
  );

  if (exactMatch) {
    return exactMatch;
  }

  // 如果没有精确匹配，尝试匹配文件名和行号
  const fileName = filePath.split("/").pop() || "";
  return (
    data.results.find(
      (result) => result.path.endsWith(fileName) && result.line === line
    ) || null
  );
}

/**
 * 解码 Base64 字符串
 */
export function decodeBase64(base64: string): string {
  try {
    return Buffer.from(base64, "base64").toString();
  } catch (error) {
    console.error("Error decoding base64:", error);
    return "Error decoding content";
  }
}
