"use server";

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

type TranslateFields = {
  given_en?: string;
  family_name_en?: string;
  father_name_en?: string;
  grandfather_name_en?: string;
  notes_en?: string;
};

type TranslateResult = {
  given_ar?: string;
  family_name_ar?: string;
  father_name_ar?: string;
  grandfather_name_ar?: string;
  notes_ar?: string;
};

export async function translateToArabic(fields: TranslateFields): Promise<{ success: true; data: TranslateResult } | { success: false; error: string }> {
  const toTranslate = Object.entries(fields).filter(([, v]) => v && v.trim());
  if (toTranslate.length === 0) return { success: true, data: {} };

  const lines = toTranslate.map(([k, v]) => `${k}: ${v}`).join("\n");

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Translate these personal name fields from English to Arabic. For proper names (given names, family names, father/grandfather names), transliterate them phonetically into Arabic script. For notes, translate the meaning. Return ONLY a JSON object with the same keys but ending in _ar instead of _en. No explanation.

${lines}`,
        },
      ],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false, error: "Translation response malformed." };
    const data = JSON.parse(jsonMatch[0]) as TranslateResult;
    return { success: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Translation failed.";
    return { success: false, error: msg };
  }
}
