Feature: LFM3 bounded browser integration
  Scenario: Explicit GPU device reaches every ONNX execution provider
    Then the LFM3 loader passes the exact GPU device in its provider options
  Scenario: Native d1 readout preserves calibrated finite probabilities
    Then the d1 readout normalizes its native slot logits and rejects invalid calibration
  Scenario: LFM3 audio assets and public capabilities stay bounded
    Then the LFM3 catalog excludes unsupported exports and installs its trained modality graphs
  Scenario: Cached Phonon modules give pthreads an absolute Wasm URL
    Then the pinned Phonon module resolves its Wasm URL in Blob-backed pthreads
