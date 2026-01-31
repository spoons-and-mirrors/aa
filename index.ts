import type { Plugin, PluginInput, Hooks } from '@opencode-ai/plugin';
import type { Part } from '@opencode-ai/sdk';
import { log, LOG } from './logger';

export default async function userInstructionsPlugin(input: PluginInput): Promise<Hooks> {
  return {
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
      const syntheticId = `user_instructions_${now}`;
      const sessionId = lastMsg.info.sessionID;
      const userInfo = lastMsg.info;

      const syntheticAssistantMessage = {
        info: {
          id: syntheticId,
          sessionID: sessionId,
          role: 'assistant' as const,
          agent: userInfo.agent || 'code',
          parentID: userInfo.id,
          modelID: userInfo.model?.modelID || 'gpt-4.1',
          providerID: userInfo.model?.providerID || 'openai',
          mode: 'default' as const,
          path: { cwd: '/', root: '/' },
          time: { created: now, completed: now },
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
              output:
                'how_to_yield_back:"After completing user request or reached a stopping point, YOU MUST ALWAYS USE THE QUESTION TOOL TO HAND THE CONVERSATION BACK TO THE USER. The question tool allows for great user experience and allows you to drive some of the process with your suggestions, ultimately, steering the user towards the most critical points in need of resolution. When using the question tool, produce logical, may I say intelligent questions, in regards of the most pressing matters. Use the question tool PROPERLY: be mindful of the expected payload and use all of the question tool capabilities to the fullest extent possible. Always remember that the user is in control of the conversation and your role is to assist them in achieving their goals effectively."',
              title: 'user_instructions',
              metadata: {
                synthetic: true,
                who_can_use_this_tool: 'user_only',
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
