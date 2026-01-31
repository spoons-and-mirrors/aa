import { ulid } from 'ulid';

export function isDeepSeekOrKimi(providerID?: string, modelID?: string): boolean {
  if (!providerID && !modelID) return false;
  
  const provider = providerID?.toLowerCase() ?? '';
  const model = modelID?.toLowerCase() ?? '';
  
  return provider.includes('deepseek') || 
         provider.includes('kimi') || 
         model.includes('deepseek') || 
         model.includes('kimi');
}

export function createSyntheticToolPart(
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

export function generateId(prefix: string): string {
  return `${prefix}_${ulid()}`;
}
