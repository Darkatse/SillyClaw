export function buildSinglePromptPreset(content: string) {
  return {
    prompts: [{ identifier: "main", role: "system", system_prompt: true, content }],
    prompt_order: [{ identifier: "main", enabled: true }],
  };
}
