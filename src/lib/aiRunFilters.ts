export type AIAutomationId = 'lead_followup' | 'client_report' | 'project_tasks';
export type AIAutomationRunStatus = 'success' | 'error' | 'skipped';
export type AIAutomationRunMode = 'manual' | 'trigger';
export type AiTriggerSettingKey =
  | 'ai_trigger_new_lead'
  | 'ai_trigger_client_report'
  | 'ai_trigger_project_task_pack';

export interface AIAutomationRunFilterPreset {
  automation?: AIAutomationId;
  status?: AIAutomationRunStatus;
  mode?: AIAutomationRunMode;
  trigger_key?: AiTriggerSettingKey;
}

export const AI_RUN_FILTER_PRESET_STORAGE_KEY = 'jaadsglobal_ai_run_filter_preset';

export const saveAIAutomationRunFilterPreset = (preset: AIAutomationRunFilterPreset) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    AI_RUN_FILTER_PRESET_STORAGE_KEY,
    JSON.stringify(preset),
  );
};

export const loadAIAutomationRunFilterPreset = (): AIAutomationRunFilterPreset | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(AI_RUN_FILTER_PRESET_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as AIAutomationRunFilterPreset;
  } catch {
    return null;
  }
};

export const clearAIAutomationRunFilterPreset = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(AI_RUN_FILTER_PRESET_STORAGE_KEY);
};
