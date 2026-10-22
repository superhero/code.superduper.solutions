# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Shared file type icons
  Scenario: Test and spec filename segments take priority over language and configuration icons
    Then these repository paths use their Material icons:
      | path                        | icon    |
      | src/main.test.ts            | experiment |
      | src/component.spec.tsx      | experiment |
      | tools/script.TEST.MJS       | experiment |
      | résumé/module.SPEC.py       | experiment |
      | src/types.test.d.ts         | experiment |
      | tsconfig.test.json          | experiment |
      | Dockerfile.spec.production  | experiment |

  Scenario: Similar names and test folders do not override ordinary file icons
    Then these repository paths use their Devicon glyphs:
      | path                        | icon              |
      | main.tests.ts               | typescript-plain  |
      | main.specification.js       | javascript-plain  |
      | src.test.ts/main.py          | python-plain      |
      | src.spec.js/main.ts          | typescript-plain  |
    And these repository paths use their Material icons:
      | path                        | icon |
      | main.test                   | code |
      | main.spec.                  | code |

  Scenario: Code files resolve to language glyphs through nested and mixed-case paths
    Then these repository paths use their Devicon glyphs:
      | path                      | icon               |
      | src/main.ts               | typescript-plain   |
      | src/types.d.ts            | typescript-plain   |
      | src/component.TSX         | react-original     |
      | src/main.mjs              | javascript-plain   |
      | src/App.svelte            | svelte-plain       |
      | src/App.vue               | vuejs-plain        |
      | résumé/日本語/MAIN.PY      | python-plain       |
      | main.cpp                  | cplusplus-plain    |
      | include/header.h          | c-original         |
      | src/main.rs               | rust-original      |
      | src/main.go               | go-plain           |
      | expert.mq5                | cplusplus-plain    |
      | README.md                 | markdown-original  |
      | data.json                 | json-plain         |
      | pipeline.yaml             | yaml-plain         |
      | style.scss                | sass-original      |
      | script.sh                 | bash-plain         |
      | query.sql                 | mysql-original     |
      | tests/login.feature       | cucumber-plain     |
      | tests/LOGIN.FEATURE        | cucumber-plain     |

  Scenario: Known configuration names override generic extensions
    Then these repository paths use their Devicon glyphs:
      | path                      | icon                 |
      | app/package.json          | npm-plain            |
      | pnpm-lock.yaml            | pnpm-plain           |
      | Cargo.toml                | rust-original        |
      | .gitignore                | git-plain            |
      | requirements.txt          | python-plain         |
      | docker/Dockerfile         | docker-plain         |
      | Dockerfile.production     | docker-plain         |
      | deployment.dev.dockerfile | docker-plain         |
      | config/tsconfig.app.json  | typescript-plain     |
      | jsconfig.json             | javascript-plain     |
      | svelte.config.js          | svelte-plain         |
      | VITE.CONFIG.MTS           | vite-original        |
      | vitest.config.ts          | vitest-plain         |
      | .eslintrc.json            | eslint-plain         |
      | eslint.config.mjs         | eslint-plain         |
      | babel.config.js           | babel-plain          |
      | webpack.config.cjs        | webpack-plain        |
      | tailwind.config.ts        | tailwindcss-original |
      | angular.json              | angular-plain        |

  Scenario: Unsupported names use safe generic icons without consulting parent folders
    Then these repository paths use their Material icons:
      | path                      | icon        |
      | notes.TXT                 | description |
      | LICENSE                   | description |
      | data.unknown              | code        |
      | main.ts.backup            | code        |
      | package.json/unknown      | code        |
      | main.py/no-extension      | code        |
      | constructor               | code        |
      | __proto__                 | code        |
      | toString                  | code        |

  Scenario: Renaming a file recomputes its icon without retaining its former type
    Then a file renamed from TypeScript to Python to an unknown type changes its icon each time
