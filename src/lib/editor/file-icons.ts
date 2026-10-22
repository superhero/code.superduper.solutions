// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import glyphs from "../../assets/fonts/devicon-glyphs.json" with { type: "json" };

type DeviconName = keyof typeof glyphs;
type FileIcon = { kind: "devicon"; name: DeviconName; glyph: string }
  | { kind: "material"; name: string };

function associations(groups: readonly (readonly [DeviconName, string])[]) {
  return new Map(groups.flatMap(([icon, names]) => names.split(" ").map(name => [name, icon] as const)));
}

const extensions = associations([
  ["javascript-plain", "js mjs cjs"], ["typescript-plain", "ts mts cts"],
  ["react-original", "jsx tsx"], ["svelte-plain", "svelte"], ["vuejs-plain", "vue"],
  ["python-plain", "py pyi pyw ipynb"], ["c-original", "c h"],
  ["cplusplus-plain", "cc cpp cxx c++ hh hpp hxx h++ mq4 mq5 mqh"],
  ["csharp-plain", "cs csx"], ["objectivec-plain", "m mm"], ["fsharp-plain", "fs fsi fsx"],
  ["java-plain", "java jar"], ["kotlin-plain", "kt kts"], ["scala-plain", "scala sc"],
  ["go-plain", "go"], ["rust-original", "rs"], ["ruby-plain", "rb erb rake gemspec"],
  ["php-plain", "php phtml"], ["swift-plain", "swift"], ["dart-plain", "dart"],
  ["elixir-plain", "ex exs heex"], ["erlang-plain", "erl hrl"],
  ["clojure-line", "clj cljs cljc edn"], ["haskell-plain", "hs lhs"],
  ["ocaml-plain", "ml mli"], ["lua-plain", "lua"], ["perl-plain", "pl pm"],
  ["r-plain", "r rmd rproj"], ["julia-plain", "jl"], ["fortran-original", "f f90 f95 f03 f08 for"],
  ["zig-original", "zig zon"], ["nim-plain", "nim nims"], ["crystal-original", "cr"],
  ["solidity-plain", "sol"], ["groovy-plain", "groovy gvy"], ["gradle-original", "gradle"],
  ["bash-plain", "sh bash zsh fish"], ["powershell-plain", "ps1 psm1 psd1"],
  ["html5-plain", "html htm xhtml"], ["css3-plain", "css less"], ["sass-original", "sass scss"],
  ["stylus-original", "styl stylus"], ["json-plain", "json jsonc json5 jsonl ndjson"],
  ["yaml-plain", "yaml yml"], ["markdown-original", "md markdown mdx"],
  ["cucumber-plain", "feature"],
  ["xml-plain", "xml xsl xslt xsd svg"], ["graphql-plain", "graphql gql"],
  ["mysql-original", "sql"], ["sqlite-plain", "sqlite sqlite3 db"],
  ["terraform-plain", "tf tfvars"], ["cmake-plain", "cmake"], ["wasm-original", "wasm wat"],
  ["arduino-plain", "ino"], ["coffeescript-original", "coffee litcoffee"],
  ["elm-plain", "elm"], ["haxe-plain", "hx hxml"], ["prolog-plain", "pro prolog"],
]);

const filenames = associations([
  ["npm-plain", "package.json package-lock.json npm-shrinkwrap.json .npmrc .npmignore"],
  ["pnpm-plain", "pnpm-lock.yaml pnpm-workspace.yaml"], ["yarn-original", "yarn.lock .yarnrc .yarnrc.yml"],
  ["bun-plain", "bun.lock bun.lockb bunfig.toml"], ["denojs-original", "deno.json deno.jsonc deno.lock"],
  ["git-plain", ".gitignore .gitattributes .gitmodules .gitkeep .gitconfig"],
  ["docker-plain", "dockerfile containerfile .dockerignore docker-compose.yml docker-compose.yaml compose.yml compose.yaml"],
  ["rust-original", "cargo.toml cargo.lock rust-toolchain rust-toolchain.toml"],
  ["go-plain", "go.mod go.sum go.work go.work.sum"],
  ["python-plain", "pyproject.toml requirements.txt pipfile pipfile.lock poetry.lock uv.lock"],
  ["ruby-plain", "gemfile gemfile.lock rakefile .ruby-version"],
  ["composer-line", "composer.json composer.lock"], ["cmake-plain", "cmakelists.txt"],
  ["gradle-original", "gradlew gradlew.bat gradle.properties"],
  ["bash-plain", ".bashrc .bash_profile .zshrc .zprofile .profile"],
]);

const configurations: readonly (readonly [RegExp, DeviconName])[] = [
  [/^(?:.+\.)?(?:dockerfile|containerfile)(?:\..+)?$/, "docker-plain"],
  [/^tsconfig(?:\.[^.]+)*\.json$/, "typescript-plain"],
  [/^jsconfig(?:\.[^.]+)*\.json$/, "javascript-plain"],
  [/^svelte\.config\.[cm]?[jt]s$/, "svelte-plain"],
  [/^vite\.config\.[cm]?[jt]s$/, "vite-original"],
  [/^vitest\.config\.[cm]?[jt]s$/, "vitest-plain"],
  [/^eslint\.config\.[cm]?[jt]s$|^\.eslintrc(?:\..+)?$/, "eslint-plain"],
  [/^babel\.config\.[cm]?js$|^\.babelrc(?:\..+)?$/, "babel-plain"],
  [/^webpack\.config\.[cm]?[jt]s$/, "webpack-plain"],
  [/^tailwind\.config\.[cm]?[jt]s$/, "tailwindcss-original"],
  [/^angular\.json$/, "angular-plain"],
];

function devicon(name: DeviconName): FileIcon {
  return { kind: "devicon", name, glyph: glyphs[name] };
}

/** Filename rules take priority; longest extension wins. Paths never supply markup or URLs. */
export function fileIcon(path: string): FileIcon {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (/\.(?:test|spec)\..+$/.test(name)) return { kind: "material", name: "experiment" };
  const named = filenames.get(name) ?? configurations.find(([pattern]) => pattern.test(name))?.[1];
  if (named) return devicon(named);
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    const icon = extensions.get(name.slice(dot + 1));
    if (icon) return devicon(icon);
  }
  return { kind: "material", name: /\.(txt|text|log)$|^(readme|licen[sc]e|copying)$/i.test(name) ? "description" : "code" };
}
