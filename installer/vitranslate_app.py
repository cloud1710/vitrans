"""PyInstaller entry of ViTranslate.exe, the installed helper; the logic lives in vitranslate.desktop."""
import sys

from vitranslate.desktop import main

if __name__ == "__main__":
    sys.exit(main())
