#!/usr/bin/env python3
"""Validate a Minecraft archive and replace data contents while preserving the bind root.

The caller MUST stop Minecraft and its backup writer before `restore`.
Only regular files/directories are accepted. No existing data is deleted.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile


def members(archive):
    result = []
    seen = set()
    for member in archive.getmembers():
        name = PurePosixPath(member.name)
        if name.is_absolute() or ".." in name.parts or "\\" in member.name:
            raise ValueError("Archive contains an unsafe path")
        if not (member.isdir() or member.isfile()):
            raise ValueError("Archive links and special files are not supported")
        key = str(name)
        if key in seen:
            raise ValueError("Archive contains duplicate paths")
        seen.add(key)
        result.append(member)
    if not any(m.isfile() and PurePosixPath(m.name).name == "level.dat" for m in result):
        raise ValueError("Archive does not contain a Minecraft world (level.dat)")
    return result


def verify(archive_path):
    # Reading each member also verifies the gzip footer, rather than only headers.
    with tarfile.open(archive_path, "r:gz") as archive:
        entries = members(archive)
        for member in entries:
            if member.isfile():
                with archive.extractfile(member) as source:
                    while source.read(1024 * 1024):
                        pass
    import gzip
    with gzip.open(archive_path, "rb") as source:
        while source.read(1024 * 1024):
            pass
    return entries


def restore(archive_path, data_path, work_path, lock_file=None):
    data = Path(data_path).resolve(strict=True)
    work = Path(work_path).resolve()
    if data == work or data in work.parents or work in data.parents:
        raise ValueError("Restore workspace must be separate from the data tree")
    work.mkdir(parents=True, exist_ok=True)
    if data.stat().st_dev != work.stat().st_dev:
        raise ValueError("Data and restore workspace must be on the same filesystem")
    with (work / ".restore.lock").open("a") as operation_lock:
        fcntl.flock(operation_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        entries = verify(archive_path)
        required = sum(m.size for m in entries if m.isfile())
        if shutil.disk_usage(work).free < required + 64 * 1024 * 1024:
            raise ValueError("Insufficient free space for a staged restore")
        run = Path(tempfile.mkdtemp(prefix="restore-", dir=work))
        staged, previous = run / "staged", run / "previous"
        staged.mkdir()
        previous.mkdir()
        with tarfile.open(archive_path, "r:gz") as archive:
            archive.extractall(staged, members=members(archive), filter="data")
        # tarfile's data filter intentionally discards archive ownership.
        # Give the staged tree to the actual server data owner before activation.
        owner = data.stat()
        if os.geteuid() == 0:
            for child in staged.rglob("*"):
                os.chown(child, owner.st_uid, owner.st_gid)
        elif os.geteuid() != owner.st_uid:
            raise ValueError("Restore must run as root or the server data owner")
        if lock_file:
            marker = staged / ".deployment-lock.json"
            if not marker.is_file() or json.loads(marker.read_text()) != json.loads(Path(lock_file).read_text()):
                raise ValueError("Backup deployment lock differs. Restore the matching release via the host runbook.")
        # Moving children keeps the /data bind mount inode alive in existing containers.
        moved_old, moved_new = [], []
        try:
            for child in data.iterdir():
                child.rename(previous / child.name)
                moved_old.append(child.name)
            for child in staged.iterdir():
                child.rename(data / child.name)
                moved_new.append(child.name)
        except BaseException:
            for name in reversed(moved_new):
                (data / name).rename(staged / name)
            for name in reversed(moved_old):
                (previous / name).rename(data / name)
            raise
        return {"previous_data": str(previous), "restored_from": str(Path(archive_path).resolve())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["verify", "restore"])
    parser.add_argument("--archive", required=True)
    parser.add_argument("--data")
    parser.add_argument("--work")
    parser.add_argument("--lock-file")
    args = parser.parse_args()
    if args.action == "verify":
        verify(args.archive)
        print(json.dumps({"valid": True}))
    else:
        if not args.data or not args.work:
            parser.error("restore requires --data and --work")
        print(json.dumps(restore(args.archive, args.data, args.work, args.lock_file)))
