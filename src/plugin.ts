import type { Plugin, PluginInput, Hooks } from '@opencode-ai/plugin';
import type { Part } from '@opencode-ai/sdk';
import { log, LOG } from '../logger';
import { createCommandExecuteHandler, loadInstruction, getState } from './commands';
import { ulid } from 'ulid';

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
      _input: {
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

      const lastUserMsg = [...messages].reverse().find((m) => m.info.role === 'user');

      if (!lastUserMsg) {
        return;
      }

      log.debug(LOG.HOOK, 'Processing messages.transform', {
        messageCount: messages.length,
      });

      const now = Date.now();
      const instruction = loadInstruction();
      const callID = generateId('usin');

      log.info(LOG.HOOK, 'Creating synthetic assistant message with user_instructions tool', {
        messageId: lastUserMsg.info.id,
      });

      const sessionId = lastUserMsg.info.sessionID;
      const userInfo = lastUserMsg.info;

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
              output: instruction,
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
    },
  };
}
