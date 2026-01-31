/**
 * Source for devcontainer configuration.
 * Either use the project's .devcontainer or a predefined template.
 */
export type DevcontainerSource =
  | { type: 'project' }
  | { type: 'template'; templateId: string };

/**
 * Devcontainer template metadata.
 */
export interface DevcontainerTemplate {
  /** Unique template identifier (folder name) */
  id: string;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Absolute path to devcontainer.json */
  configPath: string;
}
