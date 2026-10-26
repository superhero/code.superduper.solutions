// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

export const SETTINGS_TABS = [
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "editor", label: "Editor", icon: "edit_note" },
  { id: "languages", label: "Languages", icon: "code" },
  { id: "formatting", label: "Formatting", icon: "align_horizontal_left" },
  { id: "controls", label: "Controls", icon: "keyboard" },
  { id: "ai", label: "AI", icon: "robot" },
  { id: "remotes", label: "Git", icon: "cloud" },
  { id: "licenses", label: "Licenses", icon: "policy" },
] as const;

export type SettingsTab = typeof SETTINGS_TABS[number]["id"];
export const isSettingsTab = (value: unknown): value is SettingsTab => SETTINGS_TABS.some(tab => tab.id === value);
