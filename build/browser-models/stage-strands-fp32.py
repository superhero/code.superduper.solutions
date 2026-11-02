#!/usr/bin/env python3
# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
"""Stage the exact MU conversion as optional immutable static files, without publishing.

Run on the machine holding the verified weights:
python3 build/browser-models/stage-strands-fp32.py WEIGHTS_DIRECTORY DISTRIBUTION_DIRECTORY
This does not run inference or change the input tree. Each output is <=16 MiB.
"""
import argparse,hashlib,json,pathlib,shutil
MANIFEST='9c3589ba48ec3be7a565b52a2fbd0687e30ffe0222c2b3a29d94b569062daf30'
PART=16*1024*1024
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('weights',type=pathlib.Path);p.add_argument('distribution',type=pathlib.Path);a=p.parse_args()
 manifest=a.weights/'manifest.json'
 if digest(manifest)!=MANIFEST:raise ValueError('MU manifest checksum differs')
 data=json.loads(manifest.read_text());files={**data['files'],'manifest.json':{'bytes':manifest.stat().st_size,'sha256':MANIFEST}}
 # Validate every file before creating any distribution output.
 for name,pin in files.items():
  path=a.weights/name
  if path.resolve().is_relative_to(a.weights.resolve()) is False or path.stat().st_size!=pin['bytes'] or digest(path)!=pin['sha256']:raise ValueError('MU asset checksum differs: '+name)
 target=a.distribution/'browser-models/strands-fp32'/MANIFEST
 for name,pin in files.items():
  out=target/name;out.parent.mkdir(parents=True,exist_ok=True)
  if pin['bytes']<=PART:shutil.copyfile(a.weights/name,out)
  else:
   with (a.weights/name).open('rb') as source:
    for i in range((pin['bytes']+PART-1)//PART):
     part=out.with_name(out.name+'.part-'+str(i+1).zfill(3));part.write_bytes(source.read(PART))
 # Read back the distribution rather than trusting completed writes.
 for name,pin in files.items():
  out=target/name;h=hashlib.sha256();size=0
  parts=[out]if pin['bytes']<=PART else [out.with_name(out.name+'.part-'+str(i+1).zfill(3))for i in range((pin['bytes']+PART-1)//PART)]
  for part in parts:
   with part.open('rb')as f:
    for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block);size+=len(block)
  if size!=pin['bytes']or h.hexdigest()!=pin['sha256']:raise ValueError('Staged asset verification failed: '+name)
 print(json.dumps({'prefix':str(target),'manifest_sha256':MANIFEST,'bytes':sum(f['bytes']for f in files.values()),'published':False}))
if __name__=='__main__':main()
