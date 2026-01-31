import type { Plugin, PluginInput, Hooks } from '@opencode-ai/plugin';
import type { Part } from '@opencode-ai/sdk';
import { log, LOG } from './logger';
import { createCommandExecuteHandler, loadInstruction } from './src/commands';

export default async function userInstructionsPlugin(input: PluginInput): Promise<Hooks> {
  const commandHandler = createCommandExecuteHandler(input.client);

  return {
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {};
      opencodeConfig.command.aa = {
        template: '',
        description: 'Manage user instruction (display, update, or restore with --restore)',
      };
    },

    'command.execute.before': commandHandler,

    'experimental.chat.messages.transform': async (
      _input: {},
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
      const { messages } = output;
      const lastMsg = messages[messages.length - 1];

      log.debug(LOG.HOOK, 'Processing messages.transform', { messageCount: messages.length });

      if (!lastMsg || lastMsg.info.role !== 'user') {
        log.debug(LOG.HOOK, 'Skipping - last message is not from user', {
          role: lastMsg?.info?.role,
        });
        return;
      }

      log.info(LOG.HOOK, 'Creating synthetic assistant message with user_instructions tool', {
        messageId: lastMsg.info.id,
      });

      const now = Date.now();
      const random = Math.random().toString(16).slice(2, 6);
      const syntheticId = `usin_${now.toString(16)}${random}`;
      const sessionId = lastMsg.info.sessionID;
      const userInfo = lastMsg.info;
      const instruction = loadInstruction();

      const syntheticAssistantMessage = {
        info: {
          id: syntheticId,
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
            id: `${syntheticId}-p`,
            sessionID: sessionId,
            messageID: syntheticId,
            type: 'tool' as const,
            callID: `${syntheticId}-c`,
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
        messageId: syntheticId,
        toolId: `${syntheticId}-c`,
        totalMessages: messages.length,
      });
    },
  };
}
