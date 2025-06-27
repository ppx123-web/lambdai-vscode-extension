import * as vscode from "vscode";
import * as path from "path";
import { findLambdaiDir } from "../utils/synthesizedDataReader";

/**
 * Open a new editor with the code from the last step and set up saving back to synthesized.json
 */
export async function editCode(
  uri: vscode.Uri,
  line: number
): Promise<void> {
  try {
    const filePath = uri.fsPath;
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, '.py');
    
    // Find .lambdai directory
    const lambdaaiDir = findLambdaiDir(fileDir);
    if (!lambdaaiDir) {
      vscode.window.showErrorMessage("Could not find .lambdai directory");
      return;
    }

    // Construct cache file path
    const cacheFileName = `${fileName}_cache_${line + 1}.py`;
    const cacheFilePath = path.join(lambdaaiDir, cacheFileName);

    // Check if cache file exists
    const cacheFileUri = vscode.Uri.file(cacheFilePath);
    try {
      await vscode.workspace.fs.stat(cacheFileUri);
    } catch {
      vscode.window.showErrorMessage(`Cache file not found: ${cacheFileName}`);
      return;
    }

    // Open the cache file directly
    const document = await vscode.workspace.openTextDocument(cacheFileUri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true
    });
    
  } catch (error) {
    console.error("Error opening cache file:", error);
    vscode.window.showErrorMessage("Failed to open cache file");
  }
} 