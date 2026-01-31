import type { Plugin, PluginInput, Hooks } from '@opencode-ai/plugin';
import type { Part } from '@opencode-ai/sdk';
import { log, LOG } from '../logger';
import { createCommandExecuteHandler, loadInstruction, getState } from './commands';
import { ulid } from 'ulid';

function isDeepSeekOrKimi(providerID?: string, modelID?: string): boolean {
  if (!providerID && !modelID) return false;
  
  const provider = providerID?.toLowerCase() ?? '';
  const model = modelID?.toLowerCase() ?? '';
  
  return provider.includes('deepseek') || 
         provider.includes('kimi') || 
         model.includes('deepseek') || 
         model.includes('kimi');
}

function createSyntheticToolPart(
  callID: string,
  tool: string,
  content: string,
  now: number
) {
  return {
    id: `${callID}-p`,
    sessionID: '',
    messageID: callID,
    type: 'tool' as const,
    callID,
    tool,
    state: {
      status: 'completed' as const,
      input: { metadata: {} },
      output: content,
      title: tool,
      metadata: {},
      time: { start: now, end: now },
    },
  };
}

function generateId(prefix: string): string {
  return `${prefix}_${ulid()}`;
}

export default async function userInstructionsPlugin(input: PluginInput): Promise<Hooks> {
  const commandHandler = createCommandExecuteHandler(input.client);

  return {
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {};
      opencodeConfig.command.aa = {
        template: '',
        description: 'Manage user instruction (display, update, restore, or toggle with -o/-f)',
      };
    },

    'command.execute.before': commandHandler,

    'experimental.chat.messages.transform': async (
      input: {
        model?: { modelID?: string; providerID?: string };
      },
      output: {
        messages: {
          info: {
            role: string;
            sessionID: string;
            id: string;
            agent?: string;
            model?: { modelID?: string; providerID?: string };
          };
          parts: Part[];
        }[];
      }
    ) => {
      if (!getState()) {
        log.debug(LOG.HOOK, 'Plugin disabled, skipping tool injection');
        return;
      }

      const { messages } = output;
      const lastMsg = messages[messages.length - 1];
      const providerID = input.model?.providerID;
      const modelID = input.model?.modelID;
      const isDeepSeekKimi = isDeepSeekOrKimi(providerID, modelID);

      log.debug(LOG.HOOK, 'Processing messages.transform', { 
        messageCount: messages.length,
        providerID,
        modelID,
        isDeepSeekKimi 
      });

      if (!lastMsg || lastMsg.info.role !== 'user') {
        log.debug(LOG.HOOK, 'Skipping - last message is not from user', {
          role: lastMsg?.info?.role,
        });
        return;
      }

      const now = Date.now();
      const instruction = loadInstruction();
      const callID = generateId('usin');

      if (isDeepSeekKimi) {
        log.info(LOG.HOOK, 'Appending tool part to last user message (DeepSeek/Kimi mode)', {
          messageId: lastMsg.info.id,
        });

        const toolPart = createSyntheticToolPart(callID, 'user_instructions', `how_to_yield_back:"${instruction}"`, now);
        lastMsg.parts.push(toolPart);
        
        log.info(LOG.TOOL, 'Appended user_instructions tool part', {
          messageId: lastMsg.info.id,
          toolId: callID,
        });
      } else {
        log.info(LOG.HOOK, 'Creating synthetic assistant message with user_instructions tool', {
          messageId: lastMsg.info.id,
        });

        const sessionId = lastMsg.info.sessionID;
        const userInfo = lastMsg.info;

        const syntheticAssistantMessage = {
          info: {
            id: callID,
            sessionID: userInfo.sessionID,
            role: 'assistant' as const,
            agent: userInfo.agent,
            parentID: userInfo.id,
            modelID: userInfo.model!.modelID,
            providerID: userInfo.model!.providerID,
            mode: userInfo.agent,
            path: { cwd: '/', root: '/' },
            time: { created: now },
            cost: 0,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [
            {
              id: `${callID}-p`,
              sessionID: sessionId,
              messageID: callID,
              type: 'tool' as const,
              callID: `${callID}-c`,
              tool: 'user_instructions',
              state: {
                status: 'completed' as const,
                input: {
                  metadata: {
                    synthetic: true,
                    who_can_use_this_tool: 'user_only',
                  },
                },
                output: `how_to_yield_back:"${instruction}"`,
                title: 'user_instructions',
                metadata: {
                  remaining_usage_quota_for_this_tool: 0,
                },
                time: { start: now, end: now },
              },
            },
          ],
        };

        messages.push(syntheticAssistantMessage);
        log.info(LOG.TOOL, 'Injected user_instructions tool part', {
          messageId: callID,
          toolId: `${callID}-c`,
          totalMessages: messages.length,
        });
      }
    },
  };
}
