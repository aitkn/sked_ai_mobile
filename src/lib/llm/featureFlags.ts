/**
 * LLM Feature Flags
 *
 * Controls which constraint language features are enabled for the LLM assistant.
 * Features can be gradually enabled as they are tested and validated.
 */

export const llmFeatures = {
  // Core features (always enabled)
  basicConstraints: true,      // duration >= 30m, start >= 09:00
  environmental: true,          // temp_c, is_day
  compound: true,               // AND (&), OR (|)
  rangeAndList: true,           // temp_c in 20-25°C, priority in [high, critical]

  // Advanced features (can be enabled/disabled)
  margins: false,               // start == 09:00 ± 30m [LINEAR, weight=3.0]
  resources: false,             // resources.fuel.consume(5000) at start
  taskGroups: false,            // sum(duration) >= 7h, gaps.min(duration) >= 15m
  sequential: false,            // start >= other_task.end + 15m
  recurring: false,             // repeat: {tasks_per_day: 1}
  splitTasks: false,            // split: {max_days: 3, max_parts_per_day: 2}
};

/**
 * Get list of enabled feature names
 * @returns {string} Comma-separated list of enabled features
 */
export function getEnabledFeatures(): string {
  return Object.entries(llmFeatures)
    .filter(([_, enabled]) => enabled)
    .map(([feature, _]) => feature)
    .join(', ');
}

/**
 * Check if a feature is enabled
 * @param {string} featureName - Name of the feature to check
 * @returns {boolean} True if feature is enabled
 */
export function isFeatureEnabled(featureName: string): boolean {
  return llmFeatures[featureName as keyof typeof llmFeatures] === true;
}

/**
 * Generate feature-specific system prompt additions
 * @returns {string} Additional prompt text based on enabled features
 */
export function getFeaturePromptAdditions(): string {
  const additions: string[] = [];

  if (llmFeatures.margins) {
    additions.push(`
**Margins are enabled**: You can use soft constraints with margins:
- Symmetric: "start == 09:00 ± 30m"
- Asymmetric: "end <= 17:00 +30m/-1h"
- With decay: "duration >= 7h30m ± 30m [LINEAR, weight=3.0]"
    `.trim());
  }

  if (llmFeatures.resources) {
    additions.push(`
**Resource tracking is enabled**: You can track resource consumption:
- Fixed: "resources.fuel.consume(5000) at start"
- Calculated: "resources.fuel.consume(duration * 100) at start"
- Level constraints: "resources.fuel.level_at.drive.start >= 5000"
    `.trim());
  }

  if (llmFeatures.taskGroups) {
    additions.push(`
**Task groups are enabled**: You can use aggregates and gap operations:
- Aggregates: "sum(duration) >= 7h", "min(start) >= 09:00"
- Gaps: "gaps.min(duration) >= 15m", "gaps.max(duration) <= 4h"
    `.trim());
  }

  if (llmFeatures.sequential) {
    additions.push(`
**Sequential dependencies are enabled**: Tasks can reference other tasks:
- "start >= meeting.end + 15m" - Start 15 minutes after meeting ends
- "end <= presentation.start - 30m" - End 30 minutes before presentation
    `.trim());
  }

  if (llmFeatures.recurring) {
    additions.push(`
**Recurring tasks are enabled**: You can create repeating tasks:
- repeat: {tasks_per_day: 1} - Create one instance per day
    `.trim());
  }

  if (llmFeatures.splitTasks) {
    additions.push(`
**Split tasks are enabled**: Large tasks can be divided across multiple days:
- split: {max_days: 3, max_parts_per_day: 2} - Split across up to 3 days, 2 parts per day
    `.trim());
  }

  return additions.join('\n\n');
}

export default llmFeatures;

