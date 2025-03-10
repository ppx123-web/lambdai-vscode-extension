import * as vscode from "vscode";
import * as path from "path";

interface SynthesizedStep {
  raw: string;
  code: string;
  args_md5: string;
  complexity: string;
  explaination: string; // Note: JSON has this spelling
}

interface SynthesizedResult {
  steps: SynthesizedStep[];
}

interface SynthesizedData {
  results: Record<string, SynthesizedResult>;
}

/**
 * From synthesized.json file read data
 */
export async function readSynthesizedData(filePath: string): Promise<SynthesizedData | null> {
  try {
    // Get the directory of the current file
    const fileDir = path.dirname(filePath);
    
    // Create path to synthesized.json in the same directory
    const jsonPath = vscode.Uri.file(path.join(fileDir, "synthesized.json"));
    
    const jsonContent = await vscode.workspace.fs.readFile(jsonPath);
    return JSON.parse(jsonContent.toString()) as SynthesizedData;
  } catch (error) {
    console.error("Error reading synthesized.json:", error);
    return null;
  }
}

/**
 * Find synthesized result for specific file and line number
 */
export async function findSynthesizedResult(
  filePath: string,
  line: number
): Promise<{step: SynthesizedStep, totalSteps: number} | null> {
  const data = await readSynthesizedData(filePath);
  if (!data || !data.results) {
    return null;
  }

  // Try to find the result with the format "filePath:line"
  const key = `${filePath}:${line}`;
  let result = data.results[key];

  // If not found, try with just the filename
  if (!result) {
    const fileName = filePath.split("/").pop() || "";
    // Look for keys that end with "fileName:line"
    const matchingKey = Object.keys(data.results).find(k => 
      k.endsWith(`/${fileName}:${line}`) || k.endsWith(`:${fileName}:${line}`)
    );
    
    if (matchingKey) {
      result = data.results[matchingKey];
    }
  }

  // If result found, return the last step and total steps count
  if (result && result.steps && result.steps.length > 0) {
    return {
      step: result.steps[result.steps.length - 1],
      totalSteps: result.steps.length
    };
  }

  return null;
}

/**
 * Decode Base64 string
 */
export function decodeBase64(base64: string): string {
  try {
    return Buffer.from(base64, "base64").toString();
  } catch (error) {
    console.error("Error decoding base64:", error);
    return "Error decoding content";
  }
}
