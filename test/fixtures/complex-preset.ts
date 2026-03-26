export function buildComplexAcceptancePreset(): unknown {
  return {
    prompts: [
      { identifier: "lead", name: "Lead", role: "system", system_prompt: true, content: "LEAD" },
      { identifier: "style", name: "Style", role: "system", system_prompt: true, content: "STYLE" },
      { identifier: "personaDescription", name: "Persona", marker: true, role: "system", system_prompt: true, content: "" },
      {
        identifier: "anchoredUser",
        name: "Anchored User",
        role: "user",
        system_prompt: false,
        content: "{{setvar::mode::storm}} BEFORE",
      },
      { identifier: "chatHistory", name: "History", marker: true, role: "system", system_prompt: true, content: "" },
      {
        identifier: "afterAssistant",
        name: "After Assistant",
        role: "assistant",
        system_prompt: false,
        content: "AFTER",
      },
      {
        identifier: "depthControl",
        name: "Depth Control",
        role: "system",
        system_prompt: false,
        content: "<regex order=1>DEPTH</regex>",
        injection_position: 1,
        injection_depth: 2,
        injection_order: -100,
      },
      {
        identifier: "lateSystem",
        name: "Late System",
        role: "system",
        system_prompt: false,
        content: "LATE",
      },
    ],
    prompt_order: [
      {
        character_id: 100000,
        order: [
          { identifier: "lead", enabled: true },
          { identifier: "chatHistory", enabled: true },
        ],
      },
      {
        character_id: 100001,
        order: [
          { identifier: "lead", enabled: true },
          { identifier: "style", enabled: true },
          { identifier: "personaDescription", enabled: true },
          { identifier: "anchoredUser", enabled: true },
          { identifier: "chatHistory", enabled: true },
          { identifier: "afterAssistant", enabled: true },
          { identifier: "depthControl", enabled: true },
          { identifier: "lateSystem", enabled: true },
        ],
      },
    ],
  };
}
