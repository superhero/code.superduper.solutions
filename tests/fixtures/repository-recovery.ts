// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import LightningFS from "@isomorphic-git/lightning-fs";
import * as git from "isomorphic-git";
import { createRepositoryService, repositoryPaths } from "$lib/repository/browser";

/** Test-only crash boundary; the application never imports this fixture. */
export async function recoverInterruptedEdit(stage: "prepared" | "files-flushed" | "refs-flushed" | "finalized") {
  const namespace = `test/recovery/${crypto.randomUUID()}`;
  const fs = new LightningFS(namespace);
  const options = { filesystemName: namespace, databaseName: `${namespace}/metadata`, filesystem: fs };
  let armed = false;
  let injected = false;
  const service = createRepositoryService({ ...options, checkpoint: checkpoint => {
    if (armed && checkpoint === stage) {
      armed = false;
      injected = true;
      throw new Error(`Injected interruption at ${stage}`);
    }
  } });
  const initial = await service.create("Recovery fixture", [{ path: "notes.txt", data: new TextEncoder().encode("before") }]);
  const paths = repositoryPaths(initial.id);
  const history = () => git.log({ fs, gitdir: paths.historyGitdir, ref: "refs/heads/current" });
  const before = await history();
  const sourceHead = await fs.promises.readFile(`${paths.gitdir}/HEAD`, "utf8");
  armed = true;
  let error = "";
  try { await service.write(initial.id, "notes.txt", "after", initial.revision); }
  catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }

  const reopened = createRepositoryService(options);
  const recovered = await reopened.open(initial.id);
  const working = await reopened.read(initial.id, "notes.txt");
  const recoveredLog = await history();
  const blob = await git.readBlob({ fs, gitdir: paths.historyGitdir, oid: recoveredLog[0]!.oid, filepath: "notes.txt" });
  const repeated = await createRepositoryService(options).open(initial.id);
  const repeatedLog = await history();
  const undone = await reopened.undo(initial.id, repeated.revision);
  const undoText = await reopened.read(initial.id, "notes.txt");
  await reopened.redo(initial.id, undone.revision);
  return {
    injected, error, beforeOids: before.map(entry => entry.oid), recoveredOids: recoveredLog.map(entry => entry.oid),
    repeatedOids: repeatedLog.map(entry => entry.oid), working, historical: new TextDecoder().decode(blob.blob),
    revisionChanged: initial.revision !== recovered.revision, undoText, redoText: await reopened.read(initial.id, "notes.txt"),
    sourceHeadBefore: sourceHead, sourceHeadAfter: await fs.promises.readFile(`${paths.gitdir}/HEAD`, "utf8"),
    sourceCommitsBefore: initial.commits.map(entry => entry.oid), sourceCommitsAfter: repeated.commits.map(entry => entry.oid)
  };
}
