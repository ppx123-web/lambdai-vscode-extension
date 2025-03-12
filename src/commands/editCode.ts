import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  readSynthesizedData,
  decodeBase64,
} from "../utils/synthesizedDataReader";

/**
 * Open a new editor with the code from the last step and set up saving back to synthesized.json
 */
export async function editCode(
  uri: vscode.Uri,
  line: number
): Promise<void> {
  try {
    const filePath = uri.fsPath;
    
    // Read synthesized data
    const data = await readSynthesizedData(filePath);
    if (!data || !data.results) {
      vscode.window.showErrorMessage("No synthesized data found");
      return;
    }

    // Find the result for this line
    const key = `${filePath}:${line + 1}`;
    let resultKey = key;
    
    // If not found directly, try to find by filename
    if (!data.results[key]) {
      const fileName = filePath.split("/").pop() || "";
      const matchingKey = Object.keys(data.results).find(k => 
        k.endsWith(`/${fileName}:${line + 1}`) || k.endsWith(`:${fileName}:${line + 1}`)
      );
      
      if (matchingKey) {
        resultKey = matchingKey;
      } else {
        vscode.window.showErrorMessage("No AI execution data found for this line");
        return;
      }
    }

    const result = data.results[resultKey];
    if (!result || !result.steps || result.steps.length === 0) {
      vscode.window.showErrorMessage("No steps found in AI execution data");
      return;
    }

    // Get the last AI step
    const lastAIStep = result.steps[result.steps.length - 1];
    const code = decodeBase64(lastAIStep.code);

    // Create a new user edit step based on the last AI step
    const newUserStep = {
      raw: lastAIStep.raw,
      code: lastAIStep.code, // Initially the same as the last AI step
      args_md5: lastAIStep.args_md5,
      complexity: Buffer.from("(USER EDIT)").toString('base64'),
      explaination: Buffer.from("(USER EDIT)").toString('base64')
    };
    
    // Add the new user step to the steps array
    result.steps.push(newUserStep);
    
    // Write the updated data back to synthesized.json
    const synthesizedJsonPath = path.join(path.dirname(filePath), "synthesized.json");
    fs.writeFileSync(synthesizedJsonPath, JSON.stringify(data, null, 2));

    // Create a temporary file with the code
    const tempDir = path.join(path.dirname(filePath), ".lambdai-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Use a filename that indicates which line and file it's from
    const fileName = path.basename(filePath);
    const tempFilePath = path.join(
      tempDir, 
      `edit_line_${line + 1}_${fileName}`
    );
    
    // Write the code to the temp file
    fs.writeFileSync(tempFilePath, code);

    // Open the temp file in the editor
    const document = await vscode.workspace.openTextDocument(tempFilePath);
    const editor = await vscode.window.showTextDocument(document);

    // Set up a file system watcher to detect when the file is saved
    const watcher = vscode.workspace.createFileSystemWatcher(tempFilePath);
    
    // When the file is saved, update the synthesized.json
    watcher.onDidChange(async () => {
      try {
        // Read the updated code
        const updatedCode = fs.readFileSync(tempFilePath, 'utf8');
        
        // Encode to base64
        const encodedCode = Buffer.from(updatedCode).toString('base64');
        
        // Update the user edit step with the new code
        result.steps[result.steps.length - 1].code = encodedCode;
        
        // Write the updated data back to synthesized.json
        fs.writeFileSync(synthesizedJsonPath, JSON.stringify(data, null, 2));
        
        vscode.window.showInformationMessage("Updated your edits in synthesized.json");
      } catch (error) {
        console.error("Error updating synthesized.json:", error);
        vscode.window.showErrorMessage("Failed to update code in synthesized.json");
      }
    });
    
    // When the file is closed, dispose the watcher
    const disposable = vscode.window.onDidChangeVisibleTextEditors((editors) => {
      if (!editors.some(e => e.document.uri.fsPath === tempFilePath)) {
        watcher.dispose();
        disposable.dispose();
      }
    });
    
  } catch (error) {
    console.error("Error opening code editor:", error);
    vscode.window.showErrorMessage("Failed to open code editor");
  }
} 