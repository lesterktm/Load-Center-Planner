import raw from './panel-presets.json';
import type { PanelConfig, TandemSpaces } from '../core/types';

/**
 * Generic panel templates (not tied to a brand). Pick one, then adjust the
 * fields to match the label inside the panel door.
 */
export interface PanelPreset {
  id: string;
  name: string;
  busAmps: number;
  mainType: PanelConfig['mainType'];
  mainAmps: number | null;
  spaces: number;
  maxCircuits: number;
  tandemSpaces: TandemSpaces;
}

export const PANEL_PRESETS: readonly PanelPreset[] = raw as unknown as PanelPreset[];

export function presetPatch(preset: PanelPreset): Partial<PanelConfig> {
  return {
    presetId: preset.id,
    busAmps: preset.busAmps,
    mainType: preset.mainType,
    mainAmps: preset.mainAmps,
    spaces: preset.spaces,
    maxCircuits: preset.maxCircuits,
    tandemSpaces: Array.isArray(preset.tandemSpaces) ? [...preset.tandemSpaces] : preset.tandemSpaces,
  };
}
