# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ai-vault-ui
Feature: AI connections and guarded values
  Scenario: Vault is an independent sliding pane without retained secret drafts
    Then the header opens the shared vault beside AI and clears drafts on closing
  Scenario: Encrypted values and OpenAI profiles survive reload with locked access
    Then the AI vault and saved OpenAI connection preserve ciphertext across reload
  Scenario: Worker-only OpenAI streaming keeps credentials out of the conversation
    Then OpenAI chat uses the secret worker and redacts credential echoes
  Scenario: Origin-wide locking ends access in another application tab
    Then locking the AI vault invalidates another tab without affecting local chat
  Scenario: Native WebAuthn PRF can unlock the adapted vault
    Then the AI vault supports a native virtual PRF passkey
  Scenario: Value replacement password changes rotation and encrypted restoration remain usable
    Then AI vault management preserves guarded values through password rotation and restore
  Scenario: Enabling idle locking uses recent trusted activity and persists the preference
    Then AI vault idle locking starts from current activity and survives reload
