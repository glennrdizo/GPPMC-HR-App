"""GD Prime HR: biometric sync for ZKTeco terminals (TX628 and other models that talk on port 4370).

Runs on a computer at the site, on the same network as the terminals. Every run it reads the attendance log from each
terminal in config.ini and sends the punches from the last few days to the HR website with the site key HR created
under Timekeeping > Biometric import. The website keeps each punch once, so sending a punch again does no harm, and a
computer that was off catches up on its next run. Nothing is deleted from the terminals.

    python bio_sync.py            run once (Task Scheduler runs this every 5 minutes)
    python bio_sync.py --test     check the terminals and the key without sending punches
    python bio_sync.py --days 31  send a longer history once (first setup, or after a long outage)
"""
import argparse, configparser, datetime as dt, json, logging, os, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION = "1.0"
log = logging.getLogger("bio-sync")


def load_config(path):
    c = configparser.ConfigParser()
    if not c.read(path, encoding="utf-8"):
        sys.exit(f"Missing {path}. Copy config.example.ini to config.ini and fill it in.")
    s = c["server"]
    devices = []
    for name in c.sections():
        if name.lower().startswith("device"):
            d = c[name]
            devices.append({"name": d.get("name", name), "ip": d["ip"].strip(), "port": d.getint("port", 4370),
                            "password": d.getint("password", 0), "timeout": d.getint("timeout", 15)})
    if not devices:
        sys.exit("No [device ...] sections in config.ini.")
    return {"url": s["url"].rstrip("/"), "apikey": s["apikey"].strip(), "site_key": s["site_key"].strip(),
            "days": s.getint("days", 3)}, devices


def read_device(dev, since):
    from zk import ZK  # pip install pyzk
    zk = ZK(dev["ip"], port=dev["port"], timeout=dev["timeout"], password=dev["password"], force_udp=False, ommit_ping=True)
    conn = zk.connect()
    try:
        sn = ""
        try:
            sn = conn.get_serialnumber() or ""
        except Exception:
            pass
        rows = conn.get_attendance() or []
    finally:
        conn.disconnect()
    punches = [{"id": str(a.user_id).strip(), "t": a.timestamp.strftime("%Y-%m-%d %H:%M:%S"), "s": str(a.punch)}
               for a in rows if a.timestamp and a.timestamp >= since]
    return sn, punches, len(rows)


def push(cfg, dev, sn, punches):
    """Send in batches; returns totals and the device user ids the website couldn't match to an employee."""
    saved, unmatched = 0, set()
    for i in range(0, max(len(punches), 1), 2000):
        body = json.dumps({"p_key": cfg["site_key"], "p_device": {"name": dev["name"], "ip": dev["ip"], "sn": sn, "agent": VERSION},
                           "p_punches": punches[i:i + 2000]}).encode()
        req = urllib.request.Request(cfg["url"] + "/rest/v1/rpc/hr_bio_push", data=body, method="POST",
                                     headers={"apikey": cfg["apikey"], "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            if "bad_key" in msg:
                raise SystemExit("The site key was refused. Ask HR for a new key (Timekeeping > Biometric import) and put it in config.ini.")
            raise RuntimeError(f"Website answered {e.code}: {msg}")
        saved += out.get("saved", 0)
        unmatched.update(out.get("unmatched", []))
    return saved, sorted(unmatched)


def main():
    ap = argparse.ArgumentParser(description="Send ZKTeco punches to the GD Prime HR website.")
    ap.add_argument("--config", default=os.path.join(HERE, "config.ini"))
    ap.add_argument("--days", type=int, help="how many days back to send (default from config.ini, normally 3)")
    ap.add_argument("--test", action="store_true", help="read the terminals and check the key, send nothing")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s",
                        handlers=[logging.FileHandler(os.path.join(HERE, "bio_sync.log"), encoding="utf-8"), logging.StreamHandler()])
    cfg, devices = load_config(a.config)
    since = dt.datetime.now() - dt.timedelta(days=a.days or cfg["days"])
    failed = 0
    for dev in devices:
        try:
            sn, punches, total = read_device(dev, since)
            if a.test:
                saved, unmatched = push(cfg, dev, sn, [])
                log.info("%s (%s, serial %s): connected, %d punches on the terminal, %d in range. Website key OK.", dev["name"], dev["ip"], sn or "?", total, len(punches))
                continue
            saved, unmatched = push(cfg, dev, sn, punches)
            log.info("%s (%s): sent %d punches, website kept %d.%s", dev["name"], dev["ip"], len(punches), saved,
                     f" Not linked to an employee yet: device user ids {', '.join(unmatched[:20])}." if unmatched else "")
        except SystemExit:
            raise
        except Exception as e:  # one terminal being off must not stop the others
            failed += 1
            log.error("%s (%s): %s", dev["name"], dev["ip"], e)
    sys.exit(1 if failed == len(devices) else 0)


if __name__ == "__main__":
    main()
