import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { resolveVariables, detectTriggerAtCursor } from '@/lib/snippets';

interface Snippet {
  id: string;
  trigger_key: string;
  content: string;
  use_count: number;
}

interface UseSnippetsOptions {
  user: { id: string; email?: string; name?: string } | null;
  addToast?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

export function useSnippets({ user, addToast }: UseSnippetsOptions) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement | HTMLInputElement>>(new Map());
  const snippetMap = useRef<Map<string, Snippet>>(new Map());

  const fetchSnippets = useCallback(async () => {
    if (!user) return;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('snippets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const list = data || [];
      setSnippets(list);

      snippetMap.current.clear();
      list.forEach((s) => snippetMap.current.set(s.trigger_key, s));
    } catch (err) {
      console.error('Fetch snippets error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSnippets();
  }, [fetchSnippets]);

  const registerTextarea = useCallback(
    (id: string, el: HTMLTextAreaElement | HTMLInputElement | null) => {
      if (el) {
        textareaRefs.current.set(id, el);
      } else {
        textareaRefs.current.delete(id);
      }
    },
    []
  );

  const handleSnippetExpansion = useCallback(
    (
      textarea: HTMLTextAreaElement | HTMLInputElement,
      context: { url?: string; title?: string } = {}
    ) => {
      const cursorPos = textarea.selectionStart;
      if (cursorPos === null) return false;
      const text = textarea.value;

      const detected = detectTriggerAtCursor(text, cursorPos);
      if (!detected) return false;

      const snippet = snippetMap.current.get(detected.trigger);
      if (!snippet) return false;

      const resolved = resolveVariables(snippet.content, {
        name: user?.name,
        email: user?.email,
        url: context.url,
        title: context.title,
      });

      const newText =
        text.substring(0, detected.startPos) + resolved + text.substring(detected.endPos);

      textarea.value = newText;

      const newCursorPos = detected.startPos + resolved.length;
      textarea.selectionStart = newCursorPos;
      textarea.selectionEnd = newCursorPos;

      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      fetch('/api/snippets/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: detected.trigger }),
      }).catch(() => {});

      if (addToast) {
        addToast(`${detected.trigger} expanded`, 'success');
      }

      return true;
    },
    [user, addToast]
  );

  const attachToTextarea = useCallback(
    (
      id: string,
      context: { url?: string; title?: string } = {}
    ) => {
      const el = textareaRefs.current.get(id);
      if (!el) return;

      const handler = () => {
        handleSnippetExpansion(el, context);
      };

      el.addEventListener('keyup', handler);
      el.addEventListener('click', handler);

      return () => {
        el.removeEventListener('keyup', handler);
        el.removeEventListener('click', handler);
      };
    },
    [handleSnippetExpansion]
  );

  return {
    snippets,
    loading,
    registerTextarea,
    attachToTextarea,
    fetchSnippets,
    snippetMap: snippetMap.current,
  };
}
