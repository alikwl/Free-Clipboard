import { callAI } from '@/lib/openrouter';

export interface AutomationRunResult {
  status: 'success' | 'failed' | 'skipped';
  logs: string[];
  errorMessage?: string;
}

/**
 * Standard utility to normalize tag strings
 */
function normalizeTag(tag: string): string {
  return tag.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
}

/**
 * central engine to execute an automation rule safely on the server side
 */
export async function executeAutomation(
  automation: any,
  clip: any,
  supabase: any,
  isDryRun: boolean = false
): Promise<AutomationRunResult> {
  const logs: string[] = [];
  logs.push(`[START] Initializing rule "${automation.name}" (ID: ${automation.id})`);
  
  if (isDryRun) {
    logs.push(`[DRY-RUN] Dry run enabled. Changes will not be committed to the database.`);
  }

  try {
    // 1. INFINITE LOOP RECORSION PREVENTION
    if (!isDryRun && clip?.id) {
      const tenSecondsAgo = new Date();
      tenSecondsAgo.setSeconds(tenSecondsAgo.getSeconds() - 10);
      
      const { data: recentRuns, error: loopError } = await supabase
        .from('automation_runs')
        .select('id')
        .eq('clip_id', clip.id)
        .eq('automation_id', automation.id)
        .gt('created_at', tenSecondsAgo.toISOString());

      if (loopError) {
        console.warn('Loop prevention logs fetch failed:', loopError.message);
      }

      if (recentRuns && recentRuns.length >= 2) {
        const errorMsg = 'Halted: Potential infinite loop recursion detected.';
        logs.push(`[CRITICAL] LOOP BREAKER: This automation has already run ${recentRuns.length} times on clip ${clip.id} in the past 10 seconds! Halting execution.`);
        return {
          status: 'skipped',
          logs,
          errorMessage: errorMsg,
        };
      }
    }

    // Load additional metadata if needed for conditions
    let metadata: any = null;
    if (clip?.id) {
      const { data: metaData } = await supabase
        .from('clip_metadata')
        .select('*')
        .eq('clip_id', clip.id)
        .single();
      metadata = metaData;
    }

    // 2. CONDITION CHECKERS
    const conditions = Array.isArray(automation.conditions) ? automation.conditions : [];
    logs.push(`[CONDITIONS] Evaluating ${conditions.length} conditions...`);
    
    for (let idx = 0; idx < conditions.length; idx++) {
      const cond = conditions[idx];
      let matched = false;
      const type = cond.type;
      const operator = cond.operator || 'equals';
      const val = String(cond.value || '').toLowerCase();
      const content = String(clip.content || '').toLowerCase();
      
      logs.push(`[CHECK] Condition [${idx + 1}]: "${type}" ${operator} "${cond.value}"`);

      switch (type) {
        case 'content_contains':
          matched = content.includes(val);
          break;
          
        case 'content_type': {
          const clipType = (metadata?.clip_type || clip.type || 'text').toLowerCase();
          matched = operator === 'equals' ? clipType === val : clipType !== val;
          break;
        }
          
        case 'title_contains': {
          const clipTitle = String(clip.title || '').toLowerCase();
          matched = clipTitle.includes(val);
          break;
        }
          
        case 'folder_equals': {
          // If value is folder name, look it up, or compare folder_id directly
          let targetFolderId = val;
          if (val && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val)) {
            // Find folder by name
            const { data: folder } = await supabase
              .from('folders')
              .select('id')
              .eq('user_id', automation.user_id)
              .ilike('name', val)
              .single();
            if (folder) targetFolderId = folder.id.toLowerCase();
          }
          const folderIdStr = String(clip.folder_id || '').toLowerCase();
          matched = operator === 'equals' ? folderIdStr === targetFolderId : folderIdStr !== targetFolderId;
          break;
        }
          
        case 'tag_exists': {
          const tagsList = Array.isArray(clip.tags) ? clip.tags.map((t: string) => t.toLowerCase()) : [];
          matched = tagsList.includes(val);
          break;
        }
          
        case 'length_greater_than': {
          const charLen = clip.content?.length || 0;
          const targetLen = parseInt(val) || 0;
          matched = charLen > targetLen;
          break;
        }
          
        case 'sensitive_data_detected': {
          const sensitiveRegex = /api[_-]?key|secret|password|passwd|token|sk-or-|bearer|auth[_-]?token|db[_-]?url|mongodb\+srv|postgres:\/\/|aws[_-]?key/i;
          const containsSecrets = sensitiveRegex.test(clip.content || '');
          matched = operator === 'equals' ? containsSecrets === true : containsSecrets === false;
          break;
        }
          
        case 'url_domain_matches': {
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const urls = clip.content?.match(urlRegex) || [];
          matched = urls.some((u: string) => {
            try {
              const hostname = new URL(u).hostname.toLowerCase();
              return hostname.includes(val);
            } catch {
              return u.toLowerCase().includes(val);
            }
          });
          break;
        }
          
        default:
          logs.push(`[WARN] Unknown condition type "${type}". Skipping condition match.`);
          matched = true; // Fall through safely
      }

      if (!matched) {
        logs.push(`[CONDITION] Condition [${idx + 1}] FAILED! Skipping automation execution.`);
        return {
          status: 'skipped',
          logs,
        };
      }
      
      logs.push(`[CONDITION] Condition [${idx + 1}] MATCHED.`);
    }

    // 3. ACTION EXECUTORS
    const actions = Array.isArray(automation.actions) ? automation.actions : [];
    logs.push(`[ACTIONS] Executing ${actions.length} actions...`);
    
    // Accumulate all db updates to clips table into a single atomic write at the end!
    const clipUpdates: Record<string, any> = {};
    const metadataUpdates: Record<string, any> = {};
    let shouldUpdateClip = false;
    let shouldUpdateMetadata = false;

    for (let idx = 0; idx < actions.length; idx++) {
      const act = actions[idx];
      const type = act.type;
      const val = act.value;
      
      logs.push(`[ACTION] [${idx + 1}]: "${type}" (config: "${val || 'none'}")`);

      switch (type) {
        case 'move_to_folder': {
          let folderId = val;
          // Check if folder value is a UUID, otherwise look it up or create it!
          if (val && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val)) {
            // Find by name
            const { data: folder } = await supabase
              .from('folders')
              .select('id')
              .eq('user_id', automation.user_id)
              .ilike('name', val)
              .single();
              
            if (folder) {
              folderId = folder.id;
              logs.push(`[FOLDER] Folder "${val}" found with ID: ${folderId}`);
            } else if (!isDryRun) {
              // Create it dynamically!
              const { data: newFolder, error: folderErr } = await supabase
                .from('folders')
                .insert({
                  user_id: automation.user_id,
                  name: val.trim(),
                })
                .select('id')
                .single();
              
              if (folderErr || !newFolder) {
                logs.push(`[ERROR] Failed to auto-create folder "${val}": ${folderErr?.message}`);
                throw new Error(`Folder creation error: ${folderErr?.message}`);
              }
              folderId = newFolder.id;
              logs.push(`[FOLDER] Dynamically created folder "${val}" with ID: ${folderId}`);
            } else {
              logs.push(`[FOLDER] [DRY-RUN] Will dynamically create folder "${val}"`);
              folderId = 'dry-run-folder-id';
            }
          }
          clipUpdates.folder_id = folderId;
          shouldUpdateClip = true;
          logs.push(`[ACTION] Queued folder move to ${val} (${folderId})`);
          break;
        }

        case 'add_tag': {
          const cleanTag = normalizeTag(val || '');
          if (cleanTag) {
            const currentTags = Array.isArray(clipUpdates.tags) 
              ? clipUpdates.tags 
              : Array.isArray(clip.tags) 
                ? [...clip.tags] 
                : [];
            
            if (!currentTags.includes(cleanTag)) {
              currentTags.push(cleanTag);
              clipUpdates.tags = currentTags.slice(0, 6);
              shouldUpdateClip = true;
              logs.push(`[ACTION] Queued tag addition: ${cleanTag}`);
            } else {
              logs.push(`[ACTION] Tag ${cleanTag} already exists, skipping tag addition.`);
            }
          }
          break;
        }

        case 'generate_title': {
          if (!isDryRun) {
            const sysPrompt = 'Generate a clean, highly professional, descriptive title (maximum 5 words, no punctuation, no quotes) for this clipboard note.';
            const generated = await callAI(sysPrompt, clip.content, 100);
            if (generated) {
              clipUpdates.title = generated.replace(/["']/g, '').trim();
              shouldUpdateClip = true;
              logs.push(`[ACTION] Generated AI title: "${clipUpdates.title}"`);
            } else {
              logs.push(`[WARN] AI Title service returned empty response. Skipping title updates.`);
            }
          } else {
            logs.push(`[ACTION] [DRY-RUN] Will run AI title generator.`);
          }
          break;
        }

        case 'summarize': {
          if (!isDryRun) {
            const sysPrompt = 'Generate a concise, 1-bullet summary (maximum 20 words) explaining this clip content.';
            const summary = await callAI(sysPrompt, clip.content, 150);
            if (summary) {
              // Upsert summary into metadata properties
              metadataUpdates.topics = [...new Set([...(metadata?.topics || []), 'AI SUMMARY'])];
              metadataUpdates.keywords = [...new Set([...(metadata?.keywords || []), 'summary'])];
              
              const currentEntities = metadata?.entities || {};
              metadataUpdates.entities = {
                ...currentEntities,
                ai_summary: summary.trim()
              };
              shouldUpdateMetadata = true;
              logs.push(`[ACTION] Generated AI summary: "${summary.trim()}"`);
            } else {
              logs.push(`[WARN] AI Summary service failed. Skipping summary.`);
            }
          } else {
            logs.push(`[ACTION] [DRY-RUN] Will run AI summarizer.`);
          }
          break;
        }

        case 'extract_tasks': {
          if (!isDryRun) {
            const sysPrompt = `Analyze the clip content. If it contains actionable tasks or actionable bug items, extract them as brief checklist bullet items. 
Return a simple list of tasks (e.g. "- fix stripe API checkout\\n- draft roadmap summary"). If no tasks are found, respond with "none".`;
            const tasksList = await callAI(sysPrompt, clip.content, 250);
            
            if (tasksList && tasksList.toLowerCase().trim() !== 'none') {
              // Append to tag list
              const currentTags = Array.isArray(clipUpdates.tags) 
                ? clipUpdates.tags 
                : Array.isArray(clip.tags) 
                  ? [...clip.tags] 
                  : [];
                  
              if (!currentTags.includes('TASKS')) currentTags.push('TASKS');
              if (!currentTags.includes('STATUS_PENDING')) currentTags.push('STATUS_PENDING');
              
              clipUpdates.tags = currentTags.slice(0, 6);
              shouldUpdateClip = true;

              // Save in metadata properties
              const currentEntities = metadata?.entities || {};
              metadataUpdates.entities = {
                ...currentEntities,
                extracted_tasks: tasksList.trim().split('\n').map(x => x.replace(/^-\s*/, '').trim()).filter(Boolean)
              };
              shouldUpdateMetadata = true;

              logs.push(`[ACTION] Extracted task items: ${tasksList.trim()}`);
            } else {
              logs.push(`[ACTION] No task list extracted by AI.`);
            }
          } else {
            logs.push(`[ACTION] [DRY-RUN] Will run AI task extractor.`);
          }
          break;
        }

        case 'mark_sensitive': {
          metadataUpdates.clip_type = 'secure_credential';
          
          const currentEntities = metadata?.entities || {};
          metadataUpdates.entities = {
            ...currentEntities,
            is_sensitive: true,
            sensitive_marked_at: new Date().toISOString()
          };
          shouldUpdateMetadata = true;
          logs.push(`[ACTION] Marked clip category as secure_credential.`);
          break;
        }

        case 'pin':
          clipUpdates.pinned = true;
          shouldUpdateClip = true;
          logs.push(`[ACTION] Queued clip pin operation.`);
          break;

        case 'archive_duplicate': {
          if (!isDryRun) {
            // Find duplicates (matching same content for user)
            const { data: duplicates } = await supabase
              .from('clips')
              .select('id')
              .eq('user_id', automation.user_id)
              .eq('content', clip.content)
              .neq('id', clip.id);

            if (duplicates && duplicates.length > 0) {
              const dupIds = duplicates.map((d: any) => d.id);
              const { error: delErr } = await supabase
                .from('clips')
                .delete()
                .in('id', dupIds);
                
              if (delErr) {
                logs.push(`[ERROR] Duplicate archive delete failed: ${delErr.message}`);
              } else {
                logs.push(`[ACTION] Archiving duplicate check complete. Deleted ${duplicates.length} duplicate clip(s) (IDs: ${dupIds.join(', ')}).`);
              }
            } else {
              logs.push(`[ACTION] Duplicate check: Clip is unique. No duplicate clips found.`);
            }
          } else {
            logs.push(`[ACTION] [DRY-RUN] Will search and delete duplicate clips.`);
          }
          break;
        }

        case 'create_sticky_note': {
          const currentTags = Array.isArray(clipUpdates.tags) 
            ? clipUpdates.tags 
            : Array.isArray(clip.tags) 
              ? [...clip.tags] 
              : [];
          if (!currentTags.includes('STICKY')) {
            currentTags.push('STICKY');
            clipUpdates.tags = currentTags.slice(0, 6);
            shouldUpdateClip = true;
          }
          logs.push(`[ACTION] Added STICKY tag pill.`);
          break;
        }

        case 'notify_user': {
          logs.push(`[NOTIFY] Alert toast triggered: "${val}"`);
          break;
        }

        default:
          logs.push(`[WARN] Unknown action type "${type}". Action skipped.`);
      }
    }

    // 4. COMMIT ATOMIC BULK WRITES (only if not dry run!)
    if (!isDryRun) {
      if (shouldUpdateClip && clip?.id) {
        logs.push(`[DATABASE] Saving clip updates: ${JSON.stringify(clipUpdates)}`);
        const { error: saveErr } = await supabase
          .from('clips')
          .update(clipUpdates)
          .eq('id', clip.id);
          
        if (saveErr) {
          throw new Error(`Database clip update failed: ${saveErr.message}`);
        }
      }

      if (shouldUpdateMetadata && clip?.id) {
        logs.push(`[DATABASE] Saving clip metadata updates...`);
        const { error: metaErr } = await supabase
          .from('clip_metadata')
          .upsert({
            clip_id: clip.id,
            user_id: clip.user_id,
            ...metadataUpdates
          }, { onConflict: 'clip_id' });

        if (metaErr) {
          throw new Error(`Database clip metadata update failed: ${metaErr.message}`);
        }
      }
    }

    logs.push(`[SUCCESS] Automation rule executed successfully!`);
    return {
      status: 'success',
      logs,
    };

  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    logs.push(`[FAILED] Automation runtime error: ${errorMsg}`);
    console.error(`Automation Engine failure for rule ${automation.id}:`, error);
    
    return {
      status: 'failed',
      logs,
      errorMessage: errorMsg,
    };
  }
}
