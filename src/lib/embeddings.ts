import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Standard vector size for public.clip_embeddings table.
 * All models are padded or scaled to this size to maintain a single uniform DB column size.
 */
export const EMBEDDING_DIMENSION = 1536;

/**
 * Deterministic unit vector hash fallback for offline/air-gapped environments.
 * Ensures the system never crashes and keeps basic searches functional even without API keys.
 */
export function getDeterministicEmbedding(text: string): number[] {
  const vector = new Array(EMBEDDING_DIMENSION).fill(0);
  
  if (!text) {
    vector[0] = 1.0;
    return vector;
  }

  // Generate values based on text character codes and positions
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Use prime multipliers to distribute hashing
    const index1 = (charCode * 31 + i) % EMBEDDING_DIMENSION;
    const index2 = (charCode * 17 + i * 7) % EMBEDDING_DIMENSION;
    
    vector[index1] += Math.sin(charCode + i);
    vector[index2] += Math.cos(charCode - i);
  }

  // Calculate magnitude to normalize
  let sumOfSquares = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    sumOfSquares += vector[i] * vector[i];
  }
  
  const magnitude = Math.sqrt(sumOfSquares) || 1;
  
  // Normalize vector to unit length (so cosine similarity maps nicely)
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    vector[i] = vector[i] / magnitude;
  }

  return vector;
}

/**
 * Pads or truncates a number array to standard EMBEDDING_DIMENSION.
 */
function normalizeDimension(vector: number[]): number[] {
  if (vector.length === EMBEDDING_DIMENSION) {
    return vector;
  }
  
  if (vector.length > EMBEDDING_DIMENSION) {
    return vector.slice(0, EMBEDDING_DIMENSION);
  }
  
  const padded = [...vector];
  const diff = EMBEDDING_DIMENSION - vector.length;
  for (let i = 0; i < diff; i++) {
    padded.push(0);
  }
  return padded;
}

/**
 * Generates a 1536-dimensional vector embedding for the given text.
 * Multi-provider architecture prioritizing Gemini -> OpenAI -> Hugging Face -> Offline Fallback.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    return getDeterministicEmbedding('');
  }

  // 1. Prioritize Google Gemini Embeddings (via text-embedding-004)
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const response = await model.embedContent(cleanText);
      const values = response?.embedding?.values;
      if (Array.isArray(values) && values.length > 0) {
        return normalizeDimension(values);
      }
    } catch (err) {
      console.warn('Gemini embedding failed, trying next provider:', err);
    }
  }

  // 2. Fallback to OpenAI API (text-embedding-3-small)
  const openAIKey = process.env.OPENAI_API_KEY;
  if (openAIKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIKey}`,
        },
        body: JSON.stringify({
          input: cleanText,
          model: 'text-embedding-3-small',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const values = result?.data?.[0]?.embedding;
        if (Array.isArray(values) && values.length > 0) {
          return normalizeDimension(values);
        }
      } else {
        console.warn(`OpenAI embedding responded with status: ${response.status}`);
      }
    } catch (err) {
      console.warn('OpenAI embedding failed, trying next provider:', err);
    }
  }

  // 3. Fallback to Hugging Face Free Inference API (sentence-transformers/all-MiniLM-L6-v2)
  try {
    const hfToken = process.env.HF_TOKEN;
    const response = await fetch(
      'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {}),
        },
        body: JSON.stringify({ inputs: cleanText }),
      }
    );

    if (response.ok) {
      const result = await response.json();
      let values = Array.isArray(result) ? result : [];
      
      // HF might wrap vectors inside an extra nested array
      if (Array.isArray(values[0])) {
        values = values[0];
      }
      
      const numericValues = values.map(Number).filter((n) => !isNaN(n));
      if (numericValues.length > 0) {
        return normalizeDimension(numericValues);
      }
    } else {
      console.warn(`HuggingFace embedding responded with status: ${response.status}`);
    }
  } catch (err) {
    console.warn('Hugging Face embedding failed, utilizing offline deterministic fallback:', err);
  }

  // 4. Ultimate Local Fallback (Deterministic Cosine Unit Vector)
  return getDeterministicEmbedding(cleanText);
}
