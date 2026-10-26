# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@workspace
Feature: Durable application workspace metadata
  Scenario: Settings becomes an independent pane and preserves older saved layouts
    Then Settings migrate into an independent pane with durable widths and opening priority

  Scenario: Vault is an independent responsive pane with private form data excluded
    Then Vault pane preferences migrate persist and fit without storing secret drafts

  Scenario: Commit comparison tabs retain their commit and historical path
    Then commit comparison tabs survive normalization moves reload and missing working files
  Scenario: History becomes a third independent right pane with shared sizing
    Then History migrates into the independent dock and three pane widths preserve the editor

  Scenario: Workspace snapshots retain independent repository positions without contents
    Then a workspace roundtrip preserves repository tabs selections scroll and focus

  Scenario: History graph choices persist per repository and safely default older snapshots
    Then history view preferences survive normalization roundtrip and repository mutations

  Scenario: Malformed workspace snapshots recover safe defaults
    Then invalid workspace versions fields and coordinates recover safely

  Scenario: Literal filenames cannot modify workspace prototypes
    Then workspace normalization preserves prototype-named files without trusting inherited values

  Scenario: Repository mutations discard stale paths without opening other files
    Then workspace reconciliation keeps surviving state and never opens an unseen file

  Scenario: Moving a directory carries its tabs and positions without affecting similar paths
    Then workspace renames remap whole path prefixes and preserve independent state

  Scenario: File diff workspace choice persists independently of repository content
    Then file diff choices survive workspace normalization and repository reconciliation

  Scenario: Split views retain their own positions and follow file mutations
    Then split workspace state survives reload rename and reconciliation

  Scenario: Split pane widths survive reload and track changed pane membership
    Then split pane sizes persist normalize and follow pane insertion deletion and promotion

  Scenario: Multiple split tabs retain independent document positions across migrations and file mutations
    Then split tab collections migrate persist rename and reconcile independently

  Scenario: Dragging tabs within a viewport uses original insertion boundaries without changing selection
    Then workspace tab reordering preserves active files sessions and no-op identity

  Scenario: Moving tabs between viewports carries positions without duplicating target tabs
    Then workspace tab transfers activate targets preserve positions and select source neighbours

  Scenario: Moving the final tab closes empty panes and promotes all primary replacement tabs
    Then empty tab viewport transfers preserve complete promoted panes and widths

  Scenario: Comparison tabs retain their file identity within each pane
    Then comparison tab kinds survive transfer rename reload and reconciliation

  Scenario: Staged comparisons preserve their index identity independently of working files
    Then staged comparison tabs survive moves reload and staged deletions

  Scenario: Explorer width is optional and bounded in persisted workspace layouts
    Then explorer widths normalize without changing default workspace layouts

  Scenario: Legacy Resources views migrate to a pane without storing measurements in workspace metadata
    Then the resources view and scroll position survive safe workspace normalization

  Scenario: Resources keeps an independent width and receives priority when space is limited
    Then Resources widths visibility and priority survive normalization without storing measurements

  Scenario: Vault is a durable view without storing guarded values in workspace metadata
    Then the vault view survives workspace normalization without credential drafts

  Scenario: Git pane width is optional and bounded in persisted workspace layouts
    Then Git pane widths normalize without changing default workspace layouts

  Scenario: AI and Git panes retain independent visibility and fit their shared dock
    Then both right panes survive reload and their widths keep room for the editor

  Scenario: Opening a pane closes the oldest panes including the explorer when space runs out
    Then the newest side pane stays open while older panes close to preserve the editor

  Scenario: Pane visibility and order survive reload without reopening evicted panes
    Then explorer visibility and pane opening order normalize safely and remain closed on expansion

  Scenario: Pane columns fit narrow windows without hiding the editor
    Then all retained pane widths leave space for the editor at every supported viewport width

  Scenario: Dragging a crowded dock pane borrows spare neighbour width while preserving minimums
    Then the resized dock pane receives its requested width before neighbours share the remaining space

  Scenario: Settings sections and independent scroll positions survive reload and old layouts
    Then Settings sections and per-section scroll positions normalize and persist independently
