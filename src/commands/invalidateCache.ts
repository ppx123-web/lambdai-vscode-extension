import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { findLambdaiDir } from "../utils/synthesizedDataReader";

export async function invalidateCache(
  uri: vscode.Uri,
  line: number
): Promise<void> {
  try {
    const filePath = uri.fsPath;
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, ".py");

    // Find .lambdai directory
    const lambdaaiDir = findLambdaiDir(fileDir);
    if (!lambdaaiDir) {
      vscode.window.showErrorMessage("Could not find .lambdai directory");
      return;
    }

    // Construct cache and trace file paths
    const cacheFileName = `${fileName}_cache_${line + 1}.py`;
    const traceFileName = `${fileName}_trace_${line + 1}.json`;
    const cacheFilePath = path.join(lambdaaiDir, cacheFileName);
    const traceFilePath = path.join(lambdaaiDir, traceFileName);

    let deletedFiles = [];
    let notFoundFiles = [];

    // Check and delete cache file
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
      deletedFiles.push(cacheFileName);
    } else {
      notFoundFiles.push(cacheFileName);
    }

    // Check and delete trace file
    if (fs.existsSync(traceFilePath)) {
      fs.unlinkSync(traceFilePath);
      deletedFiles.push(traceFileName);
    } else {
      notFoundFiles.push(traceFileName);
    }

    // Show appropriate message
    if (deletedFiles.length > 0) {
      const deletedMessage = `Cache invalidated: ${deletedFiles.join(", ")}`;
      if (notFoundFiles.length > 0) {
        vscode.window.showInformationMessage(
          `${deletedMessage} (${notFoundFiles.join(", ")} not found)`
        );
      } else {
        vscode.window.showInformationMessage(deletedMessage);
      }
    } else {
      vscode.window.showErrorMessage(
        `No cache files found for line ${line + 1}`
      );
      return;
    }
  } catch (error) {
    console.error("Error invalidating cache:", error);
    vscode.window.showErrorMessage("Failed to invalidate cache");
  }
} 