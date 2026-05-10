export type CommitModelLike = {
  id: string;
  [key: string]: unknown;
};

const CHEAP_MODEL_PATTERNS = ["gpt-5-mini", "mini", "haiku", "flash", "llama-3-8b", "llama-3.1-8b"];

function findModelBySubstring(models: CommitModelLike[], query: string): CommitModelLike | undefined {
  const needle = query.toLowerCase();
  return models.find((model) => model.id.toLowerCase().includes(needle));
}

export function selectCommitModel(options: {
  models: CommitModelLike[];
  currentModel: CommitModelLike;
  overrideModelId?: string;
  flagModel?: string;
  permanentModel?: string;
}): { model: CommitModelLike; overrideNotFound: boolean } {
  const { models, currentModel, overrideModelId, flagModel, permanentModel } = options;

  if (overrideModelId) {
    const found = findModelBySubstring(models, overrideModelId);
    return {
      model: found ?? currentModel,
      overrideNotFound: !found,
    };
  }

  let selectedModel = currentModel;
  const preferredModel = typeof flagModel === "string" && flagModel.trim() ? flagModel : permanentModel;

  if (preferredModel) {
    const found = findModelBySubstring(models, preferredModel);
    if (found) {
      selectedModel = found;
    }
  }

  if (selectedModel === currentModel) {
    for (const pattern of CHEAP_MODEL_PATTERNS) {
      const found = findModelBySubstring(models, pattern);
      if (found) {
        selectedModel = found;
        break;
      }
    }
  }

  return { model: selectedModel, overrideNotFound: false };
}

export const DEFAULT_CHEAP_MODEL_PATTERNS = CHEAP_MODEL_PATTERNS;
