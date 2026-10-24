"""Bounded read-only /proc sampler, suitable for the parent-owned Gateway host."""
import argparse
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pid', type=int, required=True)
parser.add_argument('--seconds', type=int, default=160)
parser.add_argument('--interval', type=float, default=2)
parser.add_argument('--start-ticks', help='Require the recorded /proc starttime; reject PID reuse')
parser.add_argument('--ready-url', help='Optional task-local /readyz; sampled every 10 seconds')
args = parser.parse_args()
if not 1 <= args.seconds <= 720 or not 1 <= args.interval <= 10:
    raise SystemExit('Sampler bounds: duration 1..720 seconds, interval 1..10 seconds')
if args.ready_url:
    url = urllib.parse.urlparse(args.ready_url)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', '::1') or url.path != '/readyz':
        raise SystemExit('Readiness URL must be the isolated loopback HTTP /readyz endpoint')
base = pathlib.Path('/proc') / str(args.pid)
def fields():
    # comm is parenthesized and may contain spaces; stat field 22 is starttime.
    stat = (base / 'stat').read_text().rsplit(')', 1)[1].split()
    return {'state': stat[0], 'userTicks': int(stat[11]), 'systemTicks': int(stat[12]),
            'startTicks': stat[19]}
identity = fields()
if args.start_ticks and args.start_ticks != identity['startTicks']:
    raise SystemExit('PID starttime differs from parent-owned process receipt')
start = time.monotonic()
next_ready = 0
while time.monotonic() - start < args.seconds:
    try:
        process = fields()
        if process['startTicks'] != identity['startTicks']:
            raise RuntimeError('PID reused; sampling stopped')
        status = dict(line.split(':', 1) for line in (base / 'status').read_text().splitlines()
                      if ':' in line)
        row = {'timestampMs': round(time.time() * 1000), 'pid': args.pid, **process,
               **{key: status.get(key, '').strip()
                  for key in ('VmRSS', 'VmHWM', 'VmSize', 'RssAnon', 'RssFile', 'Threads')}}
        if args.ready_url and time.monotonic() >= next_ready:
            before = time.monotonic()
            try:
                with urllib.request.urlopen(args.ready_url, timeout=3) as response:
                    row['readiness'] = {'status': response.status, 'body': json.load(response)}
            except urllib.error.HTTPError as error:
                row['readiness'] = {'status': error.code, 'body': error.read(65536).decode()}
            except Exception as error:
                row['readiness'] = {'error': str(error)}
            row['readinessElapsedMs'] = round((time.monotonic() - before) * 1000)
            next_ready = time.monotonic() + 10
        print(json.dumps(row), flush=True)
    except (FileNotFoundError, RuntimeError) as error:
        print(json.dumps({'timestampMs': round(time.time() * 1000), 'pid': args.pid,
                          'stopped': str(error)}), flush=True)
        break
    time.sleep(min(args.interval, max(0, args.seconds - (time.monotonic() - start))))
