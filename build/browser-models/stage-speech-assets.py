#!/usr/bin/env python3
# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
"""Stage caller-supplied pinned speech exports; no weights or download in Git."""
import argparse,hashlib,json,pathlib,shutil
ROOT=pathlib.Path(__file__).resolve().parents[2]
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=pathlib.Path);parser.add_argument('distribution',type=pathlib.Path);args=parser.parse_args()
 pins=json.loads((ROOT/'src/lib/assistant/speech/continuous-assets.json').read_text())
 files=[pins['decoder'],*[file for group in pins['vad'].values() for file in group]]
 checked=[]
 for file in files:
  source=args.source/file['sha256']/file['id']
  if not source.is_file() or source.stat().st_size!=file['bytes'] or hashlib.file_digest(source.open('rb'),'sha256').hexdigest()!=file['sha256']:raise SystemExit('Speech asset size/hash differs: '+file['id'])
  if file['bytes']>=25*1024*1024:raise SystemExit('Speech asset requires reviewed static parts: '+file['id'])
  checked.append((file,source))
 for file,source in checked:
  target=args.distribution/file['url'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
  if hashlib.file_digest(target.open('rb'),'sha256').hexdigest()!=file['sha256']:raise SystemExit('Staged speech asset differs: '+file['id'])
 print(json.dumps({'staged':len(checked),'bytes':sum(file['bytes'] for file,_ in checked),'verified':True}))
if __name__=='__main__':main()
