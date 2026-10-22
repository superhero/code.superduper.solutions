# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ai-vault-source
Feature: Operations-derived encrypted browser vault
  Scenario: Stored values and exports remain encrypted with public names only
    Then vault storage contains ciphertext and public key names but no plaintext values
  Scenario: Password recovery and passkey envelopes unlock independently
    Then independent vault unlock methods recover the same guarded values
  Scenario: Authenticated inventory rejects selective rollback and excessive KDF parameters
    Then tampered vault records and unsafe KDF profiles are rejected
  Scenario: Durable revisions reject stale sessions before credential use
    Then a stale vault session cannot dispatch a credentialed request
  Scenario: Import authenticates both existing and imported vaults
    Then replacing a vault requires current authentication and preserves data on failure
  Scenario: Rotation replaces recovery material while retaining values
    Then vault rotation requires retained proofs and invalidates the old recovery key
  Scenario: Locking cancels pending creation and duplicate names remain errors
    Then vault management rejects duplicate names invalid headers and late creation
  Scenario: Idle expiration cannot be revived by visibility or delayed activity
    Then vault idle deadlines remain absolute and cannot revive expired access
