"""Inspect runtime archive member names for forbidden machine/account configuration."""
import argparse
import json
from pathlib import Path
import tarfile


def verify(path):
    forbidden = {'etc/aau_token', 'conda-meta/state', 'conda-meta/history', '.condarc', 'pip.ini', '.netrc', '.env'}
    count = 0
    with tarfile.open(path, 'r|gz') as archive:
        for member in archive:
            name = member.name.replace('\\', '/').removeprefix('./').lower()
            if name in forbidden or name.startswith(('.ssh/', '.aws/', '.azure/', '.env.')):
                raise ValueError('Machine/account configuration in archive: ' + name)
            count += 1
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.directory / 'release.json').read_text())
    for asset in manifest['assets']:
        if not asset['target'].startswith('env/'):
            continue
        path = args.directory / asset['name']
        print(f'{path.name}: {verify(path)} entries checked; no forbidden account/configuration members', flush=True)
