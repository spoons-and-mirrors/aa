import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { OpencodeClient } from './types.js';

const INSTRUCTION_FILE = join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.config',
  'opencode',
  'aa-instruction.txt'
);

const DEFAULT_INSTRUCTION =
  'how_to_yield_back:"After completing user request or reached a stopping point, YOU MUST ALWAYS USE THE QUESTION TOOL TO HAND THE CONVERSATION BACK TO THE USER. The question tool allows for great user experience and allows you to drive some of the process with your suggestions, ultimately, steering the user towards the most critical points in need of resolution. When using the question tool, produce logical, may I say intelligent questions, in regards of the most pressing matters. Use the question tool PROPERLY: be mindful of the expected payload and use all of the question tool capabilities to the fullest extent possible. Always remember that the user is in control of the conversation and your role is to assist them in achieving their goals effectively."';

// In-memory state - always starts as enabled
let pluginEnabled = true;

/**
 * Get the current plugin state
 */
export function getState(): boolean {
  return pluginEnabled;
}

/**
 * Toggle the plugin state
 */
export function toggleState(): boolean {
  pluginEnabled = !pluginEnabled;
  return pluginEnabled;
}

/**
 * Ensure the instruction file exists and return its content
 */
export function loadInstruction(): string {
  try {
    const content = readFileSync(INSTRUCTION_FILE, 'utf-8');
    return content.trim();
  } catch {
    mkdirSync(dirname(INSTRUCTION_FILE), { recursive: true });
    writeFileSync(INSTRUCTION_FILE, DEFAULT_INSTRUCTION, 'utf-8');
    return DEFAULT_INSTRUCTION;
  }
}

/**
 * Extract the instruction content from the storage format
 */
export function extractInstruction(raw: string): string {
  const match = raw.match(/^how_to_yield_back:"(.+)"$/s);
  if (match) {
    return match[1];
  }
  return raw;
}

/**
 * Save a new instruction (wraps in storage format if needed)
 */
export function saveInstruction(instruction: string): void {
  mkdirSync(dirname(INSTRUCTION_FILE), { recursive: true });
  
  // If not already in storage format, wrap it
  if (!instruction.match(/^how_to_yield_back:".+"$/s)) {
    instruction = `how_to_yield_back:"${instruction}"`;
  }
  
  writeFileSync(INSTRUCTION_FILE, instruction, 'utf-8');
}

/**
 * Create the command execute handler for the aa command
 */
export function createCommandExecuteHandler(client: OpencodeClient) {
  return async (input: { command: string; sessionID: string; arguments: string }) => {
    if (input.command !== 'aa') return;

    const args = input.arguments.trim();

    try {
      if (!args) {
        const current = extractInstruction(loadInstruction());
        const enabled = getState();
        await sendIgnoredMessage(
          client,
          input.sessionID,
          `Ask Away Commands:
  /aa                  Show this help and current instruction
  /aa prompt goes here Set custom instruction
  /aa -r, --restore    Restore default instruction
  /aa -o               Toggle plugin on/off

Plugin Status: ${enabled ? 'ENABLED' : 'DISABLED'}

Instructions:

${current}`
        );
      } else if (args === '--restore' || args === '-r') {
        saveInstruction(DEFAULT_INSTRUCTION);
        await sendIgnoredMessage(
          client,
          input.sessionID,
          `Instruction restored to default:\n\n${extractInstruction(DEFAULT_INSTRUCTION)}`
        );
      } else if (args === '-o') {
        const newState = toggleState();
        await sendIgnoredMessage(client, input.sessionID, `[ASK AWAY] ${newState ? 'Enabled' : 'Disabled'}`);
      } else {
        saveInstruction(args);
        await sendIgnoredMessage(client, input.sessionID, `Instruction updated to:\n\n${extractInstruction(args)}`);
      }
    } catch (error) {
      await sendIgnoredMessage(
        client,
        input.sessionID,
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    throw new Error('__AA_COMMAND_HANDLED__');
  };
}

/**
 * Send an ignored message to the user
 */
export async function sendIgnoredMessage(
  client: OpencodeClient,
  sessionId: string,
  message: string
): Promise<void> {
  await client.session.prompt({
    path: { id: sessionId },
    body: {
      noReply: true,
      parts: [{ type: 'text', text: message, ignored: true }],
    },
  });
}
