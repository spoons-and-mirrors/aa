# Ask Away - a sobering follow up

An OpenCode plugin that ensures AI assistants always hand control back to you after completing work.

## What it does

Injects a `user_instructions` tool on every user message, reminding the AI to:

- Use the question tool after completing requests or reaching stopping points
- Ask intelligent questions about pressing matters
- Keep you in control of the conversation

## Commands

- `/aa` - Display the current instruction
- `/aa <instruction>` - Update the instruction (persists to `~/.config/opencode/aa-instruction.txt`)
- `/aa --restore` - Restore the original default instruction
- `/aa --o` - Toggle plugin on/off
- 
## License

MIT
