const OPENROUTER_BASE = "https://openrouter.ai/api/v1"
const FREE_MODEL = "deepseek/deepseek-chat-v3-0324:free"

export async function callAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 500
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    console.error("OPENROUTER_API_KEY environment variable is not defined.")
    return ""
  }

  const body = JSON.stringify({
    model: FREE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  })

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://freeclipboard.com",
    "X-Title": "FreeClipboard",
  }

  try {
    console.log(`Calling OpenRouter with model: ${FREE_MODEL}`)
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers,
      body,
    })

    if (response.ok) {
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (content) return content.trim()
      console.warn("Primary model returned empty content")
    } else {
      const errorText = await response.text()
      console.warn(`Primary model failed (status ${response.status}): ${errorText}`)
    }
  } catch (err) {
    console.error("Error calling primary model:", err)
  }

  console.log("Attempting fallback to openrouter/free...")
  try {
    const fallbackBody = JSON.stringify({
      model: "openrouter/free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    })

    const fallbackResponse = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers,
      body: fallbackBody,
    })

    if (fallbackResponse.ok) {
      const data = await fallbackResponse.json()
      const content = data?.choices?.[0]?.message?.content
      if (content) return content.trim()
    } else {
      const errorText = await fallbackResponse.text()
      console.error(`Fallback model failed (status ${fallbackResponse.status}): ${errorText}`)
    }
  } catch (err) {
    console.error("Error calling fallback model:", err)
  }

  return ""
}
