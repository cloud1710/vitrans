"""python -m vitranslate: start the helper on the first free port of config.PORTS (127.0.0.1 only)."""
import socket
import sys

import uvicorn

from .config import PORTS
from .server import create_app


def bind_free_socket(host="127.0.0.1", ports=PORTS):
    """Bind once and keep the socket: a port already held (even on 0.0.0.0) is detected, not raced."""
    for port in ports:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if sys.platform == "win32":
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            sock.bind((host, port))
            return sock
        except OSError:
            sock.close()
    raise SystemExit("No free port in %s" % (tuple(ports),))


def main():
    sock = bind_free_socket()
    print("ViTranslate helper: http://127.0.0.1:%d/" % sock.getsockname()[1], flush=True)
    config = uvicorn.Config(create_app(), log_level="warning", timeout_graceful_shutdown=3)
    uvicorn.Server(config).run(sockets=[sock])


if __name__ == "__main__":
    main()
